from __future__ import annotations

import secrets
from urllib.parse import urlencode

from utils.oauth.pkce import generate_pkce

from .constants import AUTHORIZE_URL, CLIENT_ID, REDIRECT_URI, SCOPE
from .models import AuthorizationFlow


def create_authorization_flow(originator: str = "pi") -> AuthorizationFlow:
    verifier, challenge = generate_pkce()
    state = secrets.token_hex(16)
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
        "originator": originator,
    }
    url = f"{AUTHORIZE_URL}?{urlencode(params)}"
    return AuthorizationFlow(verifier=verifier, state=state, url=url)


__all__ = ["create_authorization_flow"]
