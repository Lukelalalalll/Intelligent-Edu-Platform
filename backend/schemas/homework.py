from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class HomeworkCreate(BaseModel):
    course_id: str
    title: str
    description: str
    required_file_types: List[str]
    deadline: datetime

class HomeworkResponse(BaseModel):
    id: str
    course_id: str
    teacher_id: str
    title: str
    description: str
    required_file_types: List[str]
    deadline: datetime
    created_at: datetime

class HomeworkSubmissionResponse(BaseModel):
    id: str
    homework_id: str
    student_id: str
    file_path: str
    file_name: str
    status: str
    submitted_at: datetime

