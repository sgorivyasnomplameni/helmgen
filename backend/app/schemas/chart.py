from datetime import datetime
from pydantic import BaseModel


class ChartBase(BaseModel):
    name: str
    description: str | None = None
    chart_version: str = "0.1.0"
    app_version: str = "latest"
    values_yaml: str | None = None


class ChartCreate(ChartBase):
    pass


class ChartUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    chart_version: str | None = None
    app_version: str | None = None
    values_yaml: str | None = None


class ChartResponse(ChartBase):
    id: int
    generated_yaml: str | None = None
    lifecycle_status: str = "draft"
    validation_status: str | None = None
    validation_summary: str | None = None
    validated_at: datetime | None = None
    template_status: str | None = None
    template_summary: str | None = None
    templated_at: datetime | None = None
    dry_run_status: str | None = None
    dry_run_summary: str | None = None
    dry_run_output: str | None = None
    dry_run_release_name: str | None = None
    dry_run_namespace: str | None = None
    dry_run_at: datetime | None = None
    deploy_status: str | None = None
    deploy_summary: str | None = None
    deploy_output: str | None = None
    deployed_release_name: str | None = None
    deployed_namespace: str | None = None
    deployed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChartGenerateRequest(BaseModel):
    values_yaml: str | None = None


class ChartValidationResponse(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    checks: list[str]
    engine: str = "builtin"
    summary: str = ""


class ChartTemplateResponse(BaseModel):
    success: bool
    rendered_manifests: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_template"
    summary: str = ""


class ChartDryRunResponse(BaseModel):
    success: bool
    output: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_dry_run"
    summary: str = ""


class ChartDeployRequest(BaseModel):
    namespace: str = "helmgen-demo"
    release_name: str | None = None


class ChartDeployResponse(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str
    engine: str = "helm_deploy"
    summary: str = ""


class ChartReleaseStatusResponse(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str
    engine: str = "helm_status"
    summary: str = ""


class ChartMonitoringResponse(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    status: str
    engine: str = "helm_status_kubectl"
    summary: str = ""


class ChartRollbackRequest(BaseModel):
    namespace: str = "helmgen-demo"
    release_name: str | None = None
    revision: int | None = None


class ChartRollbackResponse(BaseModel):
    success: bool
    release_name: str
    namespace: str
    revision: int | None = None
    output: str
    errors: list[str]
    warnings: list[str]
    status: str
    engine: str = "helm_rollback"
    summary: str = ""


class ChartUninstallRequest(BaseModel):
    namespace: str = "helmgen-demo"
    release_name: str | None = None


class ChartUninstallResponse(BaseModel):
    success: bool
    release_name: str
    namespace: str
    output: str
    errors: list[str]
    warnings: list[str]
    engine: str = "helm_uninstall"
    summary: str = ""


class ClusterStatusResponse(BaseModel):
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
