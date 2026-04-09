import re


def build_admin_collection_search_filter(collection_name: str, keyword: str) -> dict:
    value = str(keyword or "").strip()
    if not value:
        return {}

    safe_keyword = re.escape(value)
    if collection_name == "users":
        return {
            "$or": [
                {"username": {"$regex": safe_keyword, "$options": "i"}},
                {"email": {"$regex": safe_keyword, "$options": "i"}},
                {"role": {"$regex": safe_keyword, "$options": "i"}},
            ]
        }

    return {
        "$or": [
            {"name": {"$regex": safe_keyword, "$options": "i"}},
            {"title": {"$regex": safe_keyword, "$options": "i"}},
            {"id": {"$regex": safe_keyword, "$options": "i"}},
            {"courseId": {"$regex": safe_keyword, "$options": "i"}},
        ]
    }
