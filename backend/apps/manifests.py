from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import APIRouter

from backend.apps.highlighter_router import build_highlighter_router
from backend.config import Config
from backend.ppt_generator_integration import PPT_GENERATOR_APP_DATA_ROOT
from backend.routes.admin_routes import admin_router
from backend.routes.ai_gateway_routes import ai_gateway_router
from backend.routes.ai_routes import ai_router
from backend.routes.auth_routes import auth_router, limiter
from backend.routes.chat_routes import chat_router
from backend.routes.diagram_routes import diagram_router
from backend.routes.file_center_routes import file_center_router
from backend.routes.grading_routes import grading_router
from backend.routes.homework_routes import router as homework_router
from backend.routes.image_extractor_routes import image_extractor_router
from backend.routes.mailbox_routes import mailbox_router as teacher_router
from backend.routes.questions_routes import questions_router
from backend.routes.slides_routes import legacy_sub1_router, public_slides_router, slides_router
from backend.routes.study_notes_routes import study_notes_router
from backend.routes.video_routes import router as video_router


StaticMount = tuple[str, str, str]


@dataclass(frozen=True)
class AppManifest:
    title: str
    versioned_routers: tuple[APIRouter, ...] = ()
    direct_routers: tuple[APIRouter, ...] = ()
    static_mounts: tuple[StaticMount, ...] = ()
    require_gateway_token: bool = True
    ensure_indexes_on_startup: bool = False
    run_core_startup_jobs: bool = False
    cleanup_question_files_on_startup: bool = False
    reset_indexing_jobs_on_startup: bool = False
    enable_rag_preload: bool | None = False
    limiter: object | None = None

    def create_app_kwargs(self) -> dict:
        return {
            "title": self.title,
            "versioned_routers": self.versioned_routers,
            "direct_routers": self.direct_routers,
            "static_mounts": self.static_mounts,
            "require_gateway_token": self.require_gateway_token,
            "ensure_indexes_on_startup": self.ensure_indexes_on_startup,
            "run_core_startup_jobs": self.run_core_startup_jobs,
            "cleanup_question_files_on_startup": self.cleanup_question_files_on_startup,
            "reset_indexing_jobs_on_startup": self.reset_indexing_jobs_on_startup,
            "enable_rag_preload": self.enable_rag_preload,
            "limiter": self.limiter,
        }


def _base_path(*parts: str) -> str:
    return os.path.join(Config.BASE_DIR, *parts)


highlighter_router = build_highlighter_router()


CORE_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Core API",
    versioned_routers=(
        auth_router,
        admin_router,
        ai_router,
        teacher_router,
        grading_router,
        ai_gateway_router,
        chat_router,
        file_center_router,
        slides_router,
        legacy_sub1_router,
    ),
    direct_routers=(homework_router, public_slides_router),
    static_mounts=(
        ("/data", os.path.abspath(os.path.join(Config.BASE_DIR, os.pardir, "data")), "data"),
        ("/test_pdf", _base_path("test_pdf"), "test_pdf"),
        ("/static", _base_path("static"), "static"),
        ("/grading_annotated", _base_path("static", "grading_annotated"), "grading_annotated"),
        ("/uploads", _base_path("uploads"), "uploads"),
        ("/generated/sub1", _base_path("generated", "sub1"), "generated_sub1"),
        ("/app_data", str(PPT_GENERATOR_APP_DATA_ROOT), "ppt_generator_app_data"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=True,
    run_core_startup_jobs=False,
    reset_indexing_jobs_on_startup=True,
    enable_rag_preload=None,
    limiter=limiter,
)

SLIDES_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Slides Service",
    versioned_routers=(slides_router, legacy_sub1_router),
    direct_routers=(public_slides_router,),
    static_mounts=(
        ("/static", _base_path("static"), "static"),
        ("/uploads", _base_path("uploads"), "uploads"),
        ("/generated/sub1", _base_path("generated", "sub1"), "generated_sub1"),
    ),
)

QUESTIONS_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Question Service",
    versioned_routers=(questions_router,),
    static_mounts=(
        ("/uploads/sub2", _base_path("uploads", "sub2"), "uploads_sub2"),
        ("/generated/sub2", _base_path("generated", "sub2"), "generated_sub2"),
        ("/static/sub2/screenshots", _base_path("static", "sub2", "screenshots"), "screenshots_sub2"),
    ),
    cleanup_question_files_on_startup=True,
)

VISUAL_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Visual Service",
    versioned_routers=(diagram_router, image_extractor_router),
    static_mounts=(
        ("/uploads/sub3", _base_path("uploads", "sub3"), "uploads_sub3"),
        ("/uploads/sub4", _base_path("uploads", "sub4"), "uploads_sub4"),
        ("/generated/sub3", _base_path("generated", "sub3"), "generated_sub3"),
        ("/generated/sub4", _base_path("generated", "sub4"), "generated_sub4"),
        ("/static/sub4", _base_path("static", "sub4"), "static_sub4"),
    ),
)

VIDEO_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Video Service",
    versioned_routers=(video_router,),
    static_mounts=(
        ("/uploads", _base_path("uploads"), "uploads"),
        ("/generated/videos", _base_path("generated", "videos"), "generated_videos"),
    ),
)

STUDY_NOTES_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Study Notes Service",
    versioned_routers=(study_notes_router,),
    static_mounts=(
        ("/uploads/sub5", _base_path("uploads", "sub5"), "uploads_sub5"),
        ("/generated/sub5", _base_path("generated", "sub5"), "generated_sub5"),
    ),
)

HIGHLIGHTER_APP_MANIFEST = AppManifest(
    title="Intelligent Edu Platform Highlighter Service",
    versioned_routers=(highlighter_router,),
    static_mounts=(
        ("/static", _base_path("static"), "static"),
        ("/uploads", _base_path("uploads"), "uploads"),
        ("/md/sub1", _base_path("md", "sub1"), "md_sub1"),
        ("/highlights/sub1", _base_path("highlights", "sub1"), "highlights_sub1"),
    ),
)
