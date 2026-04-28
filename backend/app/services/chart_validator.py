from __future__ import annotations

import io
import os
import shutil
import subprocess
import tarfile
import tempfile

from pydantic import BaseModel

from app.services.helm_generator import build_chart_archive, _parse_values_yaml


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    checks: list[str]
    engine: str = "builtin"
    summary: str = ""


def _is_truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "on"}
    return False


def _is_falsy(value: object) -> bool:
    if isinstance(value, bool):
        return not value
    if isinstance(value, str):
        return value.strip().lower() in {"false", "0", "no", "off"}
    return False


def _as_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _append_security_policy_findings(values_data: dict, errors: list[str], warnings: list[str], checks: list[str]) -> None:
    host_network = values_data.get("hostNetwork", False)
    if _is_truthy(host_network):
        errors.append("hostNetwork должен быть отключён, чтобы Pod не использовал сетевой namespace узла")
    else:
        checks.append("hostNetwork отключён")

    pod_security_context = _as_dict(values_data.get("podSecurityContext"))
    run_as_non_root = pod_security_context.get("runAsNonRoot")
    if run_as_non_root is True:
        checks.append("Pod securityContext включает runAsNonRoot")
    else:
        warnings.append("Рекомендуется включить podSecurityContext.runAsNonRoot=true")

    container_security_context = _as_dict(values_data.get("containerSecurityContext"))

    if _is_truthy(container_security_context.get("privileged")):
        errors.append("Контейнер не должен запускаться с privileged=true")
    else:
        checks.append("privileged mode отключён")

    allow_privilege_escalation = container_security_context.get("allowPrivilegeEscalation")
    if allow_privilege_escalation is False:
        checks.append("allowPrivilegeEscalation отключён")
    elif _is_truthy(allow_privilege_escalation):
        errors.append("allowPrivilegeEscalation должен быть отключён")
    else:
        warnings.append("Рекомендуется явно указать containerSecurityContext.allowPrivilegeEscalation=false")

    read_only_root_filesystem = container_security_context.get("readOnlyRootFilesystem")
    if read_only_root_filesystem is True:
        checks.append("readOnlyRootFilesystem включён")
    elif _is_falsy(read_only_root_filesystem):
        warnings.append("Рекомендуется включить containerSecurityContext.readOnlyRootFilesystem=true")

    capabilities = _as_dict(container_security_context.get("capabilities"))
    dropped_capabilities = [str(item) for item in _as_list(capabilities.get("drop"))]
    if "ALL" in dropped_capabilities:
        checks.append("Capabilities обнуляются через drop: [ALL]")
    else:
        warnings.append("Рекомендуется добавить containerSecurityContext.capabilities.drop: [ALL]")

    added_capabilities = [str(item) for item in _as_list(capabilities.get("add"))]
    if added_capabilities:
        warnings.append(
            "Добавлены Linux capabilities: "
            + ", ".join(added_capabilities)
            + ". Проверьте необходимость расширенных привилегий."
        )

    for volume in _as_list(values_data.get("extraVolumes")):
        if not isinstance(volume, dict):
            continue
        volume_name = str(volume.get("name", "unnamed"))
        if "hostPath" in volume:
            errors.append(f"Том {volume_name} использует hostPath, что считается небезопасной практикой")
        else:
            checks.append(f"Том {volume_name} не использует hostPath")


