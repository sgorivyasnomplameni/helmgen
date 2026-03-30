from pydantic import BaseModel


class ChartParams(BaseModel):
    replicas: int = 1
    workload_type: str = "Deployment"
    service_enabled: bool = True
    service_type: str = "ClusterIP"
    resource_limits: bool = False
    image_tag: str = "latest"
    ingress_enabled: bool = False


class RecommendationSystem:
    def analyze(self, params: ChartParams) -> list[str]:
        result: list[str] = []

        if params.replicas == 1:
            result.append(
                "Рекомендуется минимум 2 реплики для отказоустойчивости"
            )

        if params.replicas > 10:
            result.append(
                "Большое количество реплик, убедитесь что кластер имеет достаточно ресурсов"
            )

        if params.workload_type == "DaemonSet" and params.replicas > 1:
            result.append(
                "DaemonSet запускает по одному поду на каждый узел, параметр replicas игнорируется"
            )

        if params.workload_type == "StatefulSet" and params.service_type != "ClusterIP":
            result.append(
                "StatefulSet рекомендуется использовать с ClusterIP сервисом"
            )

        if not params.resource_limits:
            result.append(
                "Рекомендуется задать resource limits для предотвращения OOM"
            )

        if params.image_tag == "latest":
            result.append(
                "Использование тега latest не рекомендуется в продакшене, укажите конкретную версию"
            )

        if params.ingress_enabled and not params.service_enabled:
            result.append(
                "Ingress требует наличия Service"
            )

        return result
