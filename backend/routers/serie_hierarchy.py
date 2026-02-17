from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field
import pymssql
import os
from typing import Optional, List, Dict, Any

router = APIRouter()

ALLOWED_SORT = {
    "order_no": "order_no",
    "navn": "navn",
    "identifikator": "identifikator",
    "path": "path",
    "startaar": "startaar",
    "sluttaar": "sluttaar",
    "stykke_count": "stykke_count",
    "hyllemeter": "hyllemeter",
}

def get_connection():
    # Important: do NOT enable autocommit; we want explicit commit for the proc calls.
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
        autocommit=False,
    )

def _csv_to_str_list(v: Optional[str], limit: int = 200) -> List[str]:
    if not v:
        return []
    out: List[str] = []
    for raw in v.split(","):
        s = raw.strip()
        if not s:
            continue
        out.append(s)
        if len(out) >= limit:
            break
    return out

def _csv_to_int_list(v: Optional[str], limit: int = 500) -> List[int]:
    if not v:
        return []
    out: List[int] = []
    for raw in v.split(","):
        s = raw.strip()
        if not s:
            continue
        try:
            out.append(int(s))
        except ValueError:
            continue
        if len(out) >= limit:
            break
    return out

def _build_in_clause(
    column: str,
    values: List[Any],
    params: Dict[str, Any],
    param_prefix: str,
) -> Optional[str]:
    if not values:
        return None
    ph = []
    for i, v in enumerate(values):
        k = f"{param_prefix}{i}"
        ph.append(f"%({k})s")
        params[k] = v
    return f"{column} IN (" + ", ".join(ph) + ")"

def _sql_error_message(e: Exception) -> str:
    """
    pymssql exceptions often have args like:
      (severity, state, message, procname, lineno)
    or simply a string. We try to extract the most human-readable message.
    """
    try:
        if hasattr(e, "args") and e.args:
            # Find a string-like payload in args
            for a in reversed(e.args):
                if isinstance(a, str) and a.strip():
                    return a.strip()
            return str(e.args[0])
    except Exception:
        pass
    return str(e)

# -----------------------------
# MAIN DATA ENDPOINT
# -----------------------------
@router.get("/serie-hierarchy")
def get_serie_hierarchy(
    q: Optional[str] = Query(default=None, description="Search in navn, identifikator, path"),
    identifikator: Optional[str] = Query(default=None, description="Exact match filter (single)"),

    # multi-select filters (comma-separated)
    navn_values: Optional[str] = Query(default=None, description="Comma-separated navn values (exact match)"),
    identifikator_values: Optional[str] = Query(default=None, description="Comma-separated identifikator values (exact match)"),

    startaar_from: Optional[int] = Query(default=None),
    startaar_to: Optional[int] = Query(default=None),
    sluttaar_from: Optional[int] = Query(default=None),
    sluttaar_to: Optional[int] = Query(default=None),

    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    sort_key: str = Query(default="startaar"),
    sort_dir: str = Query(default="asc"),
) -> Dict[str, Any]:
    sort_col = ALLOWED_SORT.get(sort_key, "startaar")
    sort_dir_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"

    navn_list = _csv_to_str_list(navn_values, limit=200)
    ident_list = _csv_to_str_list(identifikator_values, limit=200)

    where: List[str] = []
    params: Dict[str, Any] = {}

    if q:
        where.append("(navn LIKE %(q)s OR identifikator LIKE %(q)s OR path LIKE %(q)s)")
        params["q"] = f"%{q}%"

    if identifikator:
        where.append("identifikator = %(identifikator)s")
        params["identifikator"] = identifikator

    clause = _build_in_clause("navn", navn_list, params, "navn")
    if clause:
        where.append(clause)

    clause = _build_in_clause("identifikator", ident_list, params, "identv")
    if clause:
        where.append(clause)

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

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    offset = (page - 1) * page_size
    params["offset"] = offset
    params["page_size"] = page_size

    base_from = f"""
        FROM tbl_gold_serie_hierarchy
        {where_sql}
    """

    count_sql = f"SELECT COUNT(1) AS total {base_from};"

    data_sql = f"""
        SELECT
            _amid,
            path,
            order_no,
            stykke_count,
            hyllemeter,
            startaar,
            sluttaar,
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
        total_row = cursor.fetchone()
        total = int(total_row["total"]) if total_row and total_row.get("total") is not None else 0

        cursor.execute(data_sql, params)
        items = cursor.fetchall()

        return {"page": page, "page_size": page_size, "total": total, "items": items}
    except Exception as e:
        # keep your existing behavior for this endpoint
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()


@router.get("/serie-hierarchy/facets")
def get_serie_hierarchy_facets() -> Dict[str, Any]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute("SELECT COUNT(1) AS total FROM tbl_gold_serie_hierarchy;")
        total = cursor.fetchone()["total"]
        return {"total": total}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()


# -----------------------------
# SUGGEST ENDPOINTS
# -----------------------------
@router.get("/serie-hierarchy/suggest/identifikator")
def suggest_identifikator(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
) -> Dict[str, Any]:
    sql = f"""
        SELECT DISTINCT TOP ({limit})
            identifikator AS v
        FROM tbl_gold_serie_hierarchy
        WHERE identifikator IS NOT NULL
          AND identifikator LIKE %(q)s
        ORDER BY v;
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(as_dict=True)
        cur.execute(sql, {"q": f"%{q}%"})
        rows = cur.fetchall()
        return {"items": [r["v"] for r in rows if r.get("v") is not None]}
    except Exception as e:
        return {"error": str(e), "items": []}
    finally:
        if conn:
            conn.close()


