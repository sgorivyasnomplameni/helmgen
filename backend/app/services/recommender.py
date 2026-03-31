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

        production_like = (
            params.ingress_enabled
            or params.service_type in {"NodePort", "LoadBalancer"}
            or params.replicas >= 2
        )

        if params.workload_type == "Deployment" and params.replicas == 1:
            result.append(
                "Внимание: Один экземпляр Deployment не даёт отказоустойчивости. Для dev-окружения это допустимо, но для production обычно используют минимум 2 реплики."
            )

        if params.workload_type == "StatefulSet" and params.replicas == 1:
            result.append(
                "Рекомендация: Один экземпляр StatefulSet подходит для dev/test или одиночной БД. Для production и HA-сценариев нужна отдельная стратегия репликации и хранения данных."
            )

        if params.workload_type == "StatefulSet" and params.replicas % 2 == 0 and params.replicas > 1:
            result.append(
                "Внимание: Для quorum-based StatefulSet чётное число реплик обычно неудачно. Чаще выбирают 3 или 5, чтобы избежать проблем с выбором лидера и quorum."
            )

        if params.replicas > 10:
            result.append(
                "Рекомендация: Большое количество реплик требует проверки anti-affinity, лимитов и запаса ресурсов кластера. Для production-сценария также стоит подумать о HPA."
            )

        if params.workload_type == "DaemonSet" and params.replicas > 1:
            result.append(
                "Рекомендация: DaemonSet запускает по одному pod на каждый узел, поэтому поле replicas здесь не влияет на результат."
            )

        if params.workload_type == "StatefulSet" and params.service_enabled and params.service_type != "ClusterIP":
            result.append(
                "Внимание: StatefulSet обычно используют с ClusterIP или headless Service. NodePort и LoadBalancer подходят не для всех stateful-сценариев и требуют отдельного обоснования."
            )

        if params.workload_type == "StatefulSet" and params.ingress_enabled:
            result.append(
                "Внимание: StatefulSet с Ingress требует осторожности. Базы данных и другие stateful-сервисы редко публикуют напрямую через Ingress без отдельного слоя API или прокси."
            )

        if not params.resource_limits:
            result.append(
                "Внимание: Не заданы requests/limits. Без них pod сложнее планировать, а под нагрузкой выше риск вытеснения или нестабильной работы."
            )

        if params.ingress_enabled and not params.service_enabled:
            result.append(
                "Критично: Ingress требует наличия Service. Без него у маршрутизации не будет backend, и внешний трафик некуда направлять."
            )

        if params.ingress_enabled and params.service_enabled and params.service_type == "LoadBalancer":
            result.append(
                "Рекомендация: Одновременное использование Ingress и LoadBalancer для одного сервиса может быть избыточным. Обычно выбирают один внешний входной слой и явно фиксируют причину второго."
            )

        if params.workload_type == "DaemonSet" and params.service_enabled and params.service_type == "LoadBalancer":
            result.append(
                "Внимание: DaemonSet редко публикуют через LoadBalancer. Проверьте, действительно ли каждому узлу нужен внешний трафик, а не внутренний сбор метрик или логов."
            )

        if params.workload_type == "DaemonSet" and params.service_enabled:
            result.append(
                "Рекомендация: Для DaemonSet Service нужен не всегда. Если это node-agent или exporter, заранее проверьте, действительно ли он должен быть доступен как Kubernetes Service."
            )

        if params.image_tag == "latest":
            result.append(
                "Внимание: Тег latest ухудшает воспроизводимость релизов и откатов. Лучше использовать фиксированную версию образа."
            )

        if production_like and not params.resource_limits:
            result.append(
                "Рекомендация: Конфигурация выглядит production-подобной, но без requests/limits её сложнее безопасно эксплуатировать под нагрузкой."
            )

        return result
