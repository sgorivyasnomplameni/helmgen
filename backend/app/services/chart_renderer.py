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


class DeployResult(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str = ""
    engine: str = "helm_deploy"
    summary: str = ""


class ReleaseStatusResult(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str = ""
    engine: str = "helm_status"
    summary: str = ""


class MonitoringResult(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str = ""
    engine: str = "helm_status_kubectl"
    summary: str = ""


class RollbackResult(BaseModel):
    success: bool
    release_name: str
    namespace: str
    revision: int | None = None
    output: str
    errors: list[str]
    warnings: list[str]
    status: str = ""
    engine: str = "helm_rollback"
    summary: str = ""


class UninstallResult(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_uninstall"
    summary: str = ""


class ClusterStatusResult(BaseModel):
    helm_available: bool
    helm_binary: str | None
    kubeconfig_path: str
    kubeconfig_present: bool
    current_context: str | None
    cluster_name: str | None
    cluster_server: str | None
    reachable: bool
    errors: list[str]
    warnings: list[str]
    summary: str = ""


def _resolve_helm_binary() -> str | None:
    helm_bin = os.getenv("HELM_BIN", "helm")
    resolved = shutil.which(helm_bin)
    if resolved:
        return resolved
    if os.path.sep in helm_bin and os.path.exists(helm_bin):
        return helm_bin
    return None


def _resolve_kubectl_binary() -> str | None:
    kubectl_bin = os.getenv("KUBECTL_BIN", "kubectl")
    resolved = shutil.which(kubectl_bin)
    if resolved:
        return resolved
    if os.path.sep in kubectl_bin and os.path.exists(kubectl_bin):
        return kubectl_bin
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


def _resolve_kubeconfig_path() -> str:
    return os.path.expanduser(os.getenv("KUBECONFIG", "~/.kube/config"))


def _load_kubeconfig_metadata(path: str) -> tuple[str | None, str | None, str | None]:
    with open(path, "r", encoding="utf-8") as stream:
        lines = stream.readlines()

    current_context = None
    section = None
    current_list_item_name: str | None = None
    current_cluster_name: str | None = None
    current_server: str | None = None
    current_context_name: str | None = None
    current_context_cluster: str | None = None
    clusters: dict[str, str | None] = {}
    contexts: dict[str, str | None] = {}

    for raw_line in lines:
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("current-context:"):
            current_context = stripped.partition(":")[2].strip()
            continue

        if stripped in {"clusters:", "contexts:"}:
            if section == "clusters" and current_list_item_name:
                clusters[current_list_item_name] = current_server
            if section == "contexts" and current_list_item_name:
                contexts[current_list_item_name] = current_context_cluster
            section = stripped[:-1]
            current_list_item_name = None
            current_cluster_name = None
            current_server = None
            current_context_name = None
            current_context_cluster = None
            continue

        if indent == 0 and stripped.endswith(":") and not stripped.startswith("- "):
            if section == "clusters" and current_list_item_name:
                clusters[current_list_item_name] = current_server
            if section == "contexts" and current_list_item_name:
                contexts[current_list_item_name] = current_context_cluster
            section = None
            current_list_item_name = None
            current_server = None
            current_context_cluster = None
            continue

        if section == "clusters":
            if indent in {0, 2} and (stripped.startswith("- cluster:") or stripped.startswith("- name:")):
                if current_list_item_name:
                    clusters[current_list_item_name] = current_server
                current_list_item_name = None
                current_server = None
                if stripped.startswith("- name:"):
                    current_list_item_name = stripped.partition(":")[2].strip()
                continue
            if indent in {2, 4} and stripped.startswith("name:"):
                current_list_item_name = stripped.partition(":")[2].strip()
                continue
            if indent in {2, 4} and stripped.startswith("cluster:"):
                continue
            if indent in {4, 6} and stripped.startswith("server:"):
                current_server = stripped.partition(":")[2].strip()
                continue
            continue

        if section == "contexts":
            if indent in {0, 2} and (stripped.startswith("- context:") or stripped.startswith("- name:")):
                if current_list_item_name:
                    contexts[current_list_item_name] = current_context_cluster
                current_list_item_name = None
                current_context_cluster = None
                if stripped.startswith("- name:"):
                    current_list_item_name = stripped.partition(":")[2].strip()
                continue
            if indent in {2, 4} and stripped.startswith("name:"):
                current_list_item_name = stripped.partition(":")[2].strip()
                continue
            if indent in {2, 4} and stripped.startswith("context:"):
                continue
            if indent in {4, 6} and stripped.startswith("cluster:"):
                current_context_cluster = stripped.partition(":")[2].strip()
                continue
            continue

    if section == "clusters" and current_list_item_name:
        clusters[current_list_item_name] = current_server
    if section == "contexts" and current_list_item_name:
        contexts[current_list_item_name] = current_context_cluster

    cluster_name = contexts.get(current_context)
    cluster_server = clusters.get(cluster_name) if cluster_name else None
    return current_context, cluster_name, cluster_server


def get_cluster_status() -> ClusterStatusResult:
    helm_bin = _resolve_helm_binary()
    kubeconfig_path = _resolve_kubeconfig_path()
    kubeconfig_present = os.path.exists(kubeconfig_path)
    current_context = None
    cluster_name = None
    cluster_server = None
    errors: list[str] = []
    warnings: list[str] = []

    if not helm_bin:
        errors.append("Helm CLI не найден в окружении backend.")

    if not kubeconfig_present:
        errors.append(f"Kubeconfig не найден по пути {kubeconfig_path}.")
    else:
        try:
            current_context, cluster_name, cluster_server = _load_kubeconfig_metadata(kubeconfig_path)
            if not current_context:
                warnings.append("В kubeconfig не указан current-context.")
            if current_context and not cluster_name:
                warnings.append(f"Для context {current_context} не найден cluster.")
            if cluster_name and not cluster_server:
                warnings.append(f"Для cluster {cluster_name} не найден server.")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Не удалось прочитать kubeconfig: {exc}")

    if not helm_bin or not kubeconfig_present or errors:
        summary = "Подключение к Kubernetes не готово."
        return ClusterStatusResult(
            helm_available=bool(helm_bin),
            helm_binary=helm_bin,
            kubeconfig_path=kubeconfig_path,
            kubeconfig_present=kubeconfig_present,
            current_context=current_context,
            cluster_name=cluster_name,
            cluster_server=cluster_server,
            reachable=False,
            errors=errors,
            warnings=warnings,
            summary=summary,
        )

    try:
        completed = subprocess.run(
            [helm_bin, "list", "--all-namespaces"],
            capture_output=True,
            text=True,
            check=False,
            timeout=8,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return ClusterStatusResult(
            helm_available=True,
            helm_binary=helm_bin,
            kubeconfig_path=kubeconfig_path,
            kubeconfig_present=True,
            current_context=current_context,
            cluster_name=cluster_name,
            cluster_server=cluster_server,
            reachable=False,
            errors=[f"Не удалось проверить доступ к кластеру: {exc}"],
            warnings=warnings,
            summary="Backend видит kubeconfig, но не смог проверить доступ к кластеру.",
        )

    stderr_lines = _clean_lines(completed.stderr)
    if completed.returncode != 0:
        summary = "Backend не может подключиться к Kubernetes API."
        joined_errors = " ".join(stderr_lines).lower()
        if "timed out" in joined_errors or "i/o timeout" in joined_errors:
            server_hint = f" по адресу {cluster_server}" if cluster_server else ""
            summary = f"Backend не может достучаться до Kubernetes API{server_hint}."
        elif "cluster unreachable" in joined_errors:
            summary = "Backend видит kubeconfig, но cluster unreachable для Helm CLI."
        return ClusterStatusResult(
            helm_available=True,
            helm_binary=helm_bin,
            kubeconfig_path=kubeconfig_path,
            kubeconfig_present=True,
            current_context=current_context,
            cluster_name=cluster_name,
            cluster_server=cluster_server,
            reachable=False,
            errors=stderr_lines or ["Kubernetes API недоступен для backend."],
            warnings=warnings,
            summary=summary,
        )

    return ClusterStatusResult(
        helm_available=True,
        helm_binary=helm_bin,
        kubeconfig_path=kubeconfig_path,
        kubeconfig_present=True,
        current_context=current_context,
        cluster_name=cluster_name,
        cluster_server=cluster_server,
        reachable=True,
        errors=[],
        warnings=warnings + stderr_lines,
        summary="Backend подключён к Kubernetes и готов к dry-run и deploy.",
    )


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


def deploy_chart(chart, namespace: str, release_name: str | None = None) -> DeployResult:
    if not chart.generated_yaml:
        return DeployResult(
            success=False,
            release_name=release_name or chart.name or "chart",
            namespace=namespace,
            output="",
            errors=["Сначала необходимо сгенерировать Helm-чарт"],
            warnings=[],
            status="failed",
            engine="helm_deploy",
            summary="Развёртывание невозможно без сгенерированного chart",
        )

    helm_bin = _resolve_helm_binary()
    final_release_name = release_name or f"{chart.name or 'chart'}-release"
    if not helm_bin:
        return DeployResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для включения реального deploy"],
            status="failed",
            engine="helm_deploy",
            summary="Deploy недоступен без Helm CLI",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        chart_dir = _extract_chart(chart, tmpdir)

        try:
            completed = subprocess.run(
                [
                    helm_bin,
                    "upgrade",
                    "--install",
                    final_release_name,
                    chart_dir,
                    "--namespace",
                    namespace,
                    "--create-namespace",
                    "--wait",
                    "--timeout",
                    "120s",
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=140,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return DeployResult(
                success=False,
                release_name=final_release_name,
                namespace=namespace,
                output="",
                errors=[f"Не удалось выполнить deploy: {exc}"],
                warnings=[],
                status="failed",
                engine="helm_deploy",
                summary="Deploy завершился ошибкой запуска Helm CLI",
            )

    stderr_lines = _clean_lines(completed.stderr)
    if _infrastructure_error(completed.stderr):
        return DeployResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=["Helm CLI найден, но не смог запуститься в текущем окружении"],
            warnings=stderr_lines,
            status="failed",
            engine="helm_deploy",
            summary="Deploy не выполнен из-за проблемы окружения",
        )

    combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)
    if completed.returncode != 0:
        return DeployResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output=combined_output,
            errors=stderr_lines or ["helm deploy завершился с ошибкой"],
            warnings=[],
            status="failed",
            engine="helm_deploy",
            summary="Helm deploy завершился с ошибкой",
        )

    return DeployResult(
        success=True,
        release_name=final_release_name,
        namespace=namespace,
        output=combined_output,
        errors=[],
        warnings=stderr_lines,
        status="deployed",
        engine="helm_deploy",
        summary="Развёртывание выполнено через helm upgrade --install",
    )


def release_status_chart(chart, namespace: str, release_name: str | None = None) -> ReleaseStatusResult:
    helm_bin = _resolve_helm_binary()
    final_release_name = release_name or getattr(chart, "deployed_release_name", None) or f"{chart.name or 'chart'}-release"
    if not helm_bin:
        return ReleaseStatusResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для просмотра статуса release"],
            status="unknown",
            engine="helm_status",
            summary="Статус release недоступен без Helm CLI",
        )

    command = [
        helm_bin,
        "status",
        final_release_name,
        "--namespace",
        namespace,
        "--show-resources",
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=40,
        )
        if completed.returncode != 0 and "unknown flag: --show-resources" in completed.stderr:
            completed = subprocess.run(
                command[:-1],
                capture_output=True,
                text=True,
                check=False,
                timeout=40,
            )
    except (OSError, subprocess.SubprocessError) as exc:
        return ReleaseStatusResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=[f"Не удалось получить статус release: {exc}"],
            warnings=[],
            status="unknown",
            engine="helm_status",
            summary="Просмотр статуса release завершился ошибкой запуска Helm CLI",
        )

    stderr_lines = _clean_lines(completed.stderr)
    combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)

    if _infrastructure_error(completed.stderr):
        return ReleaseStatusResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output=combined_output,
            errors=["Helm CLI найден, но не смог подключиться к Kubernetes"],
            warnings=stderr_lines,
            status="unknown",
            engine="helm_status",
            summary="Статус release не получен из-за проблемы окружения",
        )

    if completed.returncode != 0:
        return ReleaseStatusResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output=combined_output,
            errors=stderr_lines or ["helm status завершился с ошибкой"],
            warnings=[],
            status="unknown",
            engine="helm_status",
            summary="Helm не смог получить статус release",
        )

    status_line = next((line for line in completed.stdout.splitlines() if line.startswith("STATUS:")), "")
    release_status = status_line.partition(":")[2].strip().lower() if status_line else "deployed"
    return ReleaseStatusResult(
        success=True,
        release_name=final_release_name,
        namespace=namespace,
        output=combined_output,
        errors=[],
        warnings=stderr_lines,
        status=release_status,
        engine="helm_status",
        summary="Статус release получен через helm status",
    )


