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


# ── different chart name ───────────────────────────────────────────────────────

def test_archive_uses_chart_name_as_root_dir() -> None:
    c = _Chart()
    c.name = "awesome-service"
    c.generated_yaml = generate_chart(c)
    names = _names(build_chart_archive(c))
    assert any(n.startswith("awesome-service/") for n in names)
    assert not any(n.startswith("myapp/") for n in names)
