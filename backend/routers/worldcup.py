from time import monotonic
from typing import Any, Dict

import requests
from fastapi import APIRouter, HTTPException

router = APIRouter()

BASE_URL = "https://worldcup26.ir/get"
CACHE_SECONDS = 45
_cache: Dict[str, Dict[str, Any]] = {}


def fetch_worldcup_resource(resource: str) -> Dict[str, Any]:
    now = monotonic()
    cached = _cache.get(resource)
    if cached and now - cached["time"] < CACHE_SECONDS:
        return cached["data"]

    try:
        res = requests.get(f"{BASE_URL}/{resource}", timeout=10)
        res.raise_for_status()
        data = res.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"World Cup API error: {exc}") from exc

    _cache[resource] = {"time": now, "data": data}
    return data


@router.get("/worldcup/games")
def get_worldcup_games():
    return fetch_worldcup_resource("games")


@router.get("/worldcup/groups")
def get_worldcup_groups():
    return fetch_worldcup_resource("groups")
