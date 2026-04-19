"""
Locust Load Test — RAG Pressure Testing
Usage:
    # Web UI mode (recommended, open http://localhost:8089)
    locust -f locustfile.py --host http://localhost:5009

    # Headless mode (快速出报告)
    locust -f locustfile.py --host http://localhost:5009 \
        --headless -u 20 -r 2 --run-time 2m \
        --html reports/locust_report.html --csv reports/locust

Scenarios:
    RagQueryUser  — 专注 RAG 检索压测 (main scenario)
    ChatStreamUser — 端到端 SSE streaming chat 压测
"""

from __future__ import annotations

import json
import random
import time

from locust import HttpUser, SequentialTaskSet, between, events, task

# ── 测试用账号 ────────────────────────────────────────────────────
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"

# ── 已索引课程 (从 backend/generated/vectorstore/courses/ 发现) ──
INDEXED_COURSES = ["ELEC3332", "ELEC4848"]

# ── 测试查询集 (覆盖 RAG 强制检索场景) ─────────────────────────
RAG_QUERIES = [
    # 通用教育问题
    "What is the main concept explained in this course?",
    "Explain the key principles covered in the lecture notes.",
    "Summarize the important formulas mentioned in the materials.",
    "What are the prerequisites for understanding this topic?",
    "Describe the difference between the two methods discussed.",
    # ELEC 相关问题
    "What is the role of impedance matching in RF circuits?",
    "Explain the working principle of a power amplifier.",
    "How does a phase-locked loop work?",
    "What are the key parameters of an antenna?",
    "Describe the characteristics of MOSFET in saturation region.",
    "How is signal-to-noise ratio calculated?",
    "What is the bandwidth-efficiency tradeoff in communication systems?",
    "Explain the concept of Fourier transform in signal processing.",
    "How does feedback affect the stability of an amplifier?",
    "What is the purpose of modulation in wireless communications?",
]


# ─────────────────────────────────────────────────────────────────
# Scenario 1: RAG Retrieval Load Test (admin test-retrieval endpoint)
# 直接命中 CourseRagService.retrieve_for_student()，无 LLM 调用
# ─────────────────────────────────────────────────────────────────

class RagRetrievalTasks(SequentialTaskSet):
    """Sequential task set: login once, then hammer RAG retrieval."""

    def on_start(self):
        """Login and verify auth before running tasks."""
        with self.client.post(
            "/api/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            catch_response=True,
            name="[auth] POST /api/login",
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"Login failed: {resp.status_code} {resp.text[:200]}")
                self.interrupt(reschedule=False)
            else:
                resp.success()

    @task(10)
    def rag_test_retrieval(self):
        """Core RAG retrieval stress test — exercises BM25 + vector hybrid search."""
        course_id = random.choice(INDEXED_COURSES)
        query = random.choice(RAG_QUERIES)
        top_k = random.choice([3, 5, 8])

        with self.client.post(
            f"/api/ai/index-course/{course_id}/test-retrieval",
            json={"query": query, "top_k": top_k},
            catch_response=True,
            name="[rag] POST /api/ai/index-course/test-retrieval",
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                latency = data.get("latency_ms", -1)
                results_count = len(data.get("results", []))
                if results_count == 0:
                    # 没有结果也算成功，只是标注
                    resp.success()
                else:
                    resp.success()
                    # 把服务端自报的延迟也记录下来
                    events.request.fire(
                        request_type="RAG_INTERNAL",
                        name="rag_retrieval_latency_ms",
                        response_time=latency,
                        response_length=results_count,
                        exception=None,
                        context={},
                    )
            elif resp.status_code == 403:
                resp.failure("Permission denied — check user role")
            elif resp.status_code == 404:
                resp.failure(f"Course not found: {course_id}")
            else:
                resp.failure(f"Unexpected {resp.status_code}: {resp.text[:200]}")

    @task(3)
    def index_summary(self):
        """Lightweight read — course index metadata (no retrieval)."""
        with self.client.get(
            "/api/ai/index-course/summary",
            catch_response=True,
            name="[rag] GET /api/ai/index-course/summary",
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"{resp.status_code}")

    @task(1)
    def health_check(self):
        """Baseline latency reference."""
        with self.client.get(
            "/api/health",
            catch_response=True,
            name="[sys] GET /api/health",
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"{resp.status_code}")


class RagQueryUser(HttpUser):
    """
    Main load test user for RAG pipeline.
    Simulates concurrent teacher/admin users querying the RAG retrieval engine.
    """
    tasks = [RagRetrievalTasks]
    wait_time = between(0.5, 2.0)  # 模拟真实用户思考间隔


# ─────────────────────────────────────────────────────────────────
# Scenario 2: End-to-End Chat Streaming (LLM + RAG, slower)
# 注意: 受 rate limit 30次/min 约束，并发不要超过 5 个用户
# ─────────────────────────────────────────────────────────────────

class ChatStreamUser(HttpUser):
    """
    End-to-end SSE streaming chat load test.
    WARNING: Each request calls an external LLM — use low concurrency (≤5 users).
    """
    tasks = []  # 默认不参与，按需在命令行用 --tags 开启
    wait_time = between(5, 10)

    def on_start(self):
        resp = self.client.post(
            "/api/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            name="[auth] POST /api/login",
        )
        if resp.status_code != 200:
            self.environment.runner.quit()

    @task
    def chat_stream(self):
        """Full streaming chat — measures TTFB (time-to-first-byte) and total stream time."""
        query = random.choice(RAG_QUERIES[:5])  # 用前5个通用问题
        payload = {
            "messages": [{"role": "user", "content": query}],
            "provider": "local_ollama",
            "tutor_mode": "tutor",
        }

        start = time.perf_counter()
        first_byte_ms = None
        total_bytes = 0

        with self.client.post(
            "/api/ai/chat",
            json=payload,
            stream=True,
            catch_response=True,
            name="[chat] POST /api/ai/chat (SSE)",
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"Chat failed: {resp.status_code}")
                return

            for chunk in resp.iter_content(chunk_size=None):
                if chunk:
                    if first_byte_ms is None:
                        first_byte_ms = round((time.perf_counter() - start) * 1000, 1)
                    total_bytes += len(chunk)

            resp.success()

        if first_byte_ms is not None:
            events.request.fire(
                request_type="SSE_TTFB",
                name="chat_time_to_first_byte_ms",
                response_time=first_byte_ms,
                response_length=total_bytes,
                exception=None,
                context={},
            )


# ─────────────────────────────────────────────────────────────────
# 自定义统计：每 30 秒打印 RAG 服务端延迟摘要
# ─────────────────────────────────────────────────────────────────

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """打印最终 RAG 内部延迟统计（来自服务端自报的 latency_ms）。"""
    stats = environment.stats.get("rag_retrieval_latency_ms", "RAG_INTERNAL")
    if stats and hasattr(stats, "avg_response_time"):
        print("\n" + "=" * 60)
        print("RAG Internal Retrieval Latency (server-reported)")
        print(f"  Requests : {stats.num_requests}")
        print(f"  Avg      : {stats.avg_response_time:.1f} ms")
        print(f"  Min      : {stats.min_response_time:.1f} ms")
        print(f"  Max      : {stats.max_response_time:.1f} ms")
        print("=" * 60 + "\n")
