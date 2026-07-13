from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .constants import CALLBACK_PORT, STATE_MISMATCH_HTML, SUCCESS_HTML


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/auth/callback":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        query = parse_qs(parsed.query)
        state_vals = query.get("state", [])
        code_vals = query.get("code", [])
        expected_state: str = self.server.expected_state  # type: ignore[attr-defined]

        if not code_vals:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing authorization code")
            return

        state_mismatch = bool(state_vals and state_vals[0] != expected_state)
        if state_mismatch:
            try:
                print(
                    f"[Codex OAuth] State mismatch in callback handler: "
                    f"expected={expected_state} got={state_vals[0]}"
                )
            except Exception:
                pass

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(STATE_MISMATCH_HTML if state_mismatch else SUCCESS_HTML)
        self.server.captured_code = code_vals[0]  # type: ignore[attr-defined]

    def log_message(self, format, *args):  # noqa: A002
        pass


class OAuthCallbackServer:
    def __init__(self, state: str):
        self._state = state
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self._started = threading.Event()
        self._cancelled = False

    def start(self) -> bool:
        try:
            server = HTTPServer(("0.0.0.0", CALLBACK_PORT), _CallbackHandler)
            server.expected_state = self._state  # type: ignore[attr-defined]
            server.captured_code = None  # type: ignore[attr-defined]
            server.timeout = 0.2
            self._server = server

            def serve() -> None:
                self._started.set()
                while not self._cancelled and server.captured_code is None:
                    server.handle_request()
                server.server_close()

            self._thread = threading.Thread(target=serve, daemon=True)
            self._thread.start()
            self._started.wait(timeout=2)
            return True
        except OSError:
            return False

    def get_code_nowait(self) -> Optional[str]:
        if self._server is None:
            return None
        return self._server.captured_code  # type: ignore[attr-defined]

    def wait_for_code(self, timeout_seconds: int = 120) -> Optional[str]:
        if self._server is None:
            return None
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self._cancelled:
                return None
            code = self._server.captured_code  # type: ignore[attr-defined]
            if code:
                return code
            time.sleep(0.1)
        return None

    def cancel(self):
        self._cancelled = True

    def close(self):
        self._cancelled = True
        if self._thread:
            self._thread.join(timeout=2)


__all__ = ["OAuthCallbackServer"]
