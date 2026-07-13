"""Tests for RAG Telemetry — alert rules and hit-rate monitoring."""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.infrastructure.rag_telemetry import (
    RAGTelemetry,
    DEFAULT_THRESHOLDS,
    COLLECTION,
)


@pytest.fixture
def telemetry():
    return RAGTelemetry()


@pytest.fixture
def mock_db():
    with patch("backend.infrastructure.rag_telemetry.db") as mock:
        yield mock


def _make_aggregate_row(
    total=100,
    empty_count=10,
    avg_latency=150.0,
    latencies=None,
    avg_result_count=4.5,
    hybrid_count=80,
):
    return {
        "_id": None,
        "total": total,
        "empty_count": empty_count,
        "avg_latency_ms": avg_latency,
        "latencies": latencies or [100.0] * total,
        "avg_result_count": avg_result_count,
        "hybrid_count": hybrid_count,
    }


def _make_hit_rate_row(total=100, hits=90):
    return {"_id": None, "total": total, "hits": hits}


class TestRecord:
    """Write path — record() method."""

    def test_record_inserts_document(self, telemetry, mock_db):
        mock_db.__getitem__.return_value.insert_one = AsyncMock()

        asyncio.new_event_loop().run_until_complete(
            telemetry.record(
                user_id="stu001",
                role="student",
                course_ids=["CS101"],
                query="What is OOP?",
                result_count=4,
                latency_ms=112.5,
                use_hybrid=True,
                top_k=5,
            )
        )

        assert mock_db.__getitem__.return_value.insert_one.called
        doc = mock_db.__getitem__.return_value.insert_one.call_args[0][0]
        assert doc["user_id"] == "stu001"
        assert doc["role"] == "student"
        assert doc["course_ids"] == ["CS101"]
        assert doc["query_len"] == len("What is OOP?")
        assert doc["result_count"] == 4
        assert doc["empty"] is False
        assert doc["latency_ms"] == 112.5
        assert doc["use_hybrid"] is True
        assert doc["top_k"] == 5
        assert "timestamp" in doc

    def test_record_empty_result(self, telemetry, mock_db):
        mock_db.__getitem__.return_value.insert_one = AsyncMock()

        asyncio.new_event_loop().run_until_complete(
            telemetry.record(query="abc", result_count=0)
        )

        doc = mock_db.__getitem__.return_value.insert_one.call_args[0][0]
        assert doc["empty"] is True

    def test_record_rounds_latency(self, telemetry, mock_db):
        mock_db.__getitem__.return_value.insert_one = AsyncMock()

        asyncio.new_event_loop().run_until_complete(
            telemetry.record(query="test", latency_ms=123.456789, result_count=1)
        )

        doc = mock_db.__getitem__.return_value.insert_one.call_args[0][0]
        assert doc["latency_ms"] == 123.46

    def test_record_stores_metadata(self, telemetry, mock_db):
        mock_db.__getitem__.return_value.insert_one = AsyncMock()

        asyncio.new_event_loop().run_until_complete(
            telemetry.record(
                query="test",
                result_count=1,
                metadata={"source": "rag_eval", "run_id": "r001"},
            )
        )

        doc = mock_db.__getitem__.return_value.insert_one.call_args[0][0]
        assert doc["metadata"] == {"source": "rag_eval", "run_id": "r001"}

    def test_record_survives_db_error(self, telemetry, mock_db):
        mock_db.__getitem__.return_value.insert_one = AsyncMock(
            side_effect=Exception("Mongo down")
        )
        # Should not raise
        asyncio.new_event_loop().run_until_complete(
            telemetry.record(query="test", result_count=1)
        )


