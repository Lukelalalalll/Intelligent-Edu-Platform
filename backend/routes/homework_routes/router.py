from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File
from backend.core.security import get_current_user
from backend.schemas.homework import HomeworkCreate, HomeworkResponse, HomeworkSubmissionResponse
from backend.services.homework_service import (
    list_student_assignments,
    list_teacher_homeworks,
    publish_homework as publish_homework_service,
    submit_homework as submit_homework_service,
)

router = APIRouter(prefix="/api/v2/homeworks", tags=["homeworks"])

@router.post("/", response_model=HomeworkResponse)
async def publish_homework(
    homework: HomeworkCreate,
    current_user: dict = Depends(get_current_user)
):
    return await publish_homework_service(homework=homework, current_user=current_user)

@router.get("/teacher", response_model=List[HomeworkResponse])
async def get_teacher_homeworks(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    return await list_teacher_homeworks(course_id=course_id, current_user=current_user)

@router.get("/student")
async def get_student_assignments(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    return await list_student_assignments(course_id=course_id, current_user=current_user)

@router.post("/{homework_id}/submit", response_model=HomeworkSubmissionResponse)
async def submit_homework(
    homework_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    contents = await file.read()
    return await submit_homework_service(
        homework_id=homework_id,
        filename=file.filename,
        content=contents,
        current_user=current_user,
    )
