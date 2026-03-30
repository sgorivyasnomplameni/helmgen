import io
import os
import shutil
import tarfile
import tempfile

from jinja2 import Environment, BaseLoader

CHART_YAML_TEMPLATE = """\
apiVersion: v2
name: {{ name }}
description: {{ description or 'A Helm chart' }}
type: application
version: {{ chart_version }}
appVersion: "{{ app_version }}"
"""

VALUES_YAML_TEMPLATE = """\
replicaCount: 1

image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: ""

service:
  type: ClusterIP
  port: 80

resources: {}
"""

_env = Environment(loader=BaseLoader())

# ── Private renderers (all use Python f-string escaping: {{{{ → {{, }}}} → }}) ──

def _render_deployment(name: str) -> str:
    return f"""\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{{{ include "{name}.fullname" . }}}}
  labels:
    {{{{- include "{name}.labels" . | nindent 4 }}}}
spec:
  replicas: {{{{ .Values.replicaCount }}}}
  selector:
    matchLabels:
      {{{{- include "{name}.selectorLabels" . | nindent 6 }}}}
  template:
    metadata:
      labels:
        {{{{- include "{name}.selectorLabels" . | nindent 8 }}}}
    spec:
      containers:
        - name: {{{{ .Chart.Name }}}}
          image: "{{{{ .Values.image.repository }}}}:{{{{ .Values.image.tag | default .Chart.AppVersion }}}}"
          imagePullPolicy: {{{{ .Values.image.pullPolicy }}}}
          ports:
            - name: http
              containerPort: {{{{ .Values.containerPort }}}}
              protocol: TCP
          resources:
            {{{{- toYaml .Values.resources | nindent 12 }}}}
"""


def _render_service(name: str) -> str:
    return f"""\
apiVersion: v1
kind: Service
metadata:
  name: {{{{ include "{name}.fullname" . }}}}
  labels:
    {{{{- include "{name}.labels" . | nindent 4 }}}}
spec:
  type: {{{{ .Values.service.type }}}}
  ports:
    - port: {{{{ .Values.service.port }}}}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{{{- include "{name}.selectorLabels" . | nindent 4 }}}}
"""


def _render_ingress(name: str) -> str:
    return f"""\
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{{{ include "{name}.fullname" . }}}}
  labels:
    {{{{- include "{name}.labels" . | nindent 4 }}}}
spec:
  rules:
    - host: {{{{ .Values.ingress.host | quote }}}}
      http:
        paths:
          - path: {{{{ .Values.ingress.path }}}}
            pathType: Prefix
            backend:
              service:
                name: {{{{ include "{name}.fullname" . }}}}
                port:
                  number: {{{{ .Values.service.port }}}}
"""


def _render_helpers(name: str) -> str:
    return f"""\
{{{{/*
Expand the name of the chart.
*/}}}}
{{{{- define "{name}.name" -}}}}
{{{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}}}
{{{{- end }}}}

{{{{/*
Create a default fully qualified app name.
*/}}}}
{{{{- define "{name}.fullname" -}}}}
{{{{- if .Values.fullnameOverride }}}}
{{{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}}}
{{{{- else }}}}
{{{{- $name := default .Chart.Name .Values.nameOverride }}}}
{{{{- if contains $name .Release.Name }}}}
{{{{- .Release.Name | trunc 63 | trimSuffix "-" }}}}
{{{{- else }}}}
{{{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}}}
{{{{- end }}}}
{{{{- end }}}}
{{{{- end }}}}

{{{{/*
Chart label.
*/}}}}
{{{{- define "{name}.chart" -}}}}
{{{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}}}
{{{{- end }}}}

{{{{/*
Common labels
*/}}}}
{{{{- define "{name}.labels" -}}}}
helm.sh/chart: {{{{ include "{name}.chart" . }}}}
{{{{ include "{name}.selectorLabels" . }}}}
{{{{- if .Chart.AppVersion }}}}
app.kubernetes.io/version: {{{{ .Chart.AppVersion | quote }}}}
{{{{- end }}}}
app.kubernetes.io/managed-by: {{{{ .Release.Service }}}}
{{{{- end }}}}

{{{{/*
Selector labels
*/}}}}
{{{{- define "{name}.selectorLabels" -}}}}
app.kubernetes.io/name: {{{{ include "{name}.name" . }}}}
app.kubernetes.io/instance: {{{{ .Release.Name }}}}
{{{{- end }}}}
"""


# ── Private parser ──────────────────────────────────────────────────────────────

def _parse_generated_yaml(generated_yaml: str) -> dict[str, str]:
    """Split the multi-doc bundle back into a {path: content} mapping."""
    sections: dict[str, str] = {}
    for block in generated_yaml.split("\n---\n"):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        if lines and lines[0].startswith("#"):
            path = lines[0][1:].strip()   # e.g. "Chart.yaml" or "templates/deployment.yaml"
            content = "\n".join(lines[1:]).lstrip("\n")
            sections[path] = content
    return sections


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_chart(chart) -> str:
    """Return a multi-document YAML bundle (Chart.yaml / values.yaml / deployment.yaml)."""
    ctx = {
        "name": chart.name,
        "description": chart.description,
        "chart_version": chart.chart_version,
        "app_version": chart.app_version,
    }
    chart_yaml = _env.from_string(CHART_YAML_TEMPLATE).render(**ctx)
    values_yaml = chart.values_yaml or VALUES_YAML_TEMPLATE
    deployment_yaml = _render_deployment(chart.name)

    return "\n---\n".join([
        f"# Chart.yaml\n{chart_yaml}",
        f"# values.yaml\n{values_yaml}",
        f"# templates/deployment.yaml\n{deployment_yaml}",
    ])


def build_chart_archive(chart) -> bytes:
    """
    Build a .tgz archive with a complete Helm chart directory structure:

        <name>/
          Chart.yaml
          values.yaml
          templates/
            _helpers.tpl
            deployment.yaml
            service.yaml
            ingress.yaml   (only when 'ingress:' found in values)
    """
    name = chart.name or "chart"
    sections = _parse_generated_yaml(chart.generated_yaml or "")

    chart_yaml_content    = sections.get("Chart.yaml", "")
    values_yaml_content   = sections.get("values.yaml", VALUES_YAML_TEMPLATE)
    deployment_content    = sections.get("templates/deployment.yaml", _render_deployment(name))

    # Include ingress.yaml when values contain an ingress block
    combined_values = (chart.values_yaml or "") + values_yaml_content
    ingress_enabled = "ingress:" in combined_values

    tmpdir = tempfile.mkdtemp()
    try:
        chart_dir     = os.path.join(tmpdir, name)
        templates_dir = os.path.join(chart_dir, "templates")
        os.makedirs(templates_dir)

        def write(path: str, content: str) -> None:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(content)

        write(os.path.join(chart_dir,     "Chart.yaml"),           chart_yaml_content)
        write(os.path.join(chart_dir,     "values.yaml"),          values_yaml_content)
        write(os.path.join(templates_dir, "_helpers.tpl"),         _render_helpers(name))
        write(os.path.join(templates_dir, "deployment.yaml"),      deployment_content)
        write(os.path.join(templates_dir, "service.yaml"),         _render_service(name))
        if ingress_enabled:
            write(os.path.join(templates_dir, "ingress.yaml"),     _render_ingress(name))

        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(chart_dir, arcname=name)

        return buf.getvalue()
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
