from types import SimpleNamespace

from app.services import chart_validator
from app.services.chart_validator import validate_chart
from app.services.helm_generator import generate_chart


class _Chart:
    name = "demo"
    chart_version = "0.1.0"
    app_version = "1.0.0"
    description = "Demo chart"
    values_yaml: str | None = None
    generated_yaml: str | None = None


def test_validate_successful_chart(monkeypatch) -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: Deployment

replicaCount: 2

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "1.0.0"

containerPort: 8080

service:
  enabled: true
  type: ClusterIP
  port: 8080

ingress:
  enabled: false

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
"""
    chart.generated_yaml = generate_chart(chart)

    monkeypatch.setattr(chart_validator, "_resolve_helm_binary", lambda: None)

    result = validate_chart(chart)

    assert result.valid is True
    assert result.errors == []
    assert any("Архив собран успешно" in item for item in result.checks)
    assert result.engine == "builtin"


def test_validate_warns_about_latest_and_missing_limits() -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: Deployment

replicaCount: 1

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "latest"

containerPort: 8080

service:
  enabled: true
  type: ClusterIP
  port: 8080

ingress:
  enabled: false

resources: {}
"""
    chart.generated_yaml = generate_chart(chart)

    result = validate_chart(chart)

    assert result.valid is True
    assert any("latest" in item for item in result.warnings)
    assert any("Resource limits" in item for item in result.warnings)


def test_validate_rejects_daemonset_with_replicas() -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: DaemonSet

replicaCount: 1

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "1.0.0"

containerPort: 9100

service:
  enabled: false
  type: ClusterIP
  port: 9100

ingress:
  enabled: false

resources: {}
"""
    chart.generated_yaml = """\
# Chart.yaml
apiVersion: v2
name: demo
---
# values.yaml
service:
  enabled: false
---
# templates/deployment.yaml
apiVersion: apps/v1
kind: DaemonSet
spec:
  replicas: 1
"""

    result = validate_chart(chart)

    assert result.valid is False
    assert any("replicas" in item for item in result.errors)


def test_validate_requires_ingress_host() -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: Deployment

replicaCount: 2

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "1.0.0"

containerPort: 8080

service:
  enabled: true
  type: ClusterIP
  port: 8080

ingress:
  enabled: true

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
"""
    chart.generated_yaml = generate_chart(chart)

    result = validate_chart(chart)

    assert result.valid is False
    assert any("host" in item for item in result.errors)


def test_validate_uses_helm_lint_when_available(monkeypatch) -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: Deployment

replicaCount: 2

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "1.0.0"

containerPort: 8080

service:
  enabled: true
  type: ClusterIP
  port: 8080

ingress:
  enabled: false

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
"""
    chart.generated_yaml = generate_chart(chart)

    monkeypatch.setattr(chart_validator, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_validator.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="==> Linting /tmp/demo\n1 chart(s) linted, 0 chart(s) failed\n",
            stderr="",
        ),
    )

    result = validate_chart(chart)

    assert result.valid is True
    assert result.engine == "helm_lint"
    assert any("helm lint" in item for item in result.checks)


def test_validate_falls_back_when_helm_is_unavailable(monkeypatch) -> None:
    chart = _Chart()
    chart.values_yaml = """\
workload:
  type: Deployment

replicaCount: 2

image:
  repository: demo/app
  pullPolicy: IfNotPresent
  tag: "1.0.0"

containerPort: 8080

service:
  enabled: true
  type: ClusterIP
  port: 8080

ingress:
  enabled: false

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
"""
    chart.generated_yaml = generate_chart(chart)

    monkeypatch.setattr(chart_validator, "_resolve_helm_binary", lambda: None)

    result = validate_chart(chart)

    assert result.valid is True
    assert result.engine == "builtin"
    assert any("helm не найден" in item for item in result.warnings)
