from __future__ import annotations

from typing import Any, Iterable

from bson import ObjectId

from backend.core.database import db
from backend.repositories._helpers import coerce_object_id


def get_collection(collection_name: str):
    return db[collection_name]


def safe_object_id(value: str) -> ObjectId | None:
    return coerce_object_id(value)


async def insert_one(collection_name: str, document: dict[str, Any]) -> Any:
    return await get_collection(collection_name).insert_one(document)


async def find_one(
    collection_name: str,
    filt: dict[str, Any],
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await get_collection(collection_name).find_one(filt, projection)


async def find_many(
    collection_name: str,
    filt: dict[str, Any],
    *,
    projection: dict[str, Any] | None = None,
    skip: int = 0,
    limit: int = 50,
    sort: list[tuple[str, int]] | None = None,
) -> list[dict[str, Any]]:
    cursor = get_collection(collection_name).find(filt, projection)
    if sort:
        cursor = cursor.sort(sort)
    if skip:
        cursor = cursor.skip(skip)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=limit or 0)


async def count(collection_name: str, filt: dict[str, Any]) -> int:
    return await get_collection(collection_name).count_documents(filt)


async def aggregate(collection_name: str, pipeline: list[dict[str, Any]], *, length: int = 100) -> list[dict[str, Any]]:
    return await get_collection(collection_name).aggregate(pipeline).to_list(length=length)


async def distinct(collection_name: str, field_name: str, filt: dict[str, Any] | None = None) -> list[Any]:
    return await get_collection(collection_name).distinct(field_name, filt or {})


async def update_one(collection_name: str, filt: dict[str, Any], update: dict[str, Any]) -> Any:
    return await get_collection(collection_name).update_one(filt, update)


async def update_many(collection_name: str, filt: dict[str, Any], update: dict[str, Any]) -> Any:
    return await get_collection(collection_name).update_many(filt, update)


async def delete_one(collection_name: str, filt: dict[str, Any]) -> Any:
    return await get_collection(collection_name).delete_one(filt)


async def delete_many(collection_name: str, filt: dict[str, Any]) -> Any:
    return await get_collection(collection_name).delete_many(filt)


async def aggregate_union(
    primary_collection: str,
    *,
    match_filter: dict[str, Any],
    other_collections: Iterable[tuple[str, str]],
    projection: dict[str, Any] | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    project_stage = {"$project": projection} if projection else None
    pipeline: list[dict[str, Any]] = [
        {"$match": match_filter},
        {"$addFields": {"_collection_name": primary_collection}},
    ]
    if project_stage:
        pipeline.append(project_stage)

    for collection_name, tool_key in other_collections:
        other_pipeline: list[dict[str, Any]] = [
            {"$match": match_filter},
            {"$addFields": {"_collection_name": collection_name, "_tool_key": tool_key}},
        ]
        if projection:
            other_pipeline.append({"$project": projection})
        pipeline.append({"$unionWith": {"coll": collection_name, "pipeline": other_pipeline}})

    pipeline.extend(
        [
            {"$sort": {"created_at": -1}},
            {
                "$facet": {
                    "items": [{"$skip": skip}, {"$limit": limit}],
                    "total_count": [{"$count": "count"}],
                }
            },
        ]
    )

    result = await aggregate(primary_collection, pipeline, length=1)
    if not result:
        return [], 0
    facet = result[0]
    total = (facet.get("total_count") or [{}])[0].get("count", 0)
    return facet.get("items", []), total

