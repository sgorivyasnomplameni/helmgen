import io
import tarfile

import pytest

from app.services.helm_generator import build_chart_archive, generate_chart


class _Chart:
    """Minimal chart object that satisfies build_chart_archive / generate_chart."""
    name = "myapp"
    chart_version = "0.1.0"
    app_version = "1.0.0"
    description = "Test chart"
    values_yaml: str | None = None
    generated_yaml: str | None = None


@pytest.fixture
def chart() -> _Chart:
    c = _Chart()
    c.generated_yaml = generate_chart(c)
    return c


@pytest.fixture
def chart_with_ingress() -> _Chart:
    c = _Chart()
    c.values_yaml = (
        "ingress:\n"
        "  host: myapp.example.com\n"
        "  path: /\n"
    )
    c.generated_yaml = generate_chart(c)
    return c


# ── helpers ────────────────────────────────────────────────────────────────────

def _open(archive_bytes: bytes) -> tarfile.TarFile:
    return tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz")


def _names(archive_bytes: bytes) -> list[str]:
    with _open(archive_bytes) as tar:
        return tar.getnames()


def _read(archive_bytes: bytes, path: str) -> str:
    with _open(archive_bytes) as tar:
        member = tar.extractfile(path)
        assert member is not None, f"{path} not found or not a file"
        return member.read().decode("utf-8")


# ── structure ─────────────────────────────────────────────────────────────────

def test_archive_returns_bytes(chart: _Chart) -> None:
    result = build_chart_archive(chart)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_archive_is_valid_tgz(chart: _Chart) -> None:
    archive = build_chart_archive(chart)
    assert tarfile.is_tarfile(io.BytesIO(archive))


def test_required_files_present(chart: _Chart) -> None:
    names = _names(build_chart_archive(chart))
    assert "myapp/Chart.yaml"                  in names
    assert "myapp/values.yaml"                 in names
    assert "myapp/templates/deployment.yaml"   in names
    assert "myapp/templates/service.yaml"      in names
    assert "myapp/templates/_helpers.tpl"      in names


def test_ingress_absent_by_default(chart: _Chart) -> None:
    names = _names(build_chart_archive(chart))
    assert "myapp/templates/ingress.yaml" not in names


def test_ingress_present_when_values_contain_ingress(chart_with_ingress: _Chart) -> None:
    names = _names(build_chart_archive(chart_with_ingress))
    assert "myapp/templates/ingress.yaml" in names


def test_service_absent_when_disabled_in_values() -> None:
    c = _Chart()
    c.values_yaml = (
        "workload:\n"
        "  type: Deployment\n"
        "replicaCount: 1\n"
        "service:\n"
        "  enabled: false\n"
        "  type: ClusterIP\n"
        "  port: 80\n"
        "ingress:\n"
        "  enabled: false\n"
        "resources: {}\n"
    )
    c.generated_yaml = generate_chart(c)

    names = _names(build_chart_archive(c))
    assert "myapp/templates/service.yaml" not in names


def test_daemonset_deployment_template_uses_daemonset_kind() -> None:
    c = _Chart()
    c.values_yaml = (
        "workload:\n"
        "  type: DaemonSet\n"
        "replicaCount: 1\n"
        "image:\n"
        "  repository: nginx\n"
        "  pullPolicy: IfNotPresent\n"
        '  tag: ""\n'
        "service:\n"
        "  enabled: true\n"
        "  type: ClusterIP\n"
        "  port: 80\n"
        "ingress:\n"
        "  enabled: false\n"
        "resources: {}\n"
    )
    c.generated_yaml = generate_chart(c)

    content = _read(build_chart_archive(c), "myapp/templates/deployment.yaml")
    assert "kind: DaemonSet" in content
    assert "replicas:" not in content


def test_ingress_absent_when_disabled_even_if_block_exists() -> None:
    c = _Chart()
    c.values_yaml = (
        "workload:\n"
        "  type: Deployment\n"
        "replicaCount: 1\n"
        "image:\n"
        "  repository: nginx\n"
        "  pullPolicy: IfNotPresent\n"
        '  tag: ""\n'
        "service:\n"
        "  enabled: true\n"
        "  type: ClusterIP\n"
        "  port: 80\n"
        "ingress:\n"
        "  enabled: false\n"
        '  host: "myapp.example.com"\n'
        '  path: "/"\n'
        "resources: {}\n"
    )
    c.generated_yaml = generate_chart(c)

    names = _names(build_chart_archive(c))
    assert "myapp/templates/ingress.yaml" not in names


