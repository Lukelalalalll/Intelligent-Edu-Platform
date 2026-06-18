"""
Schemas package — re-exports all schemas for backward compatibility.
Import from backend.schemas.<module> for explicit imports, or from
backend.schemas directly for convenience.
"""

from backend.schemas.auth import (  # noqa: F401
    AuthSchema,
    BackupCodeRegenSchema,
    GoogleCompleteSchema,
    GoogleLinkSchema,
    GoogleLoginSchema,
    MfaChallengeVerifySchema,
    MfaConfirmSchema,
    MfaDisableSchema,
    MfaEnrollmentStartSchema,
    SelfUpdateProfileSchema,
    UpdateProfileSchema,
    PasswordResetRequestSchema,
    PasswordResetConfirmSchema,
    SessionRevokeSchema,
    StepUpVerifySchema,
    TeacherPreferencesSchema,
    DeepSeekConfigSchema,
    OpenAIConfigSchema,
)

from backend.schemas.ai import (  # noqa: F401
    ChatMessageSchema,
    SessionAttachmentMetaSchema,
    SessionMessageSchema,
    UpdateAiSessionSchema,
    RagChunkSchema,
    RagContextSchema,
    GradingContextSchema,
    AiChatSchema,
    StudyCozeSchema,
    AnalyzeSubmissionSchema,
    FeedbackSchema,
    AnnotateSchema,
    RegradeQuestionSchema,
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
    SlidesGenerateV2Schema,
    SlidesTaskResponseSchema,
    SlidesTaskStatusSchema,
    GenerateRenderRequest,
    ExportRenderDraftRequest,
    RenderDraftPreviewRequest,
    ThemeListResponse,
)

from backend.schemas.questions import (  # noqa: F401
    ExtractQuestionsSchema,
    GenerateQuestionsSchema,
    SuggestConstraintsSchema,
    UploadScreenshotSchema,
    QuestionOpsRunCreateSchema,
    QuestionOpsDedupeApplySchema,
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
from backend.schemas.admin_security import (  # noqa: F401
    AdminSecurityUnlockSchema,
    AdminUserStatusUpdateSchema,
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
