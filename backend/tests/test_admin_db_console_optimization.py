from __future__ import annotations

from bson import ObjectId

from backend.routes.admin_routes import db_console


class _FakeCursor:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.sort_calls: list[list[tuple[str, int]]] = []
        self.skip_calls: list[int] = []
        self.limit_calls: list[int] = []
        self.to_list_lengths: list[int] = []

    def sort(self, spec: list[tuple[str, int]]):
        self.sort_calls.append(spec)
        return self

    def skip(self, value: int):
        self.skip_calls.append(value)
        return self

    def limit(self, value: int):
        self.limit_calls.append(value)
        return self

    async def to_list(self, length: int):
        self.to_list_lengths.append(length)
        return list(self.docs)


class _FakeCollection:
    def __init__(self, docs: list[dict], total: int):
        self.cursor = _FakeCursor(docs)
        self.total = total
        self.count_calls: list[dict] = []
        self.find_calls: list[tuple[dict, dict | None]] = []

    async def count_documents(self, filt: dict):
        self.count_calls.append(filt)
        return self.total

    def find(self, filt: dict, projection: dict | None = None):
        self.find_calls.append((filt, projection))
        return self.cursor


class _FakeDb:
    def __init__(self, users_collection: _FakeCollection):
        self.users_collection = users_collection

    def __getitem__(self, name: str):
        assert name == "users"
        return self.users_collection


async def test_users_console_list_uses_stable_sort_and_preserves_full_documents(monkeypatch):
    user_oid = ObjectId()
    users = _FakeCollection(
        [
            {
                "_id": user_oid,
                "role": "student",
                "username": "alice",
                "email": "alice@example.com",
                "ai_memory": {"tone": "concise"},
            }
        ],
        total=3,
    )
    monkeypatch.setattr(db_console, "db", _FakeDb(users))

    result = await db_console.list_db_documents("users", limit=2, skip=1, q="", admin={"role": "admin"})

    assert users.count_calls == [{}]
    assert users.find_calls == [({}, None)]
    assert users.cursor.sort_calls == [[("role", 1), ("username", 1)]]
    assert users.cursor.skip_calls == [1]
    assert users.cursor.limit_calls == [2]
    assert users.cursor.to_list_lengths == [2]
    assert result["total"] == 3
    assert result["documents"] == [
        {
            "_id": str(user_oid),
            "role": "student",
            "username": "alice",
            "email": "alice@example.com",
            "ai_memory": {"tone": "concise"},
        }
    ]
