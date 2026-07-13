import asyncio

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from backend.core.database import (
    _create_client,
    _ensure_auth_security_indexes,
    _ensure_google_auth_ticket_indexes,
    _get_client,
    _ensure_users_indexes,
    _ensure_user_sessions_indexes,
    _find_equivalent_username_index_name,
    _is_equivalent_username_index,
    ensure_indexes,
    close_database_client,
)
from backend.apps.factory import create_app
from pymongo.errors import OperationFailure


class _FakeIndexCursor:
    def __init__(self, indexes):
        self._indexes = indexes

    async def to_list(self, length=None):
        return list(self._indexes)


class _FakeUsersCollection:
    def __init__(self, indexes=None, create_index_side_effects=None):
        self._indexes = list(indexes or [])
        self._create_index_side_effects = list(create_index_side_effects or [])
        self.create_index_calls = []

    def list_indexes(self):
        return _FakeIndexCursor(self._indexes)

    async def create_index(self, keys, **kwargs):
        self.create_index_calls.append((list(keys), kwargs))
        if self._create_index_side_effects:
            effect = self._create_index_side_effects.pop(0)
            if isinstance(effect, dict):
                self._indexes.append(effect)
                return effect.get('name', 'created-index')
            if isinstance(effect, Exception):
                has_username_index = any(index.get('key') == {'username': 1} for index in self._indexes)
                if getattr(effect, 'code', None) == 85 and not has_username_index:
                    self._indexes.append({
                        'name': 'users_username_unique',
                        'key': {'username': 1},
                        'unique': True,
                    })
                raise effect
            return effect
        return 'created-index'


class _FakeDatabase:
    def __init__(
        self,
        users,
        user_sessions=None,
        auth_attempt_counters=None,
        security_audit_events=None,
        google_auth_tickets=None,
    ):
        self.users = users
        self.user_sessions = user_sessions or _FakeCreateIndexesCollection()
        self.auth_attempt_counters = auth_attempt_counters or _FakeCreateIndexesCollection()
        self.security_audit_events = security_audit_events or _FakeCreateIndexesCollection()
        self.google_auth_tickets = google_auth_tickets or _FakeCreateIndexesCollection()


class _FakeCreateIndexesCollection:
    def __init__(self):
        self.create_indexes_calls = []

    async def create_indexes(self, indexes):
        self.create_indexes_calls.append(indexes)
        return [f"idx_{i}" for i, _ in enumerate(indexes)]

    async def drop_index(self, _name):
        return None


class _FakeProxyDatabase:
    def __init__(self, label):
        self.users = f"users:{label}"
        self._collections = {"indexing_jobs": f"indexing_jobs:{label}"}

    def __getitem__(self, name):
        return self._collections[name]


class _FakeMotorClient:
    instances = []

    def __init__(self, *args, **kwargs):
        self.closed = False
        self.args = args
        self.kwargs = kwargs
        self.label = len(self.__class__.instances) + 1
        self.database = _FakeProxyDatabase(self.label)
        self.__class__.instances.append(self)

    def get_default_database(self):
        return self.database

    def close(self):
        self.closed = True


class _LoopCheckingCollection:
    def __init__(self, owner):
        self._owner = owner

    async def find_one(self, query, projection=None):
        current_loop_id = id(asyncio.get_running_loop())
        if self._owner.loop_id != current_loop_id:
            raise RuntimeError("Event loop is closed")
        return {"ok": True, "query": query}


class _LoopCheckingDatabase:
    def __init__(self, owner):
        self.users = _LoopCheckingCollection(owner)


class _LoopCheckingMotorClient:
    instances = []

    def __init__(self, *args, **kwargs):
        self.closed = False
        self.loop_id = id(asyncio.get_running_loop())
        self.database = _LoopCheckingDatabase(self)
        self.__class__.instances.append(self)

    def get_default_database(self):
        return self.database

    def close(self):
        self.closed = True