def _builtin_validate(chart) -> ValidationResult:
    if not chart.generated_yaml:
        return ValidationResult(
            valid=False,
            errors=["Сначала необходимо сгенерировать Helm-чарт"],
            warnings=[],
            checks=[],
            engine="builtin",
            summary="Чарт ещё не был сгенерирован",
        )

    errors: list[str] = []
    warnings: list[str] = []
    checks: list[str] = []

    generated_yaml = chart.generated_yaml or ""
    values_yaml = chart.values_yaml or ""

    archive = build_chart_archive(chart)
    checks.append(f"Архив собран успешно: {len(archive)} байт")

    required_sections = [
        "# Chart.yaml",
        "# values.yaml",
        "# templates/deployment.yaml",
    ]
    for section in required_sections:
        if section not in generated_yaml:
            errors.append(f"В generated bundle отсутствует секция {section[2:]}")
        else:
            checks.append(f"Найдена секция {section[2:]}")

    if "kind: DaemonSet" in generated_yaml:
        if "replicas:" in generated_yaml:
            errors.append("DaemonSet не должен содержать поле replicas")
        else:
            checks.append("DaemonSet корректно сгенерирован без replicas")

    values_data = _parse_values_yaml(values_yaml)
    service_section = values_data.get("service")
    service_enabled = service_section.get("enabled", True) if isinstance(service_section, dict) else True

    if service_section is None:
        warnings.append("В values.yaml отсутствует секция service")
    elif not service_enabled:
        if "# Service отключён" not in generated_yaml and "templates/service.yaml" in generated_yaml:
            warnings.append("Service отключён в values, но шаблон service мог сохраниться в preview")
        checks.append("Service отключён в values.yaml")
    else:
        checks.append("Service секция присутствует в values.yaml")

    ingress_section = values_data.get("ingress")
    ingress_enabled = ingress_section.get("enabled", False) if isinstance(ingress_section, dict) else False

    if ingress_enabled:
        ingress_host = ingress_section.get("host", "") if isinstance(ingress_section, dict) else ""
        has_ingress_host = bool(ingress_host and ingress_host != '""')
        if not has_ingress_host:
            errors.append("Для включённого ingress должен быть задан host")
        if not service_enabled:
            errors.append("Ingress требует включённый service, так как маршрут ссылается на backend service")
        if has_ingress_host and service_enabled:
            checks.append("Ingress включён и содержит host")
    elif ingress_section is not None:
        checks.append("Ingress отключён в values.yaml")

    image_section = values_data.get("image")
    image_tag = image_section.get("tag", "") if isinstance(image_section, dict) else ""
    if image_tag in ("latest", ""):
        warnings.append("Тег latest нежелателен для production-сценариев")
    else:
        checks.append("Используется фиксированная версия образа")

    resources_val = values_data.get("resources")
    if resources_val == {} or resources_val is None:
        warnings.append("Resource limits не заданы")
    else:
        checks.append("Resource limits заданы")

    _append_security_policy_findings(values_data, errors, warnings, checks)

    return ValidationResult(
        valid=not errors,
        errors=errors,
        warnings=warnings,
        checks=checks,
        engine="builtin",
        summary="Встроенная проверка структуры и параметров Helm-чарта",
    )


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


def _run_helm_lint(chart, base_result: ValidationResult) -> ValidationResult:
    helm_bin = _resolve_helm_binary()
    if not helm_bin:
        base_result.warnings.append("helm не найден в окружении, выполнена только встроенная проверка")
        return base_result

    with tempfile.TemporaryDirectory() as tmpdir:
        chart_dir = _extract_chart(chart, tmpdir)
        try:
            completed = subprocess.run(
                [helm_bin, "lint", chart_dir],
                capture_output=True,
                text=True,
                check=False,
                timeout=20,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            base_result.warnings.append(
                f"Не удалось выполнить helm lint ({exc}); показан результат встроенной проверки"
            )
            return base_result

    stdout_lines = _clean_lines(completed.stdout)
    stderr_lines = _clean_lines(completed.stderr)
    infrastructure_error_markers = [
        "snap-confine",
        "Refusing to continue",
        "cannot create user data directory",
    ]

    if any(marker in completed.stderr for marker in infrastructure_error_markers):
        base_result.warnings.append(
            "helm найден, но не смог запуститься в текущем окружении; показан результат встроенной проверки"
        )
        return base_result

    checks = list(base_result.checks)
    warnings = list(base_result.warnings)
    errors = list(base_result.errors)

    lint_lines = [
        line
        for line in stdout_lines + stderr_lines
        if not line.startswith("==>")
    ]

    if completed.returncode == 0:
        checks.append("helm lint завершился без ошибок")
        checks.extend(lint_lines)
        return ValidationResult(
            valid=base_result.valid,
            errors=errors,
            warnings=warnings,
            checks=checks,
            engine="helm_lint",
            summary="Проверка выполнена через helm lint",
        )

    for line in lint_lines:
        if line not in errors:
            errors.append(line)

    if not errors:
        errors.append("helm lint завершился с ошибкой")

    return ValidationResult(
        valid=False,
        errors=errors,
        warnings=warnings,
        checks=checks,
        engine="helm_lint",
        summary="Проверка выполнена через helm lint и обнаружила проблемы",
    )


def validate_chart(chart) -> ValidationResult:
    builtin_result = _builtin_validate(chart)
    if not chart.generated_yaml:
        return builtin_result
    return _run_helm_lint(chart, builtin_result)