def monitor_release_chart(chart, namespace: str, release_name: str | None = None) -> MonitoringResult:
    final_release_name = release_name or getattr(chart, "deployed_release_name", None) or f"{chart.name or 'chart'}-release"
    status_result = release_status_chart(chart, namespace=namespace, release_name=final_release_name)
    kubectl_bin = _resolve_kubectl_binary()
    warnings = list(status_result.warnings)
    errors = list(status_result.errors)
    output_parts = [
        "# helm status",
        status_result.output or "\n".join(status_result.errors) or "helm status не вернул данные",
    ]

    if not kubectl_bin:
        warnings.append("kubectl не найден в окружении backend, показан только helm status")
        return MonitoringResult(
            success=status_result.success,
            release_name=final_release_name,
            namespace=namespace,
            output="\n\n".join(output_parts),
            errors=errors,
            warnings=warnings,
            status=status_result.status,
            engine="helm_status_kubectl",
            summary="Мониторинг release выполнен частично: kubectl недоступен",
        )

    commands = [
        (
            "# kubectl get resources",
            [
                kubectl_bin,
                "get",
                "all",
                "-n",
                namespace,
                "-l",
                f"app.kubernetes.io/instance={final_release_name}",
                "-o",
                "wide",
            ],
        ),
        (
            "# kubectl get recent events",
            [
                kubectl_bin,
                "get",
                "events",
                "-n",
                namespace,
                "--sort-by=.lastTimestamp",
            ],
        ),
    ]

    kubectl_success = True
    for title, command in commands:
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                timeout=25,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            kubectl_success = False
            errors.append(f"Не удалось выполнить {' '.join(command[:3])}: {exc}")
            continue

        combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)
        output_parts.extend([title, combined_output or "Команда не вернула данные"])
        if completed.returncode != 0:
            kubectl_success = False
            errors.extend(_clean_lines(completed.stderr) or [f"{title} завершился с ошибкой"])

    success = status_result.success and kubectl_success
    return MonitoringResult(
        success=success,
        release_name=final_release_name,
        namespace=namespace,
        output="\n\n".join(output_parts),
        errors=errors,
        warnings=warnings,
        status=status_result.status if status_result.success else "unknown",
        engine="helm_status_kubectl",
        summary=(
            "Состояние release и Kubernetes-ресурсов получено"
            if success
            else "Мониторинг release выявил ошибки или недоступные Kubernetes-ресурсы"
        ),
    )


