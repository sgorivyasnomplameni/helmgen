from __future__ import annotations

import io
import os
import shutil
import subprocess
import tarfile
import tempfile

from pydantic import BaseModel

from app.services.helm_generator import build_chart_archive


class TemplateResult(BaseModel):
    success: bool
    rendered_manifests: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_template"
    summary: str = ""


class DryRunDeployResult(BaseModel):
    success: bool
    output: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_dry_run"
    summary: str = ""


def _resolve_helm_binary() -> str | None:
    helm_bin = os.getenv("HELM_BIN", "helm")
    resolved = shutil.which(helm_bin)
    if resolved:
        return resolved
    if os.path.sep in helm_bin and os.path.exists(helm_bin):
        return helm_bin
    return None


def _extract_chart(chart, target_dir: str) -> str:
    archive = build_chart_archive(chart)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        tar.extractall(path=target_dir)
    return os.path.join(target_dir, chart.name or "chart")


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _infrastructure_error(stderr: str) -> bool:
    infrastructure_error_markers = [
        "snap-confine",
        "Refusing to continue",
        "cannot create user data directory",
    ]
    return any(marker in stderr for marker in infrastructure_error_markers)


def render_chart_template(chart) -> TemplateResult:
    if not chart.generated_yaml:
        return TemplateResult(
            success=False,
            rendered_manifests="",
            errors=["Сначала необходимо сгенерировать Helm-чарт"],
            warnings=[],
            engine="helm_template",
            summary="Рендер невозможен без сгенерированного chart",
        )

    helm_bin = _resolve_helm_binary()
    if not helm_bin:
        return TemplateResult(
            success=False,
            rendered_manifests="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для включения helm template"],
            engine="helm_template",
            summary="Helm template недоступен без Helm CLI",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        chart_dir = _extract_chart(chart, tmpdir)
        release_name = f"{chart.name or 'chart'}-preview"

        try:
            completed = subprocess.run(
                [helm_bin, "template", release_name, chart_dir],
                capture_output=True,
                text=True,
                check=False,
                timeout=20,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return TemplateResult(
                success=False,
                rendered_manifests="",
                errors=[f"Не удалось выполнить helm template: {exc}"],
                warnings=[],
                engine="helm_template",
                summary="Рендер завершился ошибкой запуска Helm CLI",
            )

    stderr_lines = _clean_lines(completed.stderr)
    if _infrastructure_error(completed.stderr):
        return TemplateResult(
            success=False,
            rendered_manifests="",
            errors=["Helm CLI найден, но не смог запуститься в текущем окружении"],
            warnings=stderr_lines,
            engine="helm_template",
            summary="Рендер Helm template не выполнен из-за проблемы окружения",
        )

    if completed.returncode != 0:
        errors = stderr_lines or ["helm template завершился с ошибкой"]
        return TemplateResult(
            success=False,
            rendered_manifests=completed.stdout.strip(),
            errors=errors,
            warnings=[],
            engine="helm_template",
            summary="Helm template обнаружил проблему в рендере чарта",
        )

    warnings = stderr_lines
    return TemplateResult(
        success=True,
        rendered_manifests=completed.stdout.strip(),
        errors=[],
        warnings=warnings,
        engine="helm_template",
        summary="Рендер Kubernetes-манифестов выполнен через helm template",
    )


def dry_run_deploy_chart(chart) -> DryRunDeployResult:
    if not chart.generated_yaml:
        return DryRunDeployResult(
            success=False,
            output="",
            errors=["Сначала необходимо сгенерировать Helm-чарт"],
            warnings=[],
            engine="helm_dry_run",
            summary="Dry-run deploy невозможен без сгенерированного chart",
        )

    helm_bin = _resolve_helm_binary()
    if not helm_bin:
        return DryRunDeployResult(
            success=False,
            output="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для включения dry-run deploy"],
            engine="helm_dry_run",
            summary="Dry-run deploy недоступен без Helm CLI",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        chart_dir = _extract_chart(chart, tmpdir)
        release_name = f"{chart.name or 'chart'}-release"
        namespace = "helmgen-preview"

        try:
            completed = subprocess.run(
                [
                    helm_bin,
                    "upgrade",
                    "--install",
                    release_name,
                    chart_dir,
                    "--namespace",
                    namespace,
                    "--create-namespace",
                    "--dry-run=client",
                    "--debug",
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=25,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return DryRunDeployResult(
                success=False,
                output="",
                errors=[f"Не удалось выполнить dry-run deploy: {exc}"],
                warnings=[],
                engine="helm_dry_run",
                summary="Dry-run deploy завершился ошибкой запуска Helm CLI",
            )

    stderr_lines = _clean_lines(completed.stderr)
    if _infrastructure_error(completed.stderr):
        return DryRunDeployResult(
            success=False,
            output="",
            errors=["Helm CLI найден, но не смог запуститься в текущем окружении"],
            warnings=stderr_lines,
            engine="helm_dry_run",
            summary="Dry-run deploy не выполнен из-за проблемы окружения",
        )

    combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)
    if completed.returncode != 0:
        return DryRunDeployResult(
            success=False,
            output=combined_output,
            errors=stderr_lines or ["helm dry-run deploy завершился с ошибкой"],
            warnings=[],
            engine="helm_dry_run",
            summary="Helm dry-run deploy обнаружил проблему перед развёртыванием",
        )

    return DryRunDeployResult(
        success=True,
        output=combined_output,
        errors=[],
        warnings=[],
        engine="helm_dry_run",
        summary="Тестовое развёртывание выполнено через helm upgrade --install --dry-run=client",
    )
