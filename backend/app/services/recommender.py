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

        if params.workload_type == "Deployment" and params.replicas == 1:
            result.append(
                "Одна реплика у Deployment не даёт отказоустойчивости. Для production обычно используют минимум 2 реплики."
            )

        if params.workload_type == "StatefulSet" and params.replicas == 1:
            result.append(
                "Один экземпляр StatefulSet подходит для dev/test или одиночной БД. Для HA-сценариев нужна отдельная стратегия репликации."
            )

        if params.workload_type == "StatefulSet" and params.replicas == 2:
            result.append(
                "Для quorum-based StatefulSet 2 реплики обычно неудачны: чаще выбирают нечётное число 3 или 5."
            )

        if params.replicas > 10:
            result.append(
                "Большое количество реплик. Проверьте лимиты, anti-affinity и запас ресурсов кластера."
            )

        if params.workload_type == "DaemonSet" and params.replicas > 1:
            result.append(
                "DaemonSet запускает по одному поду на каждый узел, параметр replicas игнорируется."
            )

        if params.workload_type == "StatefulSet" and params.service_enabled and params.service_type != "ClusterIP":
            result.append(
                "StatefulSet обычно используют с ClusterIP или headless Service. NodePort и LoadBalancer подходят не для всех stateful-сценариев."
            )

        if not params.resource_limits:
            result.append(
                "Не заданы requests/limits. Без них pod сложнее планировать и выше риск нестабильной работы под нагрузкой."
            )

        if params.image_tag == "latest":
            result.append(
                "Тег latest ухудшает воспроизводимость релизов. Лучше использовать фиксированную версию образа."
            )

        if params.ingress_enabled and not params.service_enabled:
            result.append(
                "Ingress требует наличия Service, иначе backend для маршрутизации будет отсутствовать."
            )

        if params.ingress_enabled and params.service_enabled and params.service_type == "LoadBalancer":
            result.append(
                "Одновременное использование Ingress и LoadBalancer для одного сервиса может быть избыточным. Обычно выбирают один внешний входной слой."
            )

        if params.workload_type == "DaemonSet" and params.service_enabled and params.service_type == "LoadBalancer":
            result.append(
                "DaemonSet редко публикуют через LoadBalancer. Проверьте, действительно ли каждому узлу нужен внешний трафик."
            )

        return result
