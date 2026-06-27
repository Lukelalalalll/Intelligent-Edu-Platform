"""Constants and static HTML fragments for OpenAI Codex OAuth."""

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL = "https://auth.openai.com/oauth/token"
REDIRECT_URI = "http://localhost:1455/auth/callback"
SCOPE = "openid profile email offline_access"
JWT_CLAIM_PATH = "https://api.openai.com/auth"
CALLBACK_PORT = 1455

SUCCESS_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Presenton - Authentication successful</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
        "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #eef2ff 0, #0f172a 55%, #020617 100%);
      color: #e5e7eb;
    }
    .card {
      background: rgba(15, 23, 42, 0.9);
      border-radius: 18px;
      padding: 28px 32px 26px;
      box-shadow:
        0 18px 45px rgba(15, 23, 42, 0.75),
        0 0 0 1px rgba(148, 163, 184, 0.2);
      max-width: 440px;
      width: 92vw;
      text-align: center;
      backdrop-filter: blur(18px);
    }
    h1 {
      font-size: 20px;
      margin: 4px 0 10px;
      color: #e5e7eb;
    }
    p {
      margin: 4px 0;
      font-size: 14px;
      color: #94a3b8;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      background: rgba(22, 163, 74, 0.12);
      color: #bbf7d0;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #22c55e;
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.25);
    }
    .hint {
      margin-top: 14px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="pill">
      <span class="pill-dot"></span>
      <span>Authentication successful</span>
    </div>
    <h1>You're all set</h1>
    <p>You can now return to Presenton to continue.</p>
    <p class="hint">This window can be safely closed.</p>
  </main>
</body>
</html>""".encode("utf-8")

STATE_MISMATCH_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Presenton - Authentication issue</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
        "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #fef3c7 0, #0f172a 55%, #020617 100%);
      color: #e5e7eb;
    }
    .card {
      background: rgba(15, 23, 42, 0.94);
      border-radius: 18px;
      padding: 26px 30px 24px;
      box-shadow:
        0 18px 45px rgba(15, 23, 42, 0.78),
        0 0 0 1px rgba(248, 250, 252, 0.09);
      max-width: 440px;
      width: 92vw;
      text-align: center;
      backdrop-filter: blur(18px);
    }
    h1 {
      font-size: 18px;
      margin: 4px 0 8px;
      color: #fee2e2;
    }
    p {
      margin: 4px 0;
      font-size: 13px;
      color: #cbd5f5;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      background: rgba(239, 68, 68, 0.14);
      color: #fecaca;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 10px;
    }
    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #f97316;
      box-shadow: 0 0 0 4px rgba(248, 171, 85, 0.32);
    }
    button {
      margin-top: 14px;
      border-radius: 999px;
      padding: 7px 16px;
      border: 0;
      background: linear-gradient(135deg, #4f46e5, #22c55e);
      color: #f9fafb;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow:
        0 10px 25px rgba(59, 130, 246, 0.55),
        0 0 0 1px rgba(15, 23, 42, 0.85);
    }
    button:active {
      transform: translateY(1px);
      box-shadow:
        0 4px 16px rgba(59, 130, 246, 0.55),
        0 0 0 1px rgba(15, 23, 42, 0.85);
    }
    .hint {
      margin-top: 10px;
      font-size: 11px;
      color: #9ca3af;
    }
  </style>
  <script>
    setTimeout(function () {
      try {
        window.location.reload();
      } catch (e) {
      }
    }, 2500);
    function reloadNow() {
      try {
        window.location.reload();
      } catch (e) {
      }
    }
  </script>
</head>
<body>
  <main class="card">
    <div class="badge">
      <span class="badge-dot"></span>
      <span>We noticed something unexpected</span>
    </div>
    <h1>Almost there</h1>
    <p>We detected a small mismatch while completing authentication.</p>
    <p>We'll gently reload this page. If the issue persists, close this window and restart sign-in from Presenton.</p>
    <button type="button" onclick="reloadNow()">Reload this page</button>
    <p class="hint">You can also safely close this window and try again from the app.</p>
  </main>
</body>
</html>""".encode("utf-8")


__all__ = [
    "AUTHORIZE_URL",
    "CALLBACK_PORT",
    "CLIENT_ID",
    "JWT_CLAIM_PATH",
    "REDIRECT_URI",
    "SCOPE",
    "STATE_MISMATCH_HTML",
    "SUCCESS_HTML",
    "TOKEN_URL",
]
