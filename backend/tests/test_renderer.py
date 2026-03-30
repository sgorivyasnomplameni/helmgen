from types import SimpleNamespace

from app.services import chart_renderer
from app.services.chart_renderer import dry_run_deploy_chart, render_chart_template
from app.services.helm_generator import generate_chart


class _Chart:
    name = "demo"
    chart_version = "0.1.0"
    app_version = "1.0.0"
    description = "Demo chart"
    values_yaml: str | None = None
    generated_yaml: str | None = None


def _build_chart() -> _Chart:
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
    return chart


def test_template_requires_generated_chart() -> None:
    chart = _Chart()

    result = render_chart_template(chart)

    assert result.success is False
    assert any("сгенерировать" in item.lower() for item in result.errors)


def test_template_reports_missing_helm(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: None)

    result = render_chart_template(chart)

    assert result.success is False
    assert any("Helm CLI" in item for item in result.errors)


def test_template_returns_rendered_manifests(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="---\nkind: Deployment\nmetadata:\n  name: demo\n",
            stderr="",
        ),
    )

    result = render_chart_template(chart)

    assert result.success is True
    assert result.engine == "helm_template"
    assert "kind: Deployment" in result.rendered_manifests


def test_template_returns_helm_errors(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="Error: template: chart/templates/service.yaml: invalid",
        ),
    )

    result = render_chart_template(chart)

    assert result.success is False
    assert any("invalid" in item for item in result.errors)


def test_dry_run_reports_missing_helm(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: None)

    result = dry_run_deploy_chart(chart)

    assert result.success is False
    assert any("Helm CLI" in item for item in result.errors)


def test_dry_run_returns_output(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="Release \"demo-release\" has been upgraded. Happy Helming!",
            stderr="client-side dry run",
        ),
    )

    result = dry_run_deploy_chart(chart)

    assert result.success is True
    assert result.engine == "helm_dry_run"
    assert "Happy Helming" in result.output


def test_dry_run_returns_helm_errors(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="Error: release failed due to invalid values",
        ),
    )

    result = dry_run_deploy_chart(chart)

    assert result.success is False
    assert any("invalid values" in item for item in result.errors)
