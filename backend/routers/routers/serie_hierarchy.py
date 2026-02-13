from fastapi import APIRouter, Query
import pymssql
import os
from typing import Optional, List, Dict, Any

router = APIRouter()

ALLOWED_SORT = {
    "navn": "navn",
    "identifikator": "identifikator",
    "path": "path",
    "startaar": "startaar",
    "sluttaar": "sluttaar",
    "stykke_count": "stykke_count",
    "hyllemeter": "hyllemeter",
}

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
    )

def _csv_to_list(v: Optional[str]) -> List[str]:
    if not v:
        return []
    return [x.strip() for x in v.split(",") if x.strip()]

@router.get("/serie-hierarchy")
def get_serie_hierarchy(
    q: Optional[str] = Query(default=None, description="Search in navn, identifikator, path"),
    identifikator: Optional[str] = Query(default=None, description="Exact match filter"),
    startaar_from: Optional[int] = Query(default=None),
    startaar_to: Optional[int] = Query(default=None),
    sluttaar_from: Optional[int] = Query(default=None),
    sluttaar_to: Optional[int] = Query(default=None),
    tags: Optional[str] = Query(default=None, description="Comma-separated tags; matches if row contains ANY"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    sort_key: str = Query(default="startaar"),
    sort_dir: str = Query(default="asc"),
) -> Dict[str, Any]:
    """
    Returns paginated results + total count.
    Filtering/sorting happens in SQL to keep it fast for 205k rows.
    """
    sort_col = ALLOWED_SORT.get(sort_key, "startaar")
    sort_dir_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"

    tag_list = _csv_to_list(tags)

    where = []
    params = {}

    if q:
        where.append("(navn LIKE %(q)s OR identifikator LIKE %(q)s OR path LIKE %(q)s)")
        params["q"] = f"%{q}%"

    if identifikator:
        where.append("identifikator = %(identifikator)s")
        params["identifikator"] = identifikator

    if startaar_from is not None:
        where.append("startaar >= %(startaar_from)s")
        params["startaar_from"] = startaar_from

    if startaar_to is not None:
        where.append("startaar <= %(startaar_to)s")
        params["startaar_to"] = startaar_to

    if sluttaar_from is not None:
        where.append("sluttaar >= %(sluttaar_from)s")
        params["sluttaar_from"] = sluttaar_from

    if sluttaar_to is not None:
        where.append("sluttaar <= %(sluttaar_to)s")
        params["sluttaar_to"] = sluttaar_to

    # Tags stored as a comma-separated string -> we do a simple LIKE-any match.
    # For best performance long-term, normalize tags into a join table.
    if tag_list:
        ors = []
        for i, t in enumerate(tag_list):
            key = f"tag{i}"
            ors.append("predicted_tags LIKE %(" + key + ")s")
            params[key] = f"%{t}%"
        where.append("(" + " OR ".join(ors) + ")")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    offset = (page - 1) * page_size
    params["offset"] = offset
    params["page_size"] = page_size

    # NOTE: Replace schema/table name if needed
    base_from = f"""
        FROM tbl_gold_serie_hierarchy
        {where_sql}
    """

    count_sql = f"SELECT COUNT(1) AS total {base_from};"

    data_sql = f"""
        SELECT
            _amid,
            path,
            stykke_count,
            hyllemeter,
            startaar,
            sluttaar,
            predicted_tags,
            identifikator,
            navn
        {base_from}
        ORDER BY {sort_col} {sort_dir_sql}
        OFFSET %(offset)s ROWS
        FETCH NEXT %(page_size)s ROWS ONLY;
    """

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        cursor.execute(count_sql, params)
        total = cursor.fetchone()["total"]

        cursor.execute(data_sql, params)
        items = cursor.fetchall()

        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": items,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()


@router.get("/serie-hierarchy/facets")
def get_serie_hierarchy_facets() -> Dict[str, Any]:
    """
    Lightweight endpoint for UI dropdowns.
    If predicted_tags is huge/unbounded, you might skip tags here and do a typeahead endpoint instead.
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        # Example: distinct identifikator prefixes / or other facets you want
        cursor.execute("SELECT COUNT(1) AS total FROM tbl_gold_serie_hierarchy;")
        total = cursor.fetchone()["total"]

        # NOTE: "distinct tags" is expensive if tags are free-form in one column.
        # Prefer a normalized tag table or a search/typeahead endpoint.
        return {"total": total}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()
