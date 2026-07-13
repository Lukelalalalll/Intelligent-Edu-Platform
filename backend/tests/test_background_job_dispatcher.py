from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.services.background_job_dispatcher import BackgroundJobDispatcher


class _FakeBackgroundJobRepo:
    def __init__(self):
        self.documents: dict[str, dict] = {}

    async def insert_job(self, document: dict):
        self.documents[document["job_id"]] = dict(document)
        return type("InsertResult", (), {"inserted_id": document["job_id"]})()

    async def claim_job(self, *, worker_id: str, now: datetime, lease_expires_at: datetime, job_types=None, job_id=None):
        candidates = list(self.documents.values())
        if job_types:
            candidates = [doc for doc in candidates if doc.get("job_type") in set(job_types)]
        if job_id:
            candidates = [doc for doc in candidates if doc.get("job_id") == job_id]

        pending = [
            doc for doc in candidates
            if (
                (doc.get("status") == "pending" and doc.get("available_at") <= now)
                or (doc.get("status") == "running" and doc.get("lease_expires_at") and doc.get("lease_expires_at") <= now)
            )
        ]
        if not pending:
            return None

        chosen = sorted(pending, key=lambda item: (item.get("available_at"), item.get("created_at")))[0]
        chosen["status"] = "running"
        chosen["claimed_by"] = worker_id
        chosen["claimed_at"] = now
        chosen["lease_expires_at"] = lease_expires_at
        chosen["updated_at"] = now
        chosen["last_error"] = ""
        chosen["attempts"] = int(chosen.get("attempts", 0)) + 1
        return dict(chosen)

    async def mark_done(self, *, job_id: str, worker_id: str, now: datetime, result: dict | None = None):
        doc = self.documents.get(job_id)
        if not doc or doc.get("status") != "running" or doc.get("claimed_by") != worker_id:
            return None
        doc["status"] = "done"
        doc["result"] = result
        doc["updated_at"] = now
        doc["completed_at"] = now
        return dict(doc)

    async def mark_failed(self, *, job_id: str, worker_id: str, now: datetime, error: str):
        doc = self.documents.get(job_id)
        if not doc or doc.get("status") != "running" or doc.get("claimed_by") != worker_id:
            return None
        doc["status"] = "failed"
        doc["last_error"] = error
        doc["updated_at"] = now
        doc["failed_at"] = now
        return dict(doc)


@pytest.mark.asyncio
async def test_dispatcher_enqueue_claim_and_mark_done_round_trip():
    repo = _FakeBackgroundJobRepo()
    dispatcher = BackgroundJobDispatcher(repo=repo)

    enqueued = await dispatcher.enqueue(
        job_type="indexing.process",
        payload={"job_id": "idx-1"},
        metadata={"owner_job_id": "idx-1"},
    )
    claimed = await dispatcher.claim(worker_id="worker-1", job_types=["indexing.process"], job_id=enqueued["job_id"])
    completed = await dispatcher.mark_done(
        job_id=enqueued["job_id"],
        worker_id="worker-1",
        result={"status": "done"},
    )

    assert enqueued["status"] == "pending"
    assert claimed["status"] == "running"
    assert claimed["payload"]["job_id"] == "idx-1"
    assert claimed["attempts"] == 1
    assert completed["status"] == "done"
    assert completed["result"] == {"status": "done"}


@pytest.mark.asyncio
async def test_dispatcher_mark_failed_records_error():
    repo = _FakeBackgroundJobRepo()
    dispatcher = BackgroundJobDispatcher(repo=repo)

    enqueued = await dispatcher.enqueue(job_type="slides.generate_v2", payload={"task_id": "task-1"})
    claimed = await dispatcher.claim(worker_id="worker-2", job_types=["slides.generate_v2"], job_id=enqueued["job_id"])
    failed = await dispatcher.mark_failed(
        job_id=enqueued["job_id"],
        worker_id="worker-2",
        error="provider unavailable",
    )

    assert claimed["status"] == "running"
    assert failed["status"] == "failed"
    assert failed["last_error"] == "provider unavailable"