def rollback_chart(chart, namespace: str, release_name: str | None = None, revision: int | None = None) -> RollbackResult:
    helm_bin = _resolve_helm_binary()
    final_release_name = release_name or getattr(chart, "deployed_release_name", None) or f"{chart.name or 'chart'}-release"
    if not helm_bin:
        return RollbackResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            revision=revision,
            output="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для выполнения rollback"],
            status="failed",
            engine="helm_rollback",
            summary="Rollback недоступен без Helm CLI",
        )

    command = [helm_bin, "rollback", final_release_name]
    if revision is not None:
        command.append(str(revision))
    command.extend(["--namespace", namespace, "--wait"])

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return RollbackResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            revision=revision,
            output="",
            errors=[f"Не удалось выполнить rollback: {exc}"],
            warnings=[],
            status="failed",
            engine="helm_rollback",
            summary="Rollback завершился ошибкой запуска Helm CLI",
        )

    stderr_lines = _clean_lines(completed.stderr)
    combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)

    if _infrastructure_error(completed.stderr):
        return RollbackResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            revision=revision,
            output=combined_output,
            errors=["Helm CLI найден, но не смог подключиться к Kubernetes"],
            warnings=stderr_lines,
            status="failed",
            engine="helm_rollback",
            summary="Rollback не выполнен из-за проблемы окружения",
        )

    if completed.returncode != 0:
        return RollbackResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            revision=revision,
            output=combined_output,
            errors=stderr_lines or ["helm rollback завершился с ошибкой"],
            warnings=[],
            status="failed",
            engine="helm_rollback",
            summary="Helm rollback завершился с ошибкой",
        )

    return RollbackResult(
        success=True,
        release_name=final_release_name,
        namespace=namespace,
        revision=revision,
        output=combined_output,
        errors=[],
        warnings=stderr_lines,
        status="rolled_back",
        engine="helm_rollback",
        summary="Rollback release выполнен через helm rollback",
    )


