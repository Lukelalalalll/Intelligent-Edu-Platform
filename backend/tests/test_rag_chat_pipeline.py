from backend.services.rag_chat_pipeline import (
    build_rewrite_prompt,
    pack_evidence,
    postcheck_and_downgrade,
    sanitize_rewrite_output,
    should_retry_empty,
    should_return_insufficient,
    task_profile_for_phase,
)


def test_task_profile_selection():
    assert task_profile_for_phase("rewrite") == "light"
    assert task_profile_for_phase("intent") == "light"
    assert task_profile_for_phase("answer") == "heavy"


def test_two_stage_rewrite_prompt_and_sanitize():
    prompt = build_rewrite_prompt("What is TCP congestion control?", tutor_mode="tutor")
    assert "Rewrite the user query for document retrieval" in prompt

    rewritten = sanitize_rewrite_output(
        original_query="What is TCP congestion control?",
        rewritten="TCP congestion control phases slow start congestion avoidance",
    )
    assert "congestion" in rewritten.lower()


def test_retry_and_second_empty_behavior():
    assert should_retry_empty(first_result_count=0, retry_enabled=True)
    assert not should_retry_empty(first_result_count=2, retry_enabled=True)
    assert should_return_insufficient(second_result_count=0)
    assert not should_return_insufficient(second_result_count=1)


def test_evidence_packing_budget():
    retrieved = [
        {"course_id": "c1", "doc_name": "a", "score": 0.9, "text": "alpha " * 80},
        {"course_id": "c1", "doc_name": "b", "score": 0.8, "text": "beta " * 80},
        {"course_id": "c1", "doc_name": "c", "score": 0.7, "text": "gamma " * 80},
    ]
    packed = pack_evidence(
        retrieved,
        answer_top_k=2,
        max_total_chars=500,
        max_chars_per_chunk=180,
    )
    assert len(packed) <= 2
    assert sum(len(p["text"]) for p in packed) <= 500


def test_postcheck_downgrades_unsupported_claims():
    answer = "The protocol guarantees zero packet loss in all networks."
    evidence = [{"text": "The protocol reduces congestion probability under typical load."}]
    revised, downgraded = postcheck_and_downgrade(answer=answer, evidence_cards=evidence)
    assert downgraded >= 1
    assert "uncertain" in revised