class _FakeEnsureIndexesDatabase:
    def __init__(self):
        self.users = _FakeUsersCollection(indexes=[])
        self._collections = {
            "google_auth_tickets": _FakeCreateIndexesCollection(),
            "user_sessions": _FakeCreateIndexesCollection(),
            "auth_attempt_counters": _FakeCreateIndexesCollection(),
            "security_audit_events": _FakeCreateIndexesCollection(),
            "login_mfa_challenges": _FakeCreateIndexesCollection(),
            "annotations": _FakeCreateIndexesCollection(),
            "course_sections": _FakeCreateIndexesCollection(),
            "enrollments": _FakeCreateIndexesCollection(),
            "assignments": _FakeCreateIndexesCollection(),
            "submissions": _FakeCreateIndexesCollection(),
            "documents": _FakeCreateIndexesCollection(),
            "grades": _FakeCreateIndexesCollection(),
            "courses": _FakeCreateIndexesCollection(),
            "llm_telemetry": _FakeCreateIndexesCollection(),
            "sub1_task_tracking": _FakeCreateIndexesCollection(),
            "sub1_checkpoints": _FakeCreateIndexesCollection(),
            "sub1_audit_log": _FakeCreateIndexesCollection(),
            "chat_contacts": _FakeCreateIndexesCollection(),
            "chat_rooms": _FakeCreateIndexesCollection(),
            "chat_messages": _FakeCreateIndexesCollection(),
            "ai_chat_sessions": _FakeCreateIndexesCollection(),
            "staff_codes": _FakeCreateIndexesCollection(),
            "chat_ai_jobs": _FakeCreateIndexesCollection(),
            "chat_file_transfers": _FakeCreateIndexesCollection(),
            "indexing_jobs": _FakeCreateIndexesCollection(),
            "background_jobs": _FakeCreateIndexesCollection(),
            "file_assets": _FakeCreateIndexesCollection(),
            "password_reset_tokens": _FakeCreateIndexesCollection(),
            "question_ops_runs": _FakeCreateIndexesCollection(),
            "question_ops_items": _FakeCreateIndexesCollection(),
            "slides_delivery_jobs": _FakeCreateIndexesCollection(),
            "study_plan_profiles": _FakeCreateIndexesCollection(),
            "study_review_queue": _FakeCreateIndexesCollection(),
            "ai_session_buckets": _FakeCreateIndexesCollection(),
        }
        for collection_name in (
            "sub1_generation_history",
            "sub2_generation_history",
            "sub3_generation_history",
            "sub4_generation_history",
            "sub5_generation_history",
            "video_generation_history",
        ):
            self._collections[collection_name] = _FakeCreateIndexesCollection()

    def __getattr__(self, name):
        if name == "users":
            return self.users
        if name in self._collections:
            return self._collections[name]
        raise AttributeError(name)

    def __getitem__(self, name):
        return self._collections[name]


def test_is_equivalent_username_index_matches_unique_username_index():
    assert _is_equivalent_username_index({
        'name': 'users_username_unique',
        'key': {'username': 1},
        'unique': True,
    }) is True


def test_create_client_enables_tz_aware_reads(monkeypatch):
    import backend.core.database as database_module

    _FakeMotorClient.instances = []
    monkeypatch.setattr(database_module, "AsyncIOMotorClient", _FakeMotorClient)

    _create_client()

    assert len(_FakeMotorClient.instances) == 1
    client = _FakeMotorClient.instances[0]
    assert getattr(client, "closed", False) is False
    assert client.kwargs.get("tz_aware") is True


@pytest.mark.parametrize('index_spec', [
    {'name': 'username_1', 'key': {'username': 1}},
    {'name': 'username_1', 'key': {'username': 1}, 'unique': True, 'sparse': True},
    {'name': 'username_1', 'key': {'username': -1}, 'unique': True},
    {'name': 'email_1', 'key': {'email': 1}, 'unique': True},
])
def test_is_equivalent_username_index_rejects_non_equivalent_specs(index_spec):
    assert _is_equivalent_username_index(index_spec) is False


def test_find_equivalent_username_index_name_returns_existing_name(monkeypatch):
    fake_users = _FakeUsersCollection(indexes=[
        {'name': '_id_', 'key': {'_id': 1}},
        {'name': 'users_username_unique', 'key': {'username': 1}, 'unique': True},
    ])
    monkeypatch.setattr('backend.core.database.db', _FakeDatabase(fake_users))

    assert asyncio.run(_find_equivalent_username_index_name()) == 'users_username_unique'


def test_ensure_users_indexes_skips_duplicate_username_creation_when_equivalent_index_exists(monkeypatch):
    fake_users = _FakeUsersCollection(indexes=[
        {'name': 'users_username_unique', 'key': {'username': 1}, 'unique': True},
    ])
    monkeypatch.setattr('backend.core.database.db', _FakeDatabase(fake_users))

    asyncio.run(_ensure_users_indexes())

    assert fake_users.create_index_calls == [
        ([('email', 1)], {'sparse': True}),
        ([('username_normalized', 1)], {
            'unique': True,
            'partialFilterExpression': {'username_normalized': {'$exists': True, '$type': 'string'}},
        }),
        ([('email_normalized', 1)], {
            'unique': True,
            'partialFilterExpression': {'email_normalized': {'$exists': True, '$type': 'string', '$gt': ''}},
        }),
        ([('google_auth.sub', 1)], {
            'unique': True,
            'partialFilterExpression': {'google_auth.sub': {'$exists': True, '$type': 'string', '$gt': ''}},
        }),
    ]


