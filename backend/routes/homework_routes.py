import datetime
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from backend.core.database import db
from backend.core.security import get_current_user
from bson import ObjectId
from backend.schemas.homework import HomeworkCreate, HomeworkResponse, HomeworkSubmissionResponse
from backend.services.grading_service import create_assignment

router = APIRouter(prefix="/api/v2/homeworks", tags=["homeworks"])

@router.post("/", response_model=HomeworkResponse)
async def publish_homework(
    homework: HomeworkCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can publish homework")

    teacher_id = str(current_user["_id"])

    doc = {
        "course_id": homework.course_id,
        "teacher_id": teacher_id,
        "title": homework.title,
        "description": homework.description,
        "required_file_types": homework.required_file_types,
        "deadline": homework.deadline,
        "created_at": datetime.datetime.utcnow()
    }
    
    result = await db["homeworks"].insert_one(doc)
    doc["_id"] = result.inserted_id

    # Also create a v2 assignment so Mailbox / GradingWorkbench can find it
    try:
        await create_assignment({
            "courseSectionId": homework.course_id,
            "title": homework.title,
            "description": homework.description,
            "dueDate": homework.deadline.isoformat() if homework.deadline else "",
            "requiredFileTypes": homework.required_file_types,
            "createdBy": teacher_id,
            "homeworkId": str(doc["_id"]),
        })
    except Exception as exc:
        import logging as _logging
        _logging.getLogger("homework_routes").error(
            "Failed to create v2 assignment for homework %s: %s", str(doc["_id"]), exc
        )
    
    return HomeworkResponse(
        id=str(doc["_id"]),
        **{k: v for k, v in doc.items() if k != "_id"}
    )

@router.get("/teacher", response_model=List[HomeworkResponse])
async def get_teacher_homeworks(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
        
    query = {"teacher_id": str(current_user["_id"])}
    if course_id:
        query["course_id"] = course_id
        
    cursor = db["homeworks"].find(query).sort("created_at", -1)
    
    results = []
    async for doc in cursor:
        results.append(HomeworkResponse(
            id=str(doc["_id"]),
            **{k: v for k, v in doc.items() if k != "_id"}
        ))
        
    return results

@router.get("/student")
async def get_student_assignments(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Access denied")

    student_id = str(current_user["_id"])
    courses_cursor = db["courses"].find({"students": student_id})
    course_ids = [str(doc["_id"]) async for doc in courses_cursor]
    
    if course_id:
         if course_id not in course_ids:
             return {"assignments": []}
         course_ids = [course_id]
         
    if not course_ids:
        return {"assignments": []}

    # Fetch submissions
    submissions_cursor = db["homework_submissions"].find({"student_id": student_id})
    sub_by_hw = {}
    async for s in submissions_cursor:
        sub_by_hw[s["homework_id"]] = s
    
    # Fetch homeworks
    query = {"course_id": {"$in": course_ids}}
    cursor = db["homeworks"].find(query).sort("deadline", 1)
    
    results = []
    async for doc in cursor:
        hw_id = str(doc["_id"])
        sub = sub_by_hw.get(hw_id)
        
        results.append({
            "id": hw_id,
            "title": doc.get("title", ""),
            "description": doc.get("description", ""),
            "dueAt": doc.get("deadline", ""),
            "required_file_types": doc.get("required_file_types", []),
            "hasSubmitted": sub is not None,
            "status": sub.get("status", "pending") if sub else "pending",
            "submission": {
                "pdfPath": sub.get("file_name", ""),
                "submittedAt": str(sub.get("submitted_at"))[:10] if sub else ""
            } if sub else None
        })
        
    return {"assignments": results}

@router.post("/{homework_id}/submit", response_model=HomeworkSubmissionResponse)
async def submit_homework(
    homework_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not ObjectId.is_valid(homework_id):
        raise HTTPException(status_code=400, detail="Invalid homework ID")
        
    homework = await db["homeworks"].find_one({"_id": ObjectId(homework_id)})
    if not homework:
        raise HTTPException(status_code=404, detail="Homework not found")

    ext = os.path.splitext(file.filename)[1].lower()
    
    if homework.get("required_file_types"):
        allowed = [t.lower() for t in homework["required_file_types"]]
        if len(allowed) > 0 and "*" not in allowed and ".*" not in allowed and "all" not in allowed:
            if not any(req_ext in ext for req_ext in allowed if req_ext):
                raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed)}")

    upload_dir = "uploads/homeworks"
    os.makedirs(upload_dir, exist_ok=True)
    
    safe_filename = f"{homework_id}_{current_user['_id']}_{file.filename}"
    file_path = os.path.join(upload_dir, safe_filename)
    
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)
        
    doc = {
        "homework_id": homework_id,
        "student_id": str(current_user["_id"]),
        "file_path": file_path,
        "file_name": file.filename,
        "status": "submitted",
        "submitted_at": datetime.datetime.utcnow()
    }
    
    result = await db["homework_submissions"].insert_one(doc)
    doc["_id"] = result.inserted_id
    
    return HomeworkSubmissionResponse(
        id=str(doc["_id"]),
        **{k: v for k, v in doc.items() if k != "_id"}
    )
