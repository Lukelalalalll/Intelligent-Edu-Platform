from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
PRESENTON_RUNTIME_ROOT = BACKEND_ROOT / "presenton_runtime"
PRESENTON_APP_DATA_ROOT = BACKEND_ROOT / "app_data"
PRESENTON_TEMP_ROOT = PRESENTON_APP_DATA_ROOT / "temp"
PRESENTON_DB_PATH = PRESENTON_APP_DATA_ROOT / "presenton.db"
PRESENTON_USER_CONFIG_PATH = PRESENTON_APP_DATA_ROOT / "presenton-user-config.json"
PRESENTON_STATIC_ROOT = PRESENTON_RUNTIME_ROOT / "static"
BACKEND_STATIC_ROOT = BACKEND_ROOT / "static"
EXPORT_RUNTIME_ROOT = REPO_ROOT / "presentation-export"
CONFIGURED_SENTINEL = "__configured__"


def ensure_presenton_sys_path() -> None:
    runtime_root = str(PRESENTON_RUNTIME_ROOT)
    if runtime_root not in sys.path:
        sys.path.insert(0, runtime_root)


def configure_presenton_env_defaults() -> None:
    PRESENTON_APP_DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PRESENTON_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    PRESENTON_USER_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PRESENTON_USER_CONFIG_PATH.exists():
        PRESENTON_USER_CONFIG_PATH.write_text("{}\n", encoding="utf-8")

    os.environ.setdefault("APP_DATA_DIRECTORY", str(PRESENTON_APP_DATA_ROOT))
    os.environ.setdefault("TEMP_DIRECTORY", str(PRESENTON_TEMP_ROOT))
    os.environ.setdefault("USER_CONFIG_PATH", str(PRESENTON_USER_CONFIG_PATH))
    os.environ.setdefault(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{PRESENTON_DB_PATH.as_posix()}",
    )
    os.environ.setdefault("EXPORT_RUNTIME_DIR", str(EXPORT_RUNTIME_ROOT))
    os.environ.setdefault("EXPORT_PACKAGE_ROOT", str(EXPORT_RUNTIME_ROOT))
    os.environ.setdefault("CAN_CHANGE_KEYS", "false")
    os.environ.setdefault("DISABLE_AUTH", "true")
    os.environ.setdefault("MEM0_ENABLED", "false")
    os.environ.setdefault("MIGRATE_DATABASE_ON_STARTUP", "false")


def copy_tree(src: Path, dst: Path) -> None:
    if not src.is_dir():
        return
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.rglob("*"):
        relative = item.relative_to(src)
        target = dst / relative
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(item, target)
        except PermissionError:
            if not target.exists():
                raise


def ensure_presenton_static_assets() -> None:
    copy_tree(PRESENTON_STATIC_ROOT / "icons", BACKEND_STATIC_ROOT / "icons")
    copy_tree(PRESENTON_STATIC_ROOT / "images", BACKEND_STATIC_ROOT / "images")
