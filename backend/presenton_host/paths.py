from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
PPT_GENERATOR_RUNTIME_ROOT = BACKEND_ROOT / "presenton_runtime"
PPT_GENERATOR_APP_DATA_ROOT = BACKEND_ROOT / "app_data"
PPT_GENERATOR_TEMP_ROOT = PPT_GENERATOR_APP_DATA_ROOT / "temp"
# Keep existing on-disk filenames for storage compatibility.
PPT_GENERATOR_DB_PATH = PPT_GENERATOR_APP_DATA_ROOT / "presenton.db"
PPT_GENERATOR_USER_CONFIG_PATH = PPT_GENERATOR_APP_DATA_ROOT / "presenton-user-config.json"
PPT_GENERATOR_STATIC_ROOT = PPT_GENERATOR_RUNTIME_ROOT / "static"
BACKEND_STATIC_ROOT = BACKEND_ROOT / "static"
EXPORT_RUNTIME_ROOT = REPO_ROOT / "presentation-export"
CONFIGURED_SENTINEL = "__configured__"


def ensure_ppt_generator_sys_path() -> None:
    runtime_root = str(PPT_GENERATOR_RUNTIME_ROOT)
    if runtime_root not in sys.path:
        sys.path.insert(0, runtime_root)


def configure_ppt_generator_env_defaults() -> None:
    PPT_GENERATOR_APP_DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PPT_GENERATOR_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    PPT_GENERATOR_USER_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PPT_GENERATOR_USER_CONFIG_PATH.exists():
        PPT_GENERATOR_USER_CONFIG_PATH.write_text("{}\n", encoding="utf-8")

    os.environ.setdefault("APP_DATA_DIRECTORY", str(PPT_GENERATOR_APP_DATA_ROOT))
    os.environ.setdefault("TEMP_DIRECTORY", str(PPT_GENERATOR_TEMP_ROOT))
    os.environ.setdefault("USER_CONFIG_PATH", str(PPT_GENERATOR_USER_CONFIG_PATH))
    os.environ.setdefault(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{PPT_GENERATOR_DB_PATH.as_posix()}",
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


def ensure_ppt_generator_static_assets() -> None:
    copy_tree(PPT_GENERATOR_STATIC_ROOT / "icons", BACKEND_STATIC_ROOT / "icons")
    copy_tree(PPT_GENERATOR_STATIC_ROOT / "images", BACKEND_STATIC_ROOT / "images")


PRESENTON_RUNTIME_ROOT = PPT_GENERATOR_RUNTIME_ROOT
PRESENTON_APP_DATA_ROOT = PPT_GENERATOR_APP_DATA_ROOT
PRESENTON_TEMP_ROOT = PPT_GENERATOR_TEMP_ROOT
PRESENTON_DB_PATH = PPT_GENERATOR_DB_PATH
PRESENTON_USER_CONFIG_PATH = PPT_GENERATOR_USER_CONFIG_PATH
PRESENTON_STATIC_ROOT = PPT_GENERATOR_STATIC_ROOT

ensure_presenton_sys_path = ensure_ppt_generator_sys_path
configure_presenton_env_defaults = configure_ppt_generator_env_defaults
ensure_presenton_static_assets = ensure_ppt_generator_static_assets