def uninstall_chart(chart, namespace: str, release_name: str | None = None) -> UninstallResult:
    helm_bin = _resolve_helm_binary()
    final_release_name = release_name or getattr(chart, "deployed_release_name", None) or f"{chart.name or 'chart'}-release"
    if not helm_bin:
        return UninstallResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=["Helm CLI не найден в окружении backend"],
            warnings=["Установите Helm или укажите путь через HELM_BIN для включения удаления release"],
            engine="helm_uninstall",
            summary="Удаление release недоступно без Helm CLI",
        )

    try:
        completed = subprocess.run(
            [
                helm_bin,
                "uninstall",
                final_release_name,
                "--namespace",
                namespace,
                "--wait",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=90,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return UninstallResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output="",
            errors=[f"Не удалось выполнить удаление release: {exc}"],
            warnings=[],
            engine="helm_uninstall",
            summary="Удаление release завершилось ошибкой запуска Helm CLI",
        )

    stderr_lines = _clean_lines(completed.stderr)
    combined_output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part)

    if _infrastructure_error(completed.stderr):
        return UninstallResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output=combined_output,
            errors=["Helm CLI найден, но не смог запуститься в текущем окружении"],
            warnings=stderr_lines,
            engine="helm_uninstall",
            summary="Удаление release не выполнено из-за проблемы окружения",
        )

    if completed.returncode != 0:
        return UninstallResult(
            success=False,
            release_name=final_release_name,
            namespace=namespace,
            output=combined_output,
            errors=stderr_lines or ["helm uninstall завершился с ошибкой"],
            warnings=[],
            engine="helm_uninstall",
            summary="Удаление release завершилось с ошибкой",
        )

    return UninstallResult(
        success=True,
        release_name=final_release_name,
        namespace=namespace,
        output=combined_output,
        errors=[],
        warnings=stderr_lines,
        engine="helm_uninstall",
        summary="Release удалён через helm uninstall",
    )
