import re
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class AnnotationPayload(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    submissionId: str
    annotation: dict


class SubmissionScoreSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    submissionId: str
    totalScore: float
    rubricScores: dict
    overallFeedback: str = ""
    gradedBy: str | None = None


class FinalizeAnnotationsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    submissionId: str
    annotations: List[dict]


# === Flat Domain Model Schemas (v2) ===

class CourseSectionSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    courseCode: str
    courseName: str
    semester: str = ""
    degreeLevel: Literal['bachelor', 'master', 'phd'] = 'bachelor'
    ownerTeacherId: str = ""


class EnrollmentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    courseSectionId: str
    userId: str
    roleInCourse: Literal['teacher', 'student', 'ta'] = 'student'


class AssignmentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    courseSectionId: str
    title: str
    description: str = ""
    dueAt: str = ""
    maxScore: int = 100
    rubricSchema: dict = Field(default_factory=dict)
    submissionType: str = "pdf"


class SubmissionSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    assignmentId: str
    studentId: str
    status: Literal['pending', 'grading', 'graded', 'returned'] = 'pending'
    submittedAt: str = ""
    attemptNo: int = 1
    latestDocumentId: Optional[str] = None
    latestGradeId: Optional[str] = None


class DocumentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    ownerType: Literal['submission', 'assignment', 'course'] = 'submission'
    ownerId: str
    storageKey: str
    filename: str = ""
    mimeType: str = "application/pdf"
    pageCount: int = 0
    checksum: str = ""
    sourceType: Literal['original', 'annotated', 'ocr_text', 'thumbnail'] = 'original'


class GradeSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    submissionId: str
    graderId: str
    rubricScores: dict = Field(default_factory=dict)
    totalScore: int = 0
    overallFeedback: str = ""
    gradedAt: str = ""
    gradingStatus: Literal['draft', 'final'] = 'draft'


class StudentSubmissionCreateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    assignmentId: str
    studentId: str
