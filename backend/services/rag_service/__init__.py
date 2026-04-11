"""rag_service — unified facade for all RAG-related services.

Provides a single import point for consumers that need RAG functionality.
All original module paths remain valid; this package adds a convenient
aggregated namespace without moving any files.

Usage:
    from backend.services.rag_service import (
        CourseRagService, course_rag_service,
        LocalRagService, LangChainRagService,
        pack_evidence, build_rewrite_prompt,
        list_datasets, run_evaluation,
    )
"""

# Course RAG (package)
from backend.services.course_rag_service import (  # noqa: F401
    CourseRagService,
    course_rag_service,
    CourseChunk,
)

# TF-IDF / local RAG
from backend.services.tfidf_rag_service import (  # noqa: F401
    RetrievedChunk,
    LocalRagService,
)

# Vector / LangChain RAG
from backend.services.vector_rag_service import (  # noqa: F401
    RetrievalItem,
    LangChainRagService,
)

# RAG chat pipeline helpers
from backend.services.rag_chat_pipeline import (  # noqa: F401
    task_profile_for_phase,
    build_rewrite_prompt,
    sanitize_rewrite_output,
    pack_evidence,
    evidence_insufficient_message,
    should_retry_empty,
    should_return_insufficient,
    postcheck_and_downgrade,
)

# RAG evaluation service
from backend.services.rag_eval_service import (  # noqa: F401
    create_dataset,
    list_datasets,
    get_dataset,
    delete_dataset,
    run_evaluation,
    case_test,
    list_runs,
    get_run,
)

__all__ = [
    # Course RAG
    "CourseRagService", "course_rag_service", "CourseChunk",
    # TF-IDF RAG
    "RetrievedChunk", "LocalRagService",
    # Vector RAG
    "RetrievalItem", "LangChainRagService",
    # Chat pipeline
    "task_profile_for_phase", "build_rewrite_prompt", "sanitize_rewrite_output",
    "pack_evidence", "evidence_insufficient_message",
    "should_retry_empty", "should_return_insufficient", "postcheck_and_downgrade",
    # Eval
    "create_dataset", "list_datasets", "get_dataset", "delete_dataset",
    "run_evaluation", "case_test", "list_runs", "get_run",
]