def test_ensure_users_indexes_reuses_equivalent_index_after_conflict(monkeypatch):
    conflict = OperationFailure(
        'Index already exists with a different name: users_username_unique',
        code=85,
        details={'codeName': 'IndexOptionsConflict'},
    )
    fake_users = _FakeUsersCollection(
        indexes=[],
        create_index_side_effects=[conflict, 'email_1'],
    )
    monkeypatch.setattr('backend.core.database.db', _FakeDatabase(fake_users))

    asyncio.run(_ensure_users_indexes())

    assert fake_users.create_index_calls == [
        ([('username', 1)], {'unique': True}),
        ([('email', 1)], {'sparse': True}),
        ([('username_normalized', 1)], {
            'unique': True,
            'partialFilterExpression': {'username_normalized': {'$exists': True, '$type': 'string'}},
        }),
        ([('email_normalized', 1)], {
            'unique': True,
            'partialFilterExpression': {'email_normalized': {'$exists': True, '$type': 'string', '$gt': ''}},
        }),
        ([('google_auth.sub', 1)], {
            'unique': True,
            'partialFilterExpression': {'google_auth.sub': {'$exists': True, '$type': 'string', '$gt': ''}},
        }),
    ]


def test_ensure_users_indexes_raises_when_conflict_is_not_equivalent(monkeypatch):
    conflict = OperationFailure(
        'Index already exists with a different name: users_username_unique',
        code=85,
        details={'codeName': 'IndexOptionsConflict'},
    )
    fake_users = _FakeUsersCollection(
        indexes=[
            {'name': 'users_username_unique', 'key': {'username': 1}, 'unique': False},
        ],
        create_index_side_effects=[conflict],
    )
    monkeypatch.setattr('backend.core.database.db', _FakeDatabase(fake_users))

    with pytest.raises(OperationFailure):
        asyncio.run(_ensure_users_indexes())


def test_ensure_user_sessions_indexes_creates_expected_indexes(monkeypatch):
    fake_users = _FakeUsersCollection(indexes=[])
    fake_sessions = _FakeCreateIndexesCollection()
    monkeypatch.setattr('backend.core.database.db', _FakeDatabase(fake_users, fake_sessions))

    asyncio.run(_ensure_user_sessions_indexes())

    assert len(fake_sessions.create_indexes_calls) == 1
    created_indexes = fake_sessions.create_indexes_calls[0]
    assert len(created_indexes) == 6
    created_specs = [index.document for index in created_indexes]
    assert any(
        list(spec["key"].items()) == [("user_id", 1), ("revoked_at", 1), ("last_seen_at", -1)]
        for spec in created_specs
    )


def test_ensure_google_auth_ticket_indexes_creates_expected_indexes(monkeypatch):
    fake_users = _FakeUsersCollection(indexes=[])
    fake_tickets = _FakeCreateIndexesCollection()
    monkeypatch.setattr(
        'backend.core.database.db',
        _FakeDatabase(fake_users, google_auth_tickets=fake_tickets),
    )

    asyncio.run(_ensure_google_auth_ticket_indexes())

    assert len(fake_tickets.create_indexes_calls) == 1
    assert len(fake_tickets.create_indexes_calls[0]) == 2


def test_ensure_auth_security_indexes_creates_expected_indexes(monkeypatch):
    fake_users = _FakeUsersCollection(indexes=[])
    fake_attempts = _FakeCreateIndexesCollection()
    fake_audit = _FakeCreateIndexesCollection()
    monkeypatch.setattr(
        'backend.core.database.db',
        _FakeDatabase(
            fake_users,
            auth_attempt_counters=fake_attempts,
            security_audit_events=fake_audit,
        ),
    )

    asyncio.run(_ensure_auth_security_indexes())

    assert len(fake_attempts.create_indexes_calls) == 1
    assert len(fake_attempts.create_indexes_calls[0]) == 3
    assert len(fake_audit.create_indexes_calls) == 1
    assert len(fake_audit.create_indexes_calls[0]) == 3


