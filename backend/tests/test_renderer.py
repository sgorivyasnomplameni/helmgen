from types import SimpleNamespace

from app.services import chart_renderer
from app.services.chart_renderer import (
    deploy_chart,
    dry_run_deploy_chart,
    get_cluster_status,
    monitor_release_chart,
    release_status_chart,
    render_chart_template,
    rollback_chart,
    uninstall_chart,
)
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


def test_deploy_reports_missing_helm(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: None)

    result = deploy_chart(chart, namespace="demo")

    assert result.success is False
    assert any("Helm CLI" in item for item in result.errors)


def test_deploy_returns_output(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout='Release "demo-release" has been upgraded. Happy Helming!',
            stderr="STATUS: deployed",
        ),
    )

    result = deploy_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert result.engine == "helm_deploy"
    assert result.status == "deployed"
    assert result.release_name == "demo-release"
    assert result.namespace == "demo"
    assert "Happy Helming" in result.output


def test_deploy_returns_helm_errors(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="Error: Kubernetes cluster unreachable",
        ),
    )

    result = deploy_chart(chart, namespace="demo")

    assert result.success is False
    assert result.status == "failed"
    assert any("cluster unreachable" in item.lower() for item in result.errors)


def test_release_status_returns_output(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout='NAME: demo-release\nSTATUS: deployed\nRESOURCES:\n==> v1/Service\nNAME   TYPE\ndemo   ClusterIP\n',
            stderr="",
        ),
    )

    result = release_status_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert result.engine == "helm_status"
    assert result.status == "deployed"
    assert result.release_name == "demo-release"
    assert result.namespace == "demo"
    assert "RESOURCES" in result.output


def test_release_status_falls_back_without_show_resources(monkeypatch) -> None:
    chart = _build_chart()
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        if "--show-resources" in args:
            return SimpleNamespace(returncode=1, stdout="", stderr="Error: unknown flag: --show-resources")
        return SimpleNamespace(returncode=0, stdout="NAME: demo-release\nSTATUS: deployed\n", stderr="")

    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(chart_renderer.subprocess, "run", fake_run)

    result = release_status_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert result.status == "deployed"
    assert len(calls) == 2
    assert calls[0][-1] == "--show-resources"
    assert "--show-resources" not in calls[1]


def test_monitor_release_returns_resources_and_events(monkeypatch) -> None:
    chart = _build_chart()

    def fake_run(args, **kwargs):
        if args[:2] == ["/usr/bin/helm", "status"]:
            return SimpleNamespace(returncode=0, stdout="NAME: demo-release\nSTATUS: deployed\n", stderr="")
        if args[:3] == ["/usr/bin/kubectl", "get", "all"]:
            return SimpleNamespace(returncode=0, stdout="pod/demo-abc   1/1   Running\nservice/demo   ClusterIP\n", stderr="")
        if args[:3] == ["/usr/bin/kubectl", "get", "events"]:
            return SimpleNamespace(returncode=0, stdout="Normal   Pulled   Successfully pulled image\n", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="unexpected command")

    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(chart_renderer, "_resolve_kubectl_binary", lambda: "/usr/bin/kubectl")
    monkeypatch.setattr(chart_renderer.subprocess, "run", fake_run)

    result = monitor_release_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert result.engine == "helm_status_kubectl"
    assert result.status == "deployed"
    assert "pod/demo-abc" in result.output
    assert "Successfully pulled image" in result.output


def test_monitor_release_warns_when_kubectl_missing(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(chart_renderer, "_resolve_kubectl_binary", lambda: None)
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="NAME: demo-release\nSTATUS: deployed\n", stderr=""),
    )

    result = monitor_release_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert any("kubectl" in item for item in result.warnings)
    assert "# helm status" in result.output


def test_rollback_returns_output(monkeypatch) -> None:
    chart = _build_chart()
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=0, stdout='Rollback was a success! Happy Helming!\n', stderr="")

    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(chart_renderer.subprocess, "run", fake_run)

    result = rollback_chart(chart, namespace="demo", release_name="demo-release", revision=2)

    assert result.success is True
    assert result.engine == "helm_rollback"
    assert result.status == "rolled_back"
    assert result.revision == 2
    assert calls[0][:4] == ["/usr/bin/helm", "rollback", "demo-release", "2"]
    assert "Happy Helming" in result.output


def test_rollback_returns_helm_errors(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout="", stderr="Error: release has no revision 9"),
    )

    result = rollback_chart(chart, namespace="demo", release_name="demo-release", revision=9)

    assert result.success is False
    assert result.status == "failed"
    assert any("revision 9" in item for item in result.errors)


def test_uninstall_reports_missing_helm(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: None)

    result = uninstall_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is False
    assert any("Helm CLI" in item for item in result.errors)


def test_uninstall_returns_output(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout='release "demo-release" uninstalled',
            stderr="",
        ),
    )

    result = uninstall_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is True
    assert result.engine == "helm_uninstall"
    assert result.release_name == "demo-release"
    assert result.namespace == "demo"
    assert "uninstalled" in result.output


def test_cluster_status_reports_missing_helm(monkeypatch, tmp_path) -> None:
    kubeconfig = tmp_path / "config"
    kubeconfig.write_text(
        """\
apiVersion: v1
clusters:
  - name: minikube
    cluster:
      server: https://127.0.0.1:8443
contexts:
  - name: minikube
    context:
      cluster: minikube
current-context: minikube
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("KUBECONFIG", str(kubeconfig))
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: None)

    result = get_cluster_status()

    assert result.reachable is False
    assert result.helm_available is False
    assert any("Helm CLI" in item for item in result.errors)


def test_cluster_status_reports_unreachable_cluster(monkeypatch, tmp_path) -> None:
    kubeconfig = tmp_path / "config"
    kubeconfig.write_text(
        """\
apiVersion: v1
clusters:
  - name: minikube
    cluster:
      server: https://192.168.49.2:8443
contexts:
  - name: minikube
    context:
      cluster: minikube
current-context: minikube
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("KUBECONFIG", str(kubeconfig))
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr='Error: Kubernetes cluster unreachable: Get "https://192.168.49.2:8443/version": i/o timeout',
        ),
    )

    result = get_cluster_status()

    assert result.reachable is False
    assert result.current_context == "minikube"
    assert result.cluster_server == "https://192.168.49.2:8443"
    assert any("cluster unreachable" in item.lower() for item in result.errors)


def test_cluster_status_returns_ready_when_cluster_is_reachable(monkeypatch, tmp_path) -> None:
    kubeconfig = tmp_path / "config"
    kubeconfig.write_text(
        """\
apiVersion: v1
clusters:
  - name: minikube
    cluster:
      server: https://127.0.0.1:8443
contexts:
  - name: minikube
    context:
      cluster: minikube
current-context: minikube
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("KUBECONFIG", str(kubeconfig))
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="NAME\tNAMESPACE",
            stderr="",
        ),
    )

    result = get_cluster_status()

    assert result.reachable is True
    assert result.helm_available is True
    assert result.current_context == "minikube"


def test_uninstall_returns_helm_errors(monkeypatch) -> None:
    chart = _build_chart()
    monkeypatch.setattr(chart_renderer, "_resolve_helm_binary", lambda: "/usr/bin/helm")
    monkeypatch.setattr(
        chart_renderer.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr='Error: uninstall: Release not loaded: demo-release: release: not found',
        ),
    )

    result = uninstall_chart(chart, namespace="demo", release_name="demo-release")

    assert result.success is False
    assert any("release: not found" in item.lower() for item in result.errors)
