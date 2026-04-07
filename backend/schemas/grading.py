from typing import List, Optional, Literal

from pydantic import BaseModel, Field, JsonValue


class AnnotationPayload(BaseModel):
    submissionId: str
    annotation: dict


class SubmissionScoreSchema(BaseModel):
    submissionId: str
    totalScore: int
    rubricScores: dict
    overallFeedback: str = ""
    gradedBy: str | None = None


class FinalizeAnnotationsSchema(BaseModel):
    submissionId: str
    annotations: List[dict]


# === Flat Domain Model Schemas (v2) ===

class CourseSectionSchema(BaseModel):
    courseCode: str
    courseName: str
    semester: str = ""
    degreeLevel: Literal['bachelor', 'master', 'phd'] = 'bachelor'
    ownerTeacherId: str = ""


class EnrollmentSchema(BaseModel):
    courseSectionId: str
    userId: str
    roleInCourse: Literal['teacher', 'student', 'ta'] = 'student'


class AssignmentSchema(BaseModel):
    courseSectionId: str
    title: str
    description: str = ""
    dueAt: str = ""
    maxScore: int = 100
    rubricSchema: dict = Field(default_factory=dict)
    submissionType: str = "pdf"


class SubmissionSchema(BaseModel):
    assignmentId: str
    studentId: str
    status: Literal['pending', 'grading', 'graded', 'returned'] = 'pending'
    submittedAt: str = ""
    attemptNo: int = 1
    latestDocumentId: Optional[str] = None
    latestGradeId: Optional[str] = None


class DocumentSchema(BaseModel):
    ownerType: Literal['submission', 'assignment', 'course'] = 'submission'
    ownerId: str
    storageKey: str
    filename: str = ""
    mimeType: str = "application/pdf"
    pageCount: int = 0
    checksum: str = ""
    sourceType: Literal['original', 'annotated', 'ocr_text', 'thumbnail'] = 'original'


class GradeSchema(BaseModel):
    submissionId: str
    graderId: str
    rubricScores: dict = Field(default_factory=dict)
    totalScore: int = 0
    overallFeedback: str = ""
    gradedAt: str = ""
    gradingStatus: Literal['draft', 'final'] = 'draft'


class StudentSubmissionCreateSchema(BaseModel):
    assignmentId: str
    studentId: str
