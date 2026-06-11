from time import monotonic
from typing import Any, Dict

import requests
from requests.adapters import HTTPAdapter
from fastapi import APIRouter, HTTPException
from urllib3.util.retry import Retry

router = APIRouter()

BASE_URL = "https://worldcup26.ir/get"
CACHE_SECONDS = 60 * 60
STALE_CACHE_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT = (3.05, 8)
_cache: Dict[str, Dict[str, Any]] = {}

_session = requests.Session()
_retry = Retry(
    total=2,
    connect=2,
    read=2,
    status=2,
    backoff_factor=0.5,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
    raise_on_status=False,
)
_adapter = HTTPAdapter(max_retries=_retry)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def fetch_worldcup_resource(resource: str) -> Dict[str, Any]:
    now = monotonic()
    cached = _cache.get(resource)
    if cached and now - cached["time"] < CACHE_SECONDS:
        return cached["data"]

    try:
        res = _session.get(f"{BASE_URL}/{resource}", timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        data = res.json()
    except Exception as exc:
        if cached and now - cached["time"] < STALE_CACHE_SECONDS:
            return cached["data"]
        raise HTTPException(status_code=502, detail=f"World Cup API error: {exc}") from exc

    _cache[resource] = {"time": monotonic(), "data": data}
    return data


@router.get("/worldcup/games")
def get_worldcup_games():
    return fetch_worldcup_resource("games")


@router.get("/worldcup/groups")
def get_worldcup_groups():
    return fetch_worldcup_resource("groups")


@router.get("/worldcup/stadiums")
def get_worldcup_stadiums():
    return fetch_worldcup_resource("stadiums")
