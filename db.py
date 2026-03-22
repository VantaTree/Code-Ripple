from pymongo import MongoClient
from pymongo.errors import PyMongoError
import os
from dotenv import load_dotenv
load_dotenv()

# "mongodb://localhost:27017"
MONGO_URI = os.getenv("MONGO_URI")

client = None
db = None
analysis_collection = None
mongo_available = False
mongo_error = None

try:
    # Keep startup resilient: if MongoDB is down, the app should still boot and skip caching.
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    client.admin.command("ping")
    db = client["repo_analyzer"]
    analysis_collection = db["analysis"]
    analysis_collection.create_index("cache_key", unique=True)
    mongo_available = True
    print("Connected to MongoDB successfully.")
except PyMongoError as exc:
    mongo_error = str(exc)
    print("Mongo ERROR:", mongo_error)
