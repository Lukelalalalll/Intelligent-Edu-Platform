"""Quick diagnostic: test Gmail token refresh."""
import json
import sys
import traceback

sys.path.insert(0, ".")
from backend.config import Config
from pymongo import MongoClient
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest

client = MongoClient(Config.MONGO_URI)
db_inst = client.get_default_database()
user = db_inst.users.find_one({"username": "admin"})
if not user or not user.get("gmail_token"):
    print("No gmail_token stored for admin")
    sys.exit(1)

td = json.loads(user["gmail_token"])
print("Token keys:", list(td.keys()))

enriched = {**td, "client_secret": Config.GMAIL_CLIENT_SECRET}
# The library expects "scopes", not "granted_scopes"
if "granted_scopes" in enriched and "scopes" not in enriched:
    enriched["scopes"] = enriched.pop("granted_scopes")
    print("Mapped granted_scopes -> scopes for library compatibility")

scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
]

print("Building credentials...")
creds = Credentials.from_authorized_user_info(enriched, scopes)
print(f"  expired={creds.expired}, valid={creds.valid}, has_refresh={bool(creds.refresh_token)}")

if creds.expired and creds.refresh_token:
    print("Refreshing token...")
    try:
        creds.refresh(GoogleAuthRequest())
        print(f"  SUCCESS - new token starts with: {str(creds.token)[:20]}...")
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
else:
    print("Token still valid, no refresh needed")

print("\nDone.")
