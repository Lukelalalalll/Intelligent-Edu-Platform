"""
Migration script: Move annotation JSON files into MongoDB `annotations` collection.

Usage:
    python -m backend.scripts.migrate_annotations_to_mongo

This script:
1. Reads every JSON file in data/annotations/
2. Upserts each into MongoDB `annotations` collection (keyed by submissionId)
3. Creates an index on submissionId for fast lookups
4. Leaves original JSON files untouched as backup
"""
from __future__ import annotations

import json
from pathlib import Path

from pymongo import MongoClient

from backend.config import Config

ROOT_DIR = Path(__file__).resolve().parents[2]
ANNOTATIONS_DIR = ROOT_DIR / "data" / "annotations"


def main() -> None:
    client = MongoClient(Config.MONGO_URI)
    db = client.get_default_database()
    coll = db.annotations

    # Ensure unique index on submissionId
    coll.create_index("submissionId", unique=True)

    if not ANNOTATIONS_DIR.exists():
        print("No annotations directory found. Nothing to migrate.")
        return

    json_files = sorted(ANNOTATIONS_DIR.glob("*.json"))
    if not json_files:
        print("No annotation JSON files found.")
        return

    migrated = 0
    skipped = 0
    errors = 0

    for json_path in json_files:
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  ERROR reading {json_path.name}: {exc}")
            errors += 1
            continue

        submission_id = data.get("submissionId")
        if not submission_id:
            # Derive from filename (e.g., sub_001.json -> sub_001)
            submission_id = json_path.stem
            data["submissionId"] = submission_id

        # Remove _id if present to avoid conflicts
        data.pop("_id", None)

        result = coll.update_one(
            {"submissionId": submission_id},
            {"$set": data},
            upsert=True,
        )

        if result.upserted_id:
            print(f"  INSERTED {submission_id}")
            migrated += 1
        elif result.modified_count > 0:
            print(f"  UPDATED  {submission_id}")
            migrated += 1
        else:
            print(f"  SKIPPED  {submission_id} (no changes)")
            skipped += 1

    print(f"\nMigration complete: {migrated} migrated, {skipped} skipped, {errors} errors")
    print(f"Total documents in annotations collection: {coll.count_documents({})}")


if __name__ == "__main__":
    main()