# ── Chart.yaml content ────────────────────────────────────────────────────────

def test_chart_yaml_name(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/Chart.yaml")
    assert "name: myapp" in content


def test_chart_yaml_version(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/Chart.yaml")
    assert "version: 0.1.0" in content


def test_chart_yaml_app_version(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/Chart.yaml")
    assert 'appVersion: "1.0.0"' in content


def test_chart_yaml_api_version(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/Chart.yaml")
    assert "apiVersion: v2" in content


# ── deployment.yaml content ────────────────────────────────────────────────────

def test_deployment_yaml_kind(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/deployment.yaml")
    assert "kind: Deployment" in content


def test_deployment_yaml_references_chart_name(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/deployment.yaml")
    assert "myapp.fullname" in content


# ── service.yaml content ───────────────────────────────────────────────────────

def test_service_yaml_kind(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/service.yaml")
    assert "kind: Service" in content


def test_service_yaml_references_chart_name(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/service.yaml")
    assert "myapp.fullname" in content


# ── _helpers.tpl content ──────────────────────────────────────────────────────

def test_helpers_defines_fullname(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/_helpers.tpl")
    assert f'"myapp.fullname"' in content


def test_helpers_defines_labels(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/_helpers.tpl")
    assert f'"myapp.labels"' in content


def test_helpers_defines_selector_labels(chart: _Chart) -> None:
    content = _read(build_chart_archive(chart), "myapp/templates/_helpers.tpl")
    assert f'"myapp.selectorLabels"' in content


# ── ingress.yaml content ───────────────────────────────────────────────────────

def test_ingress_yaml_kind(chart_with_ingress: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_ingress), "myapp/templates/ingress.yaml")
    assert "kind: Ingress" in content


def test_ingress_yaml_api_version(chart_with_ingress: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_ingress), "myapp/templates/ingress.yaml")
    assert "networking.k8s.io/v1" in content


# ── user-provided values preserved in archive ─────────────────────────────────

USER_VALUES = """\
replicaCount: 5

image:
  repository: myregistry/myapp
  pullPolicy: IfNotPresent
  tag: "v2.5.0"

containerPort: 8080

service:
  type: LoadBalancer
  port: 8080

resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
"""


@pytest.fixture
def chart_with_user_values() -> _Chart:
    c = _Chart()
    c.app_version = "v2.5.0"
    c.values_yaml = USER_VALUES
    c.generated_yaml = generate_chart(c)
    return c


def test_user_values_replica_count(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "replicaCount: 5" in content


def test_user_values_image_repository(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "repository: myregistry/myapp" in content


def test_user_values_image_tag(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert 'tag: "v2.5.0"' in content


def test_user_values_service_port(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "port: 8080" in content


def test_user_values_service_type(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "type: LoadBalancer" in content


def test_user_values_resource_limits(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "cpu: 1000m" in content
    assert "memory: 1Gi" in content


def test_user_values_resource_requests(chart_with_user_values: _Chart) -> None:
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "cpu: 200m" in content
    assert "memory: 256Mi" in content


def test_chart_yaml_app_version_from_user(chart_with_user_values: _Chart) -> None:
    """appVersion in Chart.yaml must reflect the chart's app_version field."""
    content = _read(build_chart_archive(chart_with_user_values), "myapp/Chart.yaml")
    assert 'appVersion: "v2.5.0"' in content


def test_default_values_not_leaked_into_user_chart(chart_with_user_values: _Chart) -> None:
    """Default nginx image must not appear when user specified a custom image."""
    content = _read(build_chart_archive(chart_with_user_values), "myapp/values.yaml")
    assert "nginx" not in content


def test_fallback_to_values_yaml_field_when_bundle_missing() -> None:
    """If generated_yaml bundle has no values section, fall back to chart.values_yaml."""
    c = _Chart()
    c.values_yaml = USER_VALUES
    c.generated_yaml = "# Chart.yaml\napiVersion: v2\nname: myapp\n"  # no values section
    content = _read(build_chart_archive(c), "myapp/values.yaml")
    assert "replicaCount: 5" in content


# ── different chart name ───────────────────────────────────────────────────────

def test_archive_uses_chart_name_as_root_dir() -> None:
    c = _Chart()
    c.name = "awesome-service"
    c.generated_yaml = generate_chart(c)
    names = _names(build_chart_archive(c))
    assert any(n.startswith("awesome-service/") for n in names)
    assert not any(n.startswith("myapp/") for n in names)
