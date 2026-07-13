from types import SimpleNamespace

from backend.core.opensearch_client import (
    build_course_index_name,
    check_opensearch_health,
    create_opensearch_client,
    normalize_index_component,
    parse_opensearch_hosts,
)


def _settings(**overrides):
    base = {
        "RAG_OPENSEARCH_ENABLED": False,
        "RAG_OPENSEARCH_ENDPOINT": "http://127.0.0.1:9200",
        "RAG_OPENSEARCH_INDEX_PREFIX": "course-rag",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_parse_opensearch_hosts_supports_single_local_endpoint():
    hosts = parse_opensearch_hosts("http://127.0.0.1:9200")
    assert hosts == [{"host": "127.0.0.1", "port": 9200, "scheme": "http"}]


def test_parse_opensearch_hosts_supports_multiple_hosts():
    hosts = parse_opensearch_hosts("http://localhost:9200,https://search.example.com:9443")
    assert hosts == [
        {"host": "localhost", "port": 9200, "scheme": "http"},
        {"host": "search.example.com", "port": 9443, "scheme": "https"},
    ]


def test_normalize_index_component_rewrites_invalid_chars():
    assert normalize_index_component("Course RAG / Spring 2026") == "course-rag-spring-2026"


def test_build_course_index_name_uses_normalized_prefix_and_course():
    settings = _settings(RAG_OPENSEARCH_INDEX_PREFIX="Course RAG", RAG_OPENSEARCH_ENABLED=True)
    name = build_course_index_name("Course:ABC/123", suffix="Sparse Nodes", settings=settings)
    assert name == "course-rag-course-abc-123-sparse-nodes"


def test_check_opensearch_health_disabled_when_feature_off():
    status = check_opensearch_health(settings=_settings())
    assert status["status"] == "disabled"
    assert status["enabled"] is False


def test_check_opensearch_health_uses_injected_client():
    class _Client:
        def ping(self):
            return True

        def info(self):
            return {
                "cluster_name": "intelligent-edu-local",
                "version": {"number": "3.7.0", "distribution": "opensearch"},
            }

    status = check_opensearch_health(
        settings=_settings(RAG_OPENSEARCH_ENABLED=True),
        client=_Client(),
    )
    assert status["status"] == "ok"
    assert status["cluster_name"] == "intelligent-edu-local"
    assert status["version"] == "3.7.0"


def test_create_opensearch_client_respects_explicit_settings(monkeypatch):
    captured = {}

    class _Client:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("backend.core.opensearch_client.OpenSearch", _Client)
    settings = _settings(
        RAG_OPENSEARCH_ENABLED=True,
        RAG_OPENSEARCH_ENDPOINT="https://search.example.com:9443",
        RAG_OPENSEARCH_TIMEOUT_SECONDS=9.5,
        RAG_OPENSEARCH_VERIFY_CERTS=True,
        RAG_OPENSEARCH_USERNAME="admin",
        RAG_OPENSEARCH_PASSWORD="secret",
        RAG_OPENSEARCH_CA_CERTS="D:/ca.pem",
    )
    client = create_opensearch_client(settings)
    assert client is not None
    assert captured["hosts"] == [{"host": "search.example.com", "port": 9443, "scheme": "https"}]
    assert captured["timeout"] == 9.5
    assert captured["verify_certs"] is True
    assert captured["http_auth"] == ("admin", "secret")
    assert captured["ca_certs"] == "D:/ca.pem"
