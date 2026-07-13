from __future__ import annotations

from backend.application.architecture_facades.auth_account import (
    account_creation,
    account_queries,
    password_flows,
    views,
)

register_user = account_creation.register_user
authenticate_user = account_queries.authenticate_user
request_password_reset = password_flows.request_password_reset
confirm_password_reset = password_flows.confirm_password_reset
serialize_session_user = views.serialize_session_user
update_current_profile = views.update_current_profile


async def authenticate_user_with_guards(*args, **kwargs):
    return await account_queries.authenticate_user_with_guards(
        *args,
        **kwargs,
        authenticate_fn=authenticate_user,
    )


async def request_password_reset_with_guards(*args, **kwargs):
    return await password_flows.request_password_reset_with_guards(
        *args,
        **kwargs,
        request_password_reset_fn=request_password_reset,
    )

__all__ = [
    "authenticate_user",
    "authenticate_user_with_guards",
    "confirm_password_reset",
    "register_user",
    "request_password_reset",
    "request_password_reset_with_guards",
    "serialize_session_user",
    "update_current_profile",
]
