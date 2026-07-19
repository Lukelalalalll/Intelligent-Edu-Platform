from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.admin_routes import telemetry


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(telemetry.router, prefix="/admin")
    app.dependency_overrides[telemetry.get_admin_user] = lambda: {"role": "admin"}
    return TestClient(app)


def test_llm_telemetry_routes_keep_default_limits(monkeypatch):
    llm = SimpleNamespace(
        get_stats=AsyncMock(return_value={"period_hours": 24, "providers": {}}),
        get_cost_summary=AsyncMock(return_value={"period_hours": 24, "total_cost": 0, "by_provider": {}}),
        get_recent_errors=AsyncMock(return_value=[]),
        get_breakdown=AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(telemetry, "llm_telemetry", llm)

    with _make_client() as client:
        assert client.get("/admin/telemetry/stats").status_code == 200
        assert client.get("/admin/telemetry/cost").status_code == 200
        assert client.get("/admin/telemetry/errors").status_code == 200
        assert client.get("/admin/telemetry/breakdown").status_code == 200

    llm.get_stats.assert_awaited_once_with(hours=24, provider_limit=100)
    llm.get_cost_summary.assert_awaited_once_with(hours=24, provider_limit=50)
    llm.get_recent_errors.assert_awaited_once_with(limit=20)
    llm.get_breakdown.assert_awaited_once_with(hours=24, group_by="provider", limit=200)


def test_llm_telemetry_routes_forward_explicit_limits(monkeypatch):
    llm = SimpleNamespace(
        get_stats=AsyncMock(return_value={"period_hours": 6, "providers": {}}),
        get_cost_summary=AsyncMock(return_value={"period_hours": 6, "total_cost": 0, "by_provider": {}}),
        get_recent_errors=AsyncMock(return_value=[]),
        get_breakdown=AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(telemetry, "llm_telemetry", llm)

    with _make_client() as client:
        assert client.get("/admin/telemetry/stats?hours=6&provider_limit=12").status_code == 200
        assert client.get("/admin/telemetry/cost?hours=7&provider_limit=9").status_code == 200
        assert client.get("/admin/telemetry/errors?limit=8").status_code == 200
        assert client.get("/admin/telemetry/breakdown?hours=5&group_by=api_type&limit=11").status_code == 200

    llm.get_stats.assert_awaited_once_with(hours=6, provider_limit=12)
    llm.get_cost_summary.assert_awaited_once_with(hours=7, provider_limit=9)
    llm.get_recent_errors.assert_awaited_once_with(limit=8)
    llm.get_breakdown.assert_awaited_once_with(hours=5, group_by="api_type", limit=11)


def test_rag_telemetry_routes_keep_default_and_explicit_limits(monkeypatch):
    rag = SimpleNamespace(
        get_course_breakdown=AsyncMock(return_value=[]),
        get_role_breakdown=AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(telemetry, "rag_telemetry", rag)

    with _make_client() as client:
        assert client.get("/admin/rag-telemetry/course-breakdown").status_code == 200
        assert client.get("/admin/rag-telemetry/role-breakdown").status_code == 200
        assert client.get("/admin/rag-telemetry/course-breakdown?hours=12&limit=33").status_code == 200
        assert client.get("/admin/rag-telemetry/role-breakdown?hours=8&limit=15").status_code == 200

    assert rag.get_course_breakdown.await_args_list[0].kwargs == {"limit": 200}
    assert rag.get_course_breakdown.await_args_list[0].args == (24,)
    assert rag.get_role_breakdown.await_args_list[0].kwargs == {"limit": 20}
    assert rag.get_role_breakdown.await_args_list[0].args == (24,)
    assert rag.get_course_breakdown.await_args_list[1].kwargs == {"limit": 33}
    assert rag.get_course_breakdown.await_args_list[1].args == (12,)
    assert rag.get_role_breakdown.await_args_list[1].kwargs == {"limit": 15}
    assert rag.get_role_breakdown.await_args_list[1].args == (8,)
