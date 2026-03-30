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


def _render_deployment(name: str) -> str:
    # Python f-string: {{ → {, }} → }, {{{{ → {{, }}}} → }}
    # This produces valid Helm template syntax without Jinja2 parsing it.
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
"""


def generate_chart(chart) -> str:
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
