from fastapi import APIRouter
from fastapi.testclient import TestClient

from backend.apps.factory import create_app
from backend.config import Config


def test_internal_gateway_header_required(monkeypatch):
    monkeypatch.setattr(Config, "INTERNAL_GATEWAY_TOKEN", "test-token")

    router = APIRouter()

    @router.get("/ping")
    async def ping():
        return {"ok": True}

    app = create_app(
        title="gateway-test",
        versioned_routers=(router,),
        require_gateway_token=True,
        enable_rag_preload=False,
    )

    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200
        assert client.get("/api/ping").status_code == 403
        assert client.get("/api/ping", headers={Config.INTERNAL_GATEWAY_HEADER: "wrong"}).status_code == 403
        assert client.get("/api/ping", headers={Config.INTERNAL_GATEWAY_HEADER: "test-token"}).status_code == 200