@router.get("/serie-hierarchy/suggest/navn")
def suggest_navn(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
) -> Dict[str, Any]:
    sql = f"""
        SELECT DISTINCT TOP ({limit})
            navn AS v
        FROM tbl_gold_serie_hierarchy
        WHERE navn IS NOT NULL
          AND navn LIKE %(q)s
        ORDER BY v;
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(as_dict=True)
        cur.execute(sql, {"q": f"%{q}%"})
        rows = cur.fetchall()
        return {"items": [r["v"] for r in rows if r.get("v") is not None]}
    except Exception as e:
        return {"error": str(e), "items": []}
    finally:
        if conn:
            conn.close()


# -----------------------------
# ORDER ACTION ENDPOINTS (NEW)
# -----------------------------
class OrderAction(BaseModel):
    amid: str = Field(..., description="UNIQUEIDENTIFIER as string")
    order_no: int = Field(..., ge=1, description="Order number (int)")

@router.post("/orders/build")
def build_order(payload: OrderAction) -> Dict[str, Any]:
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Execute proc; parameters are passed safely via DBAPI
        cur.execute("EXEC dbo.usp_build_order %s, %s", (payload.amid, payload.order_no))
        conn.commit()

        return {
            "ok": True,
            "action": "added",
            "amid": payload.amid,
            "order_no": payload.order_no,
        }

    except Exception as e:
        if conn:
            conn.rollback()
        msg = _sql_error_message(e)

        # Your stored proc uses THROW with clear messages -> treat as 400 so UI can show it.
        # (We don't strictly parse error numbers here; message is enough for a good UX.)
        raise HTTPException(status_code=400, detail=msg)

    finally:
        if conn:
            conn.close()


@router.post("/orders/remove")
def remove_from_order(payload: OrderAction) -> Dict[str, Any]:
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("EXEC dbo.usp_remove_from_order %s, %s", (payload.amid, payload.order_no))
        conn.commit()

        return {
            "ok": True,
            "action": "removed",
            "amid": payload.amid,
            "order_no": payload.order_no,
        }

    except Exception as e:
        if conn:
            conn.rollback()
        msg = _sql_error_message(e)
        raise HTTPException(status_code=400, detail=msg)

    finally:
        if conn:
            conn.close()
