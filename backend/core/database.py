from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import Config

client = AsyncIOMotorClient(Config.MONGO_URI)
db = client.get_default_database()