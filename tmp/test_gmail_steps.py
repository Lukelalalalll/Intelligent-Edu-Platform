"""Pinpoint which step times out."""
import json
import sys
import time

sys.path.insert(0, ".")
from backend.config import Config
from backend.services.gmail_service import GmailService
from pymongo import MongoClient
from googleapiclient.discovery import build

client = MongoClient(Config.MONGO_URI)
db_inst = client.get_default_database()
user = db_inst.users.find_one({"username": "admin"})
td = json.loads(user["gmail_token"])

print("Step 1: _build_credentials ...")
t0 = time.time()
try:
    creds = GmailService._build_credentials(td)
    print(f"  OK in {time.time()-t0:.1f}s  valid={creds.valid}")
except Exception as e:
    print(f"  FAIL in {time.time()-t0:.1f}s: {e}")
    sys.exit(1)

print("Step 2: build service ...")
t0 = time.time()
try:
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    print(f"  OK in {time.time()-t0:.1f}s")
except Exception as e:
    print(f"  FAIL in {time.time()-t0:.1f}s: {e}")
    sys.exit(1)

print("Step 3: messages.list ...")
t0 = time.time()
try:
    resp = service.users().messages().list(userId="me", maxResults=3).execute()
    ids = [m["id"] for m in resp.get("messages", [])]
    print(f"  OK in {time.time()-t0:.1f}s  got {len(ids)} ids")
except Exception as e:
    print(f"  FAIL in {time.time()-t0:.1f}s: {type(e).__name__}: {e}")
    sys.exit(1)

if ids:
    print(f"Step 4: messages.get (single) id={ids[0][:8]}... ")
    t0 = time.time()
    try:
        msg = service.users().messages().get(
            userId="me", id=ids[0], format="metadata",
            metadataHeaders=["Subject", "From", "Date"],
        ).execute()
        print(f"  OK in {time.time()-t0:.1f}s  subject={msg.get('snippet','')[:40]}")
    except Exception as e:
        print(f"  FAIL in {time.time()-t0:.1f}s: {type(e).__name__}: {e}")
