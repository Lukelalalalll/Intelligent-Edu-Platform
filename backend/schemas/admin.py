import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class AdminCourseSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    courseId: str
    name: str
    teacherId: str = ""
    degreeLevel: str = 'bachelor'
    semester: str = ""
    studentIds: List[str] = Field(default_factory=list)


class AdminCourseStudentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    studentId: str


class AdminAssignmentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    id: str
    title: str
    description: str = ""
    dueDate: str = ""
    rubric: dict = Field(default_factory=dict)


class AdminDbDocumentSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    document: dict = Field(default_factory=dict)
