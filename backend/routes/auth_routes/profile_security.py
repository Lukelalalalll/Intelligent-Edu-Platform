from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_session, get_current_user, require_step_up
from backend.schemas import (
    BackupCodeRegenSchema,
    MfaConfirmSchema,
    MfaDisableSchema,
    MfaEnrollmentStartSchema,
    StepUpVerifySchema,
)
from backend.services.auth.mfa_security_service import assert_step_up_recent
from backend.services.user_profile_service import (
    disable_mfa_for_user,
    generate_new_backup_codes_for_user,
    get_profile_security_state,
    start_mfa_enrollment_for_user,
    verify_mfa_enrollment_for_user,
    verify_step_up_for_session,
)

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/security")
async def get_profile_security(current_user: dict = Depends(get_current_user)):
    return await get_profile_security_state(current_user)


@router.post("/profile/security/mfa/start")
async def start_mfa_enrollment(
    payload: MfaEnrollmentStartSchema,
    current_user: dict = Depends(get_current_user),
):
    return await start_mfa_enrollment_for_user(current_user, password=payload.current_password)


@router.post("/profile/security/mfa/confirm")
async def confirm_mfa_enrollment(
    payload: MfaConfirmSchema,
    current_user: dict = Depends(get_current_user),
):
    return await verify_mfa_enrollment_for_user(current_user, code=payload.code)


@router.post("/profile/security/mfa/disable")
async def disable_mfa(
    payload: MfaDisableSchema,
    current_user: dict = Depends(get_current_user),
):
    return await disable_mfa_for_user(current_user, password=payload.current_password, code=payload.code)


@router.post("/profile/security/mfa/backup-codes/regenerate")
async def regenerate_backup_codes(
    payload: BackupCodeRegenSchema,
    current_user: dict = Depends(get_current_user),
    session_doc: dict = Depends(require_step_up),
):
    assert_step_up_recent(session_doc)
    return await generate_new_backup_codes_for_user(current_user, password=payload.current_password)


@router.post("/step-up/verify")
async def verify_step_up(
    payload: StepUpVerifySchema,
    current_user: dict = Depends(get_current_user),
    session_doc: dict = Depends(get_current_session),
):
    return await verify_step_up_for_session(current_user=current_user, session_doc=session_doc, code=payload.code)