def test_ensure_indexes_creates_expected_unique_indexes_for_flat_domain(monkeypatch):
    fake_db = _FakeEnsureIndexesDatabase()
    monkeypatch.setattr("backend.core.database.db", fake_db)

    asyncio.run(ensure_indexes())

    def _index_specs(collection_name: str):
        created = fake_db[collection_name].create_indexes_calls
        assert created, f"expected indexes for {collection_name}"
        return [index.document for index in created[0]]

    def _has_index(
        specs,
        keys,
        *,
        unique: bool | None = None,
    ) -> bool:
        for spec in specs:
            if list(spec["key"].items()) != keys:
                continue
            if unique is not None and spec.get("unique") is not unique:
                continue
            return True
        return False

    course_specs = _index_specs("course_sections")
    enrollment_specs = _index_specs("enrollments")
    assignment_specs = _index_specs("assignments")
    submission_specs = _index_specs("submissions")
    document_specs = _index_specs("documents")
    grade_specs = _index_specs("grades")
    indexing_job_specs = _index_specs("indexing_jobs")
    background_job_specs = _index_specs("background_jobs")
    file_asset_specs = _index_specs("file_assets")

    assert _has_index(
        course_specs,
        [("courseCode", 1), ("semester", 1)],
        unique=True,
    )
    assert _has_index(
        enrollment_specs,
        [("courseSectionId", 1), ("userId", 1)],
        unique=True,
    )
    assert _has_index(
        enrollment_specs,
        [("courseSectionId", 1), ("updatedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        enrollment_specs,
        [("userId", 1), ("updatedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        assignment_specs,
        [("courseSectionId", 1), ("dueAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        submission_specs,
        [("assignmentId", 1), ("studentId", 1), ("attemptNo", 1)],
        unique=True,
    )
    assert _has_index(
        submission_specs,
        [("assignmentId", 1), ("submittedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        submission_specs,
        [("studentId", 1), ("submittedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        document_specs,
        [("ownerId", 1), ("updatedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        document_specs,
        [("ownerId", 1), ("sourceType", 1), ("updatedAt", -1), ("createdAt", -1)],
    )
    assert _has_index(
        grade_specs,
        [("submissionId", 1)],
        unique=True,
    )
    assert _has_index(
        indexing_job_specs,
        [("course_id", 1), ("filename", 1), ("content_hash", 1), ("chapter_id", 1), ("status", 1), ("created_at", -1)],
    )
    assert _has_index(
        indexing_job_specs,
        [("course_id", 1), ("normalized_hash", 1), ("status", 1), ("created_at", -1)],
    )
    assert _has_index(
        background_job_specs,
        [("job_id", 1)],
        unique=True,
    )
    assert _has_index(
        background_job_specs,
        [("status", 1), ("available_at", 1), ("created_at", 1)],
    )
    assert _has_index(
        background_job_specs,
        [("job_type", 1), ("status", 1), ("available_at", 1), ("created_at", 1)],
    )
    assert _has_index(
        background_job_specs,
        [("status", 1), ("lease_expires_at", 1)],
    )
    assert _has_index(
        file_asset_specs,
        [("file_type", 1), ("public_url", 1)],
    )


def test_db_proxy_recreates_client_when_event_loop_changes(monkeypatch):
    import backend.core.database as database_module

    close_database_client()
    _FakeMotorClient.instances = []

    loop_state = {"loop": object()}

    def _get_running_loop():
        return loop_state["loop"]

    monkeypatch.setattr(database_module, "AsyncIOMotorClient", _FakeMotorClient)
    monkeypatch.setattr(database_module.asyncio, "get_running_loop", _get_running_loop)

    first_client = _get_client()
    assert database_module.db.users == "users:1"
    assert database_module.db["indexing_jobs"] == "indexing_jobs:1"

    loop_state["loop"] = object()
    second_client = _get_client()
    assert database_module.db.users == "users:2"
    assert first_client is not second_client
    assert first_client.closed is True

    close_database_client()
    assert second_client.closed is True


def test_db_proxy_supports_sequential_app_lifespans(monkeypatch):
    import backend.core.database as database_module

    close_database_client()
    _LoopCheckingMotorClient.instances = []
    monkeypatch.setattr(database_module, "AsyncIOMotorClient", _LoopCheckingMotorClient)

    router = APIRouter()

    @router.get("/loop-check")
    async def loop_check():
        doc = await database_module.db.users.find_one({"probe": True})
        return doc

    app = create_app(
        title="db-loop-regression",
        versioned_routers=(router,),
        require_gateway_token=False,
        ensure_indexes_on_startup=False,
        enable_rag_preload=False,
    )

    with TestClient(app) as client:
        response = client.get("/api/loop-check")
        assert response.status_code == 200
        assert response.json()["ok"] is True

    with TestClient(app) as client:
        response = client.get("/api/loop-check")
        assert response.status_code == 200
        assert response.json()["ok"] is True

    assert len(_LoopCheckingMotorClient.instances) == 2
    assert _LoopCheckingMotorClient.instances[0].closed is True
    assert _LoopCheckingMotorClient.instances[1].closed is True
