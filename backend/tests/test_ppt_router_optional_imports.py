from __future__ import annotations

import logging
from types import SimpleNamespace

from fastapi import APIRouter


def test_build_api_v1_ppt_router_skips_failed_optional_imports(monkeypatch, caplog):
    from backend.presenton_runtime.api.v1.ppt import router as router_module

    healthy_router = APIRouter()

    @healthy_router.get("/ok")
    async def ok():
        return {"ok": True}

    def fake_import_module(module_path: str):
        if module_path == "fake.good":
            return SimpleNamespace(GOOD_ROUTER=healthy_router)
        raise ImportError(f"boom: {module_path}")

    monkeypatch.setattr(
        router_module,
        "_ROUTER_SPECS",
        (
            ("fake.good", "GOOD_ROUTER"),
            ("fake.bad", "BAD_ROUTER"),
        ),
    )
    monkeypatch.setattr(router_module, "import_module", fake_import_module)
    caplog.set_level(logging.WARNING)

    api_router = router_module.build_api_v1_ppt_router()

    assert [route.path for route in api_router.routes] == ["/api/v1/ppt/ok"]
    assert "Skipping optional PPT router fake.bad.BAD_ROUTER" in caplog.text
