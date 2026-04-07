from typing import List, Optional

from pydantic import BaseModel, Field


class AdminCourseSchema(BaseModel):
    courseId: str
    name: str
    teacherId: str = ""
    degreeLevel: str = 'bachelor'
    semester: str = ""
    studentIds: List[str] = Field(default_factory=list)


class AdminCourseStudentSchema(BaseModel):
    studentId: str


class AdminAssignmentSchema(BaseModel):
    id: str
    title: str
    description: str = ""
    dueDate: str = ""
    rubric: dict = Field(default_factory=dict)


class AdminDbDocumentSchema(BaseModel):
    document: dict = Field(default_factory=dict)
