# Grading Pipeline v2 — Architecture & API Reference

## Data-Flow Diagram

```
┌─────────────┐   POST /api/v2/student/submit   ┌────────────────────┐
│  Student UI  │ ──────────────────────────────▶  │  auth_routes.py    │
│ HomeStudent  │                                  │  (enrollment check)│
└─────────────┘                                   └────────┬───────────┘
                                                           │ create_submission()
                                                           │ create_document()
                                                           ▼
                                                  ┌──────────────────┐
                                                  │   MongoDB v2     │
                                                  │  ┌────────────┐  │
                                                  │  │submissions │  │
                                                  │  │assignments │  │
                                                  │  │documents   │  │
                                                  │  │grades      │  │
                                                  │  │enrollments │  │
                                                  │  │courseSects │  │
                                                  │  └────────────┘  │
                                                  └──────┬───────────┘
                                                         │
         ┌───────────────────────────────────────────────┘
         │  list_course_sections / list_assignments / list_submissions
         ▼
┌─────────────┐  GET /api/teacher/v2/courses      ┌────────────────────┐
│  Teacher UI  │ ──────────────────────────────▶   │ teacher_routes.py  │
│   Mailbox    │  GET /v2/assignments/{id}         │ _assert_v2_course  │
│              │  GET /v2/submissions/{id}         │ _access()          │
└──────┬──────┘                                    └────────────────────┘
       │  GET /api/teacher/v2/submission/{id}
       ▼
┌──────────────┐  get_submission_bundle()          ┌────────────────────┐
│ GradingWork- │ ──────────────────────────────▶   │ grading_helpers.py │
│   bench      │  render_annotations_to_pdf()      │ (bundle loader)    │
└──────────────┘                                   └────────────────────┘
```

## API Endpoints

### Teacher (requires `teacher` or `admin` role)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/api/teacher/v2/courses` | List courses with stats | `_assert_teacher_or_admin` |
| GET | `/api/teacher/v2/assignments/{courseSectionId}` | Assignments + submission counts | `_assert_v2_course_access` |
| GET | `/api/teacher/v2/submissions/{assignmentId}` | Submissions with student info & grades | `_assert_v2_course_access` (via assignment→course) |
| GET | `/api/teacher/v2/submission/{submissionId}` | Full submission bundle | `_assert_v2_course_access` (via bundle→course) |

### Student (requires valid JWT)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/api/v2/profile/courses` | Enrolled courses | Authenticated |
| GET | `/api/v2/student/assignments/{courseSectionId}` | Assignments + own submission status | Authenticated |
| POST | `/api/v2/student/submit` | Upload PDF submission | Enrollment verified |

## Permission Model

```
_assert_teacher_or_admin(user)
  └─ user.role ∈ {admin, teacher} OR 403

_assert_v2_course_access(course_section_id, user)
  ├─ admin → allow all
  ├─ ownerTeacherId == user.id → allow
  ├─ enrolled as teacher/ta → allow
  └─ else → 403

Student submit validation:
  ├─ get_assignment(assignmentId) → 404 if missing
  └─ list_enrollments(course, user) → 403 if not enrolled
```

## Submission Bundle Schema

`get_submission_bundle(submission_id)` returns:

```json
{
  "course":     { "_id", "courseName", "ownerTeacherId", ... },
  "assignment": { "_id", "title", "dueDate", "courseSectionId", ... },
  "submission": { "_id", "studentId", "pdfPath", "status", ... },
  "annotations": { "pins": [...], "boxes": [...] },
  "grade":      { "score", "rubricScores", "feedback", ... } | null,
  "document":   { "storageKey", "filename", "checksum", ... } | null
}
```

When annotations exist, `render_annotations_to_pdf()` is called to produce an annotated
PDF at `static/grading_annotated/`, and `submission.pdfPath` is updated to the rendered path.

## Frontend → Backend Mapping

| Frontend method | Backend endpoint |
|-----------------|------------------|
| `teacherApi.getCoursesV2()` | `GET /api/teacher/v2/courses` |
| `teacherApi.getAssignmentsV2(id)` | `GET /api/teacher/v2/assignments/{id}` |
| `teacherApi.getSubmissionsV2(id)` | `GET /api/teacher/v2/submissions/{id}` |
| `teacherApi.getSubmissionDetailV2(id)` | `GET /api/teacher/v2/submission/{id}` |
| `studentApi.getCourses()` | `GET /api/v2/profile/courses` |
| `studentApi.getAssignments(id)` | `GET /api/v2/student/assignments/{id}` |
| `studentApi.submitWork(id, file)` | `POST /api/v2/student/submit` |

## API Versioning Strategy

- **v2 endpoints** write to and read from the canonical MongoDB collections (`submissions`, `assignments`, etc.)
- **Legacy v1 endpoints** remain available; `find_submission_v2` is used as the underlying implementation so that v1 callers also read from the v2 data model
- Frontend uses a **v2-first + fallback** pattern: `try { v2 call } catch { legacy call }` — this will be removed once v1 is fully deprecated
- New features are built exclusively on v2 endpoints

## Source of Truth

All page-level logic lives in `frontend/src/pages/`. Domain folders under `frontend/src/domains/*/pages/` contain thin re-exports only:

```
domains/grading/pages/GradingWorkbenchPage.jsx → re-exports pages/GradingWorkbench.jsx
domains/mailbox/pages/MailboxPage.jsx          → re-exports pages/Mailbox.jsx
domains/home/pages/HomeStudentPage.jsx         → re-exports pages/HomeStudent.jsx
```

Do **not** add page logic to domains files — edit the canonical `pages/` file instead.
