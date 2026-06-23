from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.config import Config


def ensure_dir_and_mount(app: FastAPI, mount_path: str, directory: str, name: str) -> None:
    os.makedirs(directory, exist_ok=True)
    app.mount(mount_path, StaticFiles(directory=directory), name=name)


def apply_static_mounts(app: FastAPI, static_mounts) -> None:
    for folder in Config.ALL_FOLDERS:
        os.makedirs(folder, exist_ok=True)
    for mount_path, directory, name in static_mounts:
        ensure_dir_and_mount(app, mount_path, directory, name)
