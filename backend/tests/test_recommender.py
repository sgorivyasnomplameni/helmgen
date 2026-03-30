import pytest
from app.services.recommender import ChartParams, RecommendationSystem


@pytest.fixture
def rs() -> RecommendationSystem:
    return RecommendationSystem()


def params(**overrides) -> ChartParams:
    """Build a 'clean' config (no recommendations expected) with selective overrides."""
    defaults: dict = dict(
        replicas=2,
        workload_type="Deployment",
        service_enabled=True,
        service_type="ClusterIP",
        resource_limits=True,
        image_tag="1.0.0",
        ingress_enabled=False,
    )
    defaults.update(overrides)
    return ChartParams(**defaults)


# ── replicas == 1 ──────────────────────────────────────────────────────────────

def test_single_replica_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(replicas=1))
    assert any("2 реплики" in r for r in recs)


def test_two_replicas_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(replicas=2))
    assert not any("2 реплики" in r for r in recs)


# ── replicas > 10 ──────────────────────────────────────────────────────────────

def test_eleven_replicas_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(replicas=11))
    assert any("достаточно ресурсов" in r for r in recs)


def test_ten_replicas_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(replicas=10))
    assert not any("достаточно ресурсов" in r for r in recs)


# ── DaemonSet + replicas > 1 ───────────────────────────────────────────────────

def test_daemonset_many_replicas_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="DaemonSet", replicas=3))
    assert any("replicas игнорируется" in r for r in recs)


def test_daemonset_one_replica_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="DaemonSet", replicas=1))
    assert not any("replicas игнорируется" in r for r in recs)


def test_deployment_many_replicas_no_daemonset_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="Deployment", replicas=5))
    assert not any("replicas игнорируется" in r for r in recs)


# ── StatefulSet + service_type != ClusterIP ────────────────────────────────────

def test_statefulset_nodeport_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="StatefulSet", service_type="NodePort"))
    assert any("ClusterIP" in r for r in recs)


def test_statefulset_loadbalancer_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="StatefulSet", service_type="LoadBalancer"))
    assert any("ClusterIP" in r for r in recs)


def test_statefulset_clusterip_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="StatefulSet", service_type="ClusterIP"))
    assert not any("ClusterIP" in r for r in recs)


def test_deployment_nodeport_no_statefulset_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(workload_type="Deployment", service_type="NodePort"))
    assert not any("ClusterIP" in r for r in recs)


# ── resource_limits == False ───────────────────────────────────────────────────

def test_no_resource_limits_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(resource_limits=False))
    assert any("resource limits" in r for r in recs)


def test_resource_limits_set_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(resource_limits=True))
    assert not any("resource limits" in r for r in recs)


# ── image_tag == "latest" ──────────────────────────────────────────────────────

def test_latest_tag_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(image_tag="latest"))
    assert any("latest" in r for r in recs)


def test_specific_tag_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(image_tag="v1.2.3"))
    assert not any("latest" in r for r in recs)


# ── ingress_enabled + service_enabled == False ─────────────────────────────────

def test_ingress_without_service_triggers_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(ingress_enabled=True, service_enabled=False))
    assert any("Ingress требует" in r for r in recs)


def test_ingress_with_service_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(ingress_enabled=True, service_enabled=True))
    assert not any("Ingress требует" in r for r in recs)


def test_no_ingress_no_warning(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(ingress_enabled=False, service_enabled=False))
    assert not any("Ingress требует" in r for r in recs)


# ── clean config ───────────────────────────────────────────────────────────────

def test_clean_config_produces_no_recommendations(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params())
    assert recs == []


# ── multiple rules at once ─────────────────────────────────────────────────────

def test_multiple_issues_all_reported(rs: RecommendationSystem) -> None:
    recs = rs.analyze(params(replicas=1, image_tag="latest", resource_limits=False))
    assert any("2 реплики" in r for r in recs)
    assert any("latest" in r for r in recs)
    assert any("resource limits" in r for r in recs)
