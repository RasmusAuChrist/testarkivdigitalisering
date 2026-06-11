import logging
from time import monotonic
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter
from fastapi import APIRouter, HTTPException
from urllib3.util.retry import Retry

router = APIRouter()
logger = logging.getLogger(__name__)

BASE_URL = "https://worldcup26.ir/get"
DEFAULT_CACHE_SECONDS = 60 * 60
RESOURCE_CACHE_SECONDS = {
    "games": 30,
    "groups": 5 * 60,
    "stadiums": 24 * 60 * 60,
}
STALE_CACHE_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT = (5, 45)
DIAGNOSTIC_TIMEOUT = (5, 45)
_cache: Dict[str, Dict[str, Any]] = {}

_session = requests.Session()
_retry = Retry(
    total=1,
    connect=1,
    read=0,
    status=1,
    backoff_factor=0.5,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
    raise_on_status=False,
)
_adapter = HTTPAdapter(max_retries=_retry)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def cache_age_seconds(resource: str) -> Optional[float]:
    cached = _cache.get(resource)
    if not cached:
        return None
    return round(monotonic() - cached["time"], 1)


def fetch_worldcup_resource(resource: str, force_refresh: bool = False) -> Dict[str, Any]:
    now = monotonic()
    cached = _cache.get(resource)
    cache_seconds = RESOURCE_CACHE_SECONDS.get(resource, DEFAULT_CACHE_SECONDS)
    if not force_refresh and cached and now - cached["time"] < cache_seconds:
        return cached["data"]

    try:
        res = _session.get(f"{BASE_URL}/{resource}", timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        data = res.json()
    except Exception as exc:
        if cached and now - cached["time"] < STALE_CACHE_SECONDS:
            logger.warning("Using stale World Cup %s cache after upstream error: %s", resource, exc)
            return cached["data"]
        logger.warning("World Cup %s API unavailable and no cache exists: %s", resource, exc)
        raise HTTPException(
            status_code=503,
            detail="World Cup API is temporarily unavailable",
        ) from exc

    _cache[resource] = {"time": monotonic(), "data": data}
    return data


@router.get("/worldcup/games")
def get_worldcup_games(refresh: bool = False):
    return fetch_worldcup_resource("games", force_refresh=refresh)


@router.get("/worldcup/groups")
def get_worldcup_groups():
    return fetch_worldcup_resource("groups")


@router.get("/worldcup/stadiums")
def get_worldcup_stadiums():
    return fetch_worldcup_resource("stadiums")


@router.get("/worldcup/diagnostics")
def get_worldcup_diagnostics():
    resources = ("games", "groups", "stadiums")
    checks = []

    for resource in resources:
        start = monotonic()
        item: Dict[str, Any] = {
            "resource": resource,
            "url": f"{BASE_URL}/{resource}",
            "cache_age_seconds": cache_age_seconds(resource),
        }

        try:
            res = _session.get(item["url"], timeout=DIAGNOSTIC_TIMEOUT)
            elapsed_ms = round((monotonic() - start) * 1000)
            item.update({
                "ok": res.ok,
                "status_code": res.status_code,
                "elapsed_ms": elapsed_ms,
                "content_type": res.headers.get("content-type"),
                "bytes": len(res.content or b""),
            })
        except Exception as exc:
            elapsed_ms = round((monotonic() - start) * 1000)
            item.update({
                "ok": False,
                "elapsed_ms": elapsed_ms,
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            })

        checks.append(item)

    return {
        "base_url": BASE_URL,
        "fresh_cache_seconds": RESOURCE_CACHE_SECONDS,
        "stale_cache_seconds": STALE_CACHE_SECONDS,
        "request_timeout": REQUEST_TIMEOUT,
        "diagnostic_timeout": DIAGNOSTIC_TIMEOUT,
        "checks": checks,
    }
