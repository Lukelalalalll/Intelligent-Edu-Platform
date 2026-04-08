"""
Schemas package — re-exports all schemas for backward compatibility.
Import from backend.schemas.<module> for explicit imports, or from
backend.schemas directly for convenience.
"""

from backend.schemas.auth import (  # noqa: F401
    AuthSchema,
    UpdateProfileSchema,
    ResetPasswordSchema,
    TeacherPreferencesSchema,
)

from backend.schemas.ai import (  # noqa: F401
    ChatMessageSchema,
    RagChunkSchema,
    RagContextSchema,
    GradingContextSchema,
    AiChatSchema,
    StudyCozeSchema,
    AnalyzeSubmissionSchema,
    FeedbackSchema,
    AnnotateSchema,
)

from backend.schemas.grading import (  # noqa: F401
    AnnotationPayload,
    SubmissionScoreSchema,
    FinalizeAnnotationsSchema,
    CourseSectionSchema,
    EnrollmentSchema,
    AssignmentSchema,
    SubmissionSchema,
    DocumentSchema,
    GradeSchema,
    StudentSubmissionCreateSchema,
)

from backend.schemas.slides import (  # noqa: F401
    CombineSchema,
    SaveHighlightsSchema,
    SummarizeRequestSchema,
    ClassifyHighlightsSchema,
    BatchHighlightActionSchema,
    GenerateScriptSchema,
    MapToSlidesSchema,
    ValidateSlidesSchema,
    EvaluateQualitySchema,
    SummarizeChaptersSchema,
    PptProcessSchema,
)

from backend.schemas.questions import (  # noqa: F401
    ExtractQuestionsSchema,
    GenerateQuestionsSchema,
    ExportQuestionsSchema,
    UploadScreenshotSchema,
)

from backend.schemas.diagram import (  # noqa: F401
    SearchSvgSchema,
    DownloadSvgSchema,
)

from backend.schemas.admin import (  # noqa: F401
    AdminCourseSchema,
    AdminCourseStudentSchema,
    AdminAssignmentSchema,
    AdminDbDocumentSchema,
)

from backend.schemas.chat import (  # noqa: F401
    ChatSendMessageSchema,
    ChatCreateRoomSchema,
    ChatFriendRequestSchema,
    ChatCreateDirectRoomSchema,
    ChatCreateCourseGroupSchema,
    ChatTranslateSchema,
    ChatBatchDeleteSchema,
    ChatForwardSchema,
    ChatAiSummarySchema,
    ChatAiReplySuggestionsSchema,
    ChatAiRewriteSchema,
    ChatAiAssistantSchema,
    ChatTransferStartSchema,
)