class TestGetStats:
    """Read path — get_stats()."""

    def test_get_stats_returns_period_and_total(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_aggregate_row()])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        stats = asyncio.new_event_loop().run_until_complete(telemetry.get_stats(hours=24))
        assert stats["period_hours"] == 24
        assert stats["total"] == 100

    def test_get_stats_empty_returns_zero_total(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        stats = asyncio.new_event_loop().run_until_complete(telemetry.get_stats(hours=48))
        assert stats["period_hours"] == 48
        assert stats["total"] == 0

    def test_get_stats_computes_percentiles(self, telemetry, mock_db):
        latencies = list(range(1, 101))  # 1..100 ms
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_aggregate_row(total=100, latencies=latencies)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        stats = asyncio.new_event_loop().run_until_complete(telemetry.get_stats())
        assert abs(stats["p50_latency_ms"] - 50) < 15  # ~median, t-digest approximation
        assert abs(stats["p95_latency_ms"] - 95) < 15

    def test_get_stats_computes_hybrid_pct(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_aggregate_row(total=100, hybrid_count=60)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        stats = asyncio.new_event_loop().run_until_complete(telemetry.get_stats())
        assert stats["hybrid_pct"] == 60.0


class TestCheckAlerts:
    """Alert rules — check_alerts()."""

    def test_no_alerts_when_low_sample_count(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_aggregate_row(total=3)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        with patch.object(telemetry, "_get_hit_rate", return_value=0.9):
            alerts = asyncio.new_event_loop().run_until_complete(telemetry.check_alerts(hours=1))
        assert alerts == []

    def test_alerts_on_high_p95_latency(self, telemetry, mock_db):
        # Create 100 latencies where ~96 exceed 2000ms threshold
        latencies = [1000.0] * 94 + [3000.0] * 6  # p95~=3000
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_aggregate_row(total=100, latencies=latencies, empty_count=0)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        with patch.object(telemetry, "_get_hit_rate", return_value=0.9):
            alerts = asyncio.new_event_loop().run_until_complete(telemetry.check_alerts(hours=1))
        p95_alert = next((a for a in alerts if a["rule"] == "p95_latency"), None)
        assert p95_alert is not None
        assert p95_alert["severity"] == "warning"
        assert p95_alert["value"] > 2000

    def test_alerts_on_high_empty_rate(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[_make_aggregate_row(total=100, empty_count=30)]  # 30% empty
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        with patch.object(telemetry, "_get_hit_rate", return_value=0.9):
            alerts = asyncio.new_event_loop().run_until_complete(telemetry.check_alerts(hours=1))
        empty_alert = next((a for a in alerts if a["rule"] == "empty_retrieval_rate"), None)
        assert empty_alert is not None
        assert empty_alert["value"] == 0.3

    def test_no_alert_when_below_threshold(self, telemetry, mock_db):
        latencies = [100.0] * 100
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[_make_aggregate_row(total=100, empty_count=5, latencies=latencies)]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        with patch.object(telemetry, "_get_hit_rate", return_value=0.9):
            alerts = asyncio.new_event_loop().run_until_complete(telemetry.check_alerts(hours=1))
        assert alerts == []

    def test_respects_custom_thresholds(self, telemetry, mock_db):
        latencies = [500.0] * 100
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[_make_aggregate_row(total=100, empty_count=0, latencies=latencies)]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        with patch.object(telemetry, "_get_hit_rate", return_value=0.9):
            # Custom low p95 threshold — should trigger
            alerts = asyncio.new_event_loop().run_until_complete(
                telemetry.check_alerts(hours=1, thresholds={"p95_latency_ms": 100})
            )
        p95_alert = next((a for a in alerts if a["rule"] == "p95_latency"), None)
        assert p95_alert is not None

    def test_hit_rate_drop_alert(self, telemetry, mock_db):
        """Test that a significant hit-rate drop triggers the alert."""
        # Mock get_stats to return valid base stats
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[_make_aggregate_row(total=100, empty_count=0)]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        # Mock _get_hit_rate: 10% current, 95% baseline → 85 pp drop
        async def mock_hit_rate(start, end):
            now = datetime.now(timezone.utc)
            if start >= now - timedelta(hours=2):
                return 0.1
            return 0.95

        with patch.object(telemetry, "_get_hit_rate", side_effect=mock_hit_rate):
            alerts = asyncio.new_event_loop().run_until_complete(
                telemetry.check_alerts(hours=1)
            )
            hit_drop = next((a for a in alerts if a["rule"] == "hit_rate_drop"), None)
            assert hit_drop is not None
            assert hit_drop["value"] >= 10  # pp drop

    def test_hit_rate_drop_skips_when_no_baseline(self, telemetry, mock_db):
        """When baseline data is not available, hit_rate_drop should be skipped gracefully."""
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[_make_aggregate_row(total=100, empty_count=0)]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        async def mock_hit_rate(start, end):
            return None  # no baseline data

        with patch.object(telemetry, "_get_hit_rate", side_effect=mock_hit_rate):
            alerts = asyncio.new_event_loop().run_until_complete(
                telemetry.check_alerts(hours=1)
            )
            hit_drops = [a for a in alerts if a["rule"] == "hit_rate_drop"]
            assert hit_drops == []


class TestGetHitRate:
    """Unit test for _get_hit_rate helper."""

    def test_returns_hit_ratio(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_hit_rate_row(100, 85)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        now = datetime.now(timezone.utc)
        result = asyncio.new_event_loop().run_until_complete(
            telemetry._get_hit_rate(now - timedelta(hours=1), now)
        )
        assert result == 0.85

    def test_returns_none_when_no_data(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        now = datetime.now(timezone.utc)
        result = asyncio.new_event_loop().run_until_complete(
            telemetry._get_hit_rate(now - timedelta(hours=1), now)
        )
        assert result is None

    def test_returns_none_when_zero_total(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(return_value=[_make_hit_rate_row(0, 0)])
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        now = datetime.now(timezone.utc)
        result = asyncio.new_event_loop().run_until_complete(
            telemetry._get_hit_rate(now - timedelta(hours=1), now)
        )
        assert result is None


class TestDefaultThresholds:
    def test_default_thresholds_have_expected_keys(self):
        assert "p95_latency_ms" in DEFAULT_THRESHOLDS
        assert "empty_retrieval_rate" in DEFAULT_THRESHOLDS
        assert "hit_rate_drop_pct" in DEFAULT_THRESHOLDS

    def test_default_thresholds_are_positive(self):
        for key, val in DEFAULT_THRESHOLDS.items():
            assert val > 0, f"{key} should be positive, got {val}"


class TestCourseBreakdown:
    def test_get_course_breakdown_aggregates(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[
                {"course_id": "CS101", "total": 50, "empty_count": 5, "empty_rate": 0.1, "avg_latency_ms": 120.0},
                {"course_id": "MATH201", "total": 30, "empty_count": 2, "empty_rate": 0.0667, "avg_latency_ms": 95.5},
            ]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        result = asyncio.new_event_loop().run_until_complete(telemetry.get_course_breakdown(hours=24))
        assert len(result) == 2
        assert result[0]["course_id"] == "CS101"
        assert result[0]["total"] == 50


class TestRoleBreakdown:
    def test_get_role_breakdown_aggregates(self, telemetry, mock_db):
        mock_agg = AsyncMock()
        mock_agg.to_list = AsyncMock(
            return_value=[
                {"role": "student", "total": 70, "empty_count": 8, "avg_latency_ms": 130.0},
                {"role": "teacher", "total": 30, "empty_count": 2, "avg_latency_ms": 110.0},
            ]
        )
        mock_db.__getitem__.return_value.aggregate.return_value = mock_agg

        result = asyncio.new_event_loop().run_until_complete(telemetry.get_role_breakdown(hours=24))
        assert len(result) == 2
        assert result[0]["role"] == "student"
