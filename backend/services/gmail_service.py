# backend/services/gmail_service.py
import asyncio
import base64
import hashlib
import json
import secrets
from typing import Any

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from backend.config import Config


class GmailService:
    SCOPES = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
    ]

    @staticmethod
    def _client_config_from_env() -> dict[str, Any] | None:
        if not Config.GMAIL_CLIENT_ID or not Config.GMAIL_CLIENT_SECRET:
            return None
        return {
            "installed": {
                "client_id": Config.GMAIL_CLIENT_ID,
                "project_id": Config.GMAIL_PROJECT_ID,
                "auth_uri": Config.GMAIL_AUTH_URI,
                "token_uri": Config.GMAIL_TOKEN_URI,
                "auth_provider_x509_cert_url": Config.GMAIL_AUTH_PROVIDER_X509_CERT_URL,
                "client_secret": Config.GMAIL_CLIENT_SECRET,
                "redirect_uris": [Config.GMAIL_REDIRECT_URI],
            }
        }

    @staticmethod
    def _generate_code_verifier() -> str:
        # RFC 7636 requires 43-128 chars from URL-safe charset.
        return secrets.token_urlsafe(96)[:128]

    @staticmethod
    def _build_code_challenge(code_verifier: str) -> str:
        digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("utf-8")

    @staticmethod
    def _create_flow(state: str | None = None) -> Flow:
        client_config = GmailService._client_config_from_env()
        if client_config:
            return Flow.from_client_config(
                client_config,
                scopes=GmailService.SCOPES,
                state=state,
                redirect_uri=Config.GMAIL_REDIRECT_URI,
            )
        return Flow.from_client_secrets_file(
            Config.GMAIL_CLIENT_SECRET_FILE,
            scopes=GmailService.SCOPES,
            state=state,
            redirect_uri=Config.GMAIL_REDIRECT_URI,
        )

    @staticmethod
    async def build_auth_url() -> tuple[str, str, str]:
        def _job() -> tuple[str, str, str]:
            flow = GmailService._create_flow()
            code_verifier = GmailService._generate_code_verifier()
            code_challenge = GmailService._build_code_challenge(code_verifier)
            auth_url, state = flow.authorization_url(
                access_type="offline",
                include_granted_scopes="true",
                prompt="consent",
                code_challenge=code_challenge,
                code_challenge_method="S256",
            )
            return auth_url, state, code_verifier

        return await asyncio.to_thread(_job)

    @staticmethod
    async def exchange_code_for_token(code: str, state: str | None = None, code_verifier: str | None = None) -> dict[str, Any]:
        def _job() -> dict[str, Any]:
            flow = GmailService._create_flow(state=state)

            if code_verifier:
                flow.fetch_token(code=code, code_verifier=code_verifier)
            else:
                flow.fetch_token(code=code)
            creds = flow.credentials
            return {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }

        return await asyncio.to_thread(_job)

    @staticmethod
    def _build_credentials(token_data: dict[str, Any]) -> Credentials:
        credentials = Credentials.from_authorized_user_info(token_data, GmailService.SCOPES)
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(GoogleAuthRequest())
        return credentials

    @staticmethod
    def _decode_body_data(data: str | None) -> str:
        if not data:
            return ""
        padding = "=" * (-len(data) % 4)
        try:
            decoded = base64.urlsafe_b64decode((data + padding).encode("utf-8"))
            return decoded.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            return ""

    @staticmethod
    def _extract_message_body(payload: dict[str, Any]) -> tuple[str, str]:
        text_parts: list[str] = []
        html_parts: list[str] = []

        def _walk(part: dict[str, Any]) -> None:
            mime_type = str(part.get("mimeType") or "")
            body_data = GmailService._decode_body_data((part.get("body") or {}).get("data"))
            if mime_type == "text/plain" and body_data:
                text_parts.append(body_data)
            elif mime_type == "text/html" and body_data:
                html_parts.append(body_data)

            for child in part.get("parts", []) or []:
                if isinstance(child, dict):
                    _walk(child)

        _walk(payload or {})
        return "\n\n".join(text_parts).strip(), "\n\n".join(html_parts).strip()

    @staticmethod
    async def list_latest_emails(token_data: dict[str, Any], limit: int = 10) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        def _job() -> tuple[list[dict[str, Any]], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            resp = service.users().messages().list(userId="me", maxResults=limit).execute()
            message_refs = resp.get("messages", [])

            emails: list[dict[str, Any]] = []
            for message_ref in message_refs:
                msg = service.users().messages().get(
                    userId="me",
                    id=message_ref["id"],
                    format="metadata",
                    metadataHeaders=["Subject", "From", "Date"],
                ).execute()

                headers = {h.get("name", ""): h.get("value", "") for h in msg.get("payload", {}).get("headers", [])}
                emails.append(
                    {
                        "id": msg.get("id"),
                        "subject": headers.get("Subject", "(No Subject)"),
                        "from": headers.get("From", ""),
                        "snippet": msg.get("snippet", ""),
                        "date": headers.get("Date", ""),
                    }
                )

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return emails, refreshed_token

        return await asyncio.to_thread(_job)

    @staticmethod
    async def get_email_detail(token_data: dict[str, Any], message_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        def _job() -> tuple[dict[str, Any], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            msg = service.users().messages().get(
                userId="me",
                id=message_id,
                format="full",
            ).execute()

            payload = msg.get("payload", {})
            headers = {
                h.get("name", ""): h.get("value", "")
                for h in payload.get("headers", [])
            }
            text_body, html_body = GmailService._extract_message_body(payload)

            detail = {
                "id": msg.get("id"),
                "threadId": msg.get("threadId"),
                "subject": headers.get("Subject", "(No Subject)"),
                "from": headers.get("From", ""),
                "to": headers.get("To", ""),
                "cc": headers.get("Cc", ""),
                "date": headers.get("Date", ""),
                "snippet": msg.get("snippet", ""),
                "bodyText": text_body,
                "bodyHtml": html_body,
            }

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return detail, refreshed_token

        return await asyncio.to_thread(_job)

    @staticmethod
    def encode_token(token_data: dict[str, Any]) -> str:
        return json.dumps(token_data, ensure_ascii=False)

    @staticmethod
    def decode_token(token_text: str) -> dict[str, Any]:
        return json.loads(token_text)

    # ─── New: Send / Reply / Thread / Draft ───────────────────────────

    @staticmethod
    def _make_mime_message(to: str, subject: str, body: str, thread_id: str | None = None, in_reply_to: str | None = None) -> str:
        """Build a minimal RFC 2822 message encoded as base64url."""
        import email.mime.text

        msg = email.mime.text.MIMEText(body, "plain", "utf-8")
        msg["To"] = to
        msg["Subject"] = subject
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"] = in_reply_to
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        return raw

    @staticmethod
    async def send_email(
        token_data: dict[str, Any],
        to: str,
        subject: str,
        body: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Send a new email."""
        def _job() -> tuple[dict[str, Any], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            raw = GmailService._make_mime_message(to=to, subject=subject, body=body)
            result = service.users().messages().send(
                userId="me",
                body={"raw": raw},
            ).execute()

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return {"id": result.get("id"), "threadId": result.get("threadId")}, refreshed_token

        return await asyncio.to_thread(_job)

    @staticmethod
    async def reply_to_email(
        token_data: dict[str, Any],
        thread_id: str,
        message_id: str,
        to: str,
        subject: str,
        body: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Reply to an existing email thread."""
        def _job() -> tuple[dict[str, Any], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            # Get original message's Message-ID header for threading
            original = service.users().messages().get(
                userId="me", id=message_id, format="metadata",
                metadataHeaders=["Message-ID"],
            ).execute()
            headers = {h.get("name", ""): h.get("value", "") for h in original.get("payload", {}).get("headers", [])}
            in_reply_to = headers.get("Message-ID", "")

            raw = GmailService._make_mime_message(
                to=to, subject=subject, body=body,
                thread_id=thread_id, in_reply_to=in_reply_to,
            )
            result = service.users().messages().send(
                userId="me",
                body={"raw": raw, "threadId": thread_id},
            ).execute()

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return {"id": result.get("id"), "threadId": result.get("threadId")}, refreshed_token

        return await asyncio.to_thread(_job)

    @staticmethod
    async def get_thread(
        token_data: dict[str, Any],
        thread_id: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Get all messages in a thread."""
        def _job() -> tuple[dict[str, Any], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
            messages = []
            for msg in thread.get("messages", []):
                payload = msg.get("payload", {})
                headers = {h.get("name", ""): h.get("value", "") for h in payload.get("headers", [])}
                text_body, html_body = GmailService._extract_message_body(payload)
                messages.append({
                    "id": msg.get("id"),
                    "threadId": msg.get("threadId"),
                    "subject": headers.get("Subject", ""),
                    "from": headers.get("From", ""),
                    "to": headers.get("To", ""),
                    "date": headers.get("Date", ""),
                    "snippet": msg.get("snippet", ""),
                    "bodyText": text_body,
                    "bodyHtml": html_body,
                })

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return {"threadId": thread_id, "messages": messages}, refreshed_token

        return await asyncio.to_thread(_job)

    @staticmethod
    async def create_draft(
        token_data: dict[str, Any],
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Create a draft email."""
        def _job() -> tuple[dict[str, Any], dict[str, Any]]:
            creds = GmailService._build_credentials(token_data)
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)

            raw = GmailService._make_mime_message(to=to, subject=subject, body=body)
            draft_body: dict[str, Any] = {"message": {"raw": raw}}
            if thread_id:
                draft_body["message"]["threadId"] = thread_id

            result = service.users().drafts().create(userId="me", body=draft_body).execute()

            refreshed_token = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
            }
            return {"draftId": result.get("id"), "messageId": result.get("message", {}).get("id")}, refreshed_token

        return await asyncio.to_thread(_job)