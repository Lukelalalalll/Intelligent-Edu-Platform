"""Test the actual list_latest_emails call."""
import asyncio
import json
import sys
import time
import traceback

sys.path.insert(0, ".")
from backend.config import Config
from backend.services.gmail_service import GmailService
from pymongo import MongoClient

client = MongoClient(Config.MONGO_URI)
db_inst = client.get_default_database()
user = db_inst.users.find_one({"username": "admin"})
td = json.loads(user["gmail_token"])

async def main():
    print("Calling list_latest_emails...")
    t0 = time.time()
    try:
        emails, refreshed, npt = await GmailService.list_latest_emails(token_data=td, limit=3)
        elapsed = time.time() - t0
        print(f"SUCCESS in {elapsed:.1f}s - got {len(emails)} emails")
        for e in emails:
            print(f"  - {e.get('subject', '?')[:60]}")
    except Exception as e:
        elapsed = time.time() - t0
        print(f"FAILED in {elapsed:.1f}s: {type(e).__name__}: {e}")
        traceback.print_exc()

asyncio.run(main())
