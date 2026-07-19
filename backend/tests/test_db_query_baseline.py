from __future__ import annotations

from backend.scripts import db_query_baseline as baseline


def test_extract_find_explain_summary_collects_winning_index_and_stats():
    explain = {
        "queryPlanner": {
            "winningPlan": {
                "stage": "FETCH",
                "inputStage": {
                    "stage": "IXSCAN",
                    "indexName": "members_1_createdAt_-1",
                },
            }
        },
        "executionStats": {
            "nReturned": 3,
            "totalKeysExamined": 3,
            "totalDocsExamined": 3,
            "executionTimeMillis": 1,
        },
    }

    summary = baseline._extract_explain_summary(explain)

    assert summary["winningIndexes"] == ["members_1_createdAt_-1"]
    assert summary["winningPlanStages"] == ["FETCH", "IXSCAN"]
    assert summary["nReturned"] == 3
    assert summary["totalKeysExamined"] == 3
    assert summary["totalDocsExamined"] == 3
    assert summary["executionTimeMillis"] == 1
    assert summary["usesCollectionScan"] is False


def test_extract_aggregate_cursor_explain_summary_collects_cursor_stats():
    explain = {
        "stages": [
            {
                "$cursor": {
                    "queryPlanner": {
                        "winningPlan": {
                            "stage": "IXSCAN",
                            "indexName": "timestamp_-1_provider_1",
                        }
                    },
                    "executionStats": {
                        "nReturned": 10,
                        "totalKeysExamined": 10,
                        "totalDocsExamined": 10,
                        "executionTimeMillis": 2,
                    },
                }
            },
            {"$group": {"_id": "$provider"}},
        ]
    }

    summary = baseline._extract_explain_summary(explain)

    assert summary["winningIndexes"] == ["timestamp_-1_provider_1"]
    assert summary["winningPlanStages"] == ["IXSCAN"]
    assert summary["nReturned"] == 10
    assert summary["totalDocsExamined"] == 10


def test_missing_samples_skip_query_without_placeholder_values():
    spec = {
        "name": "file_assets.knowledge_source_by_name",
        "collection": "file_assets",
        "operation": "find",
    }
    missing = baseline._missing_samples({"file_asset_course_id": "course-1"}, ["file_asset_course_id", "file_asset_filename"])

    skipped = baseline._skip_query(spec, missing)

    assert missing == ["file_asset_filename"]
    assert skipped["execution"] is None
    assert skipped["operation"] == {"type": "find"}
    assert skipped["skippedReason"] == "Missing sample value(s): file_asset_filename"


def test_build_recommendations_flags_collscan_sort_high_scan_and_stale_index():
    execution = {
        "winningIndexes": [],
        "usesCollectionScan": True,
        "hasBlockingSort": True,
        "totalDocsExamined": 2500,
        "nReturned": 10,
    }

    recommendations = baseline._build_recommendations(
        name="admin_db.users_list",
        execution=execution,
        expected_indexes=["role_1_username_1"],
        high_docs_floor=1000,
        high_docs_ratio=20,
    )

    assert any("COLLSCAN detected" in item for item in recommendations)
    assert any("Blocking SORT detected" in item for item in recommendations)
    assert any("High scan ratio" in item for item in recommendations)
    assert any("Expected index not observed" in item for item in recommendations)
