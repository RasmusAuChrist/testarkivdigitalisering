# routers/arkiv_details.py
from fastapi import APIRouter, HTTPException, Query
import os
import pymssql
from datetime import date

router = APIRouter()

TABLE = "dbo.gold_fact_requisitions_monthly"  # adjust schema if not dbo

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
        autocommit=True,
    )

def yyyymmdd_to_date(v: int) -> date:
    s = str(int(v))
    if len(s) != 8:
        raise ValueError(f"Bad YYYYMMDD value: {v}")
    return date(int(s[0:4]), int(s[4:6]), int(s[6:8]))

def date_to_yyyymmdd(d: date) -> int:
    return d.year * 10000 + d.month * 100 + d.day

def first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)

def next_month_start(d: date) -> date:
    y = d.year + (d.month // 12)
    m = (d.month % 12) + 1
    return date(y, m, 1)

@router.get("/arkiv/{arkiv_sk}/requisition-history")
def requisition_history(
    arkiv_sk: int,
    from_yyyymmdd: int | None = Query(default=None),
    to_yyyymmdd: int | None = Query(default=None),
):
    """
    Monthly series, missing months filled with zeros.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(as_dict=True)

        where = ["arkiv_sk = %s"]
        params: list = [arkiv_sk]

        if from_yyyymmdd is not None:
            where.append("month_key >= %s")
            params.append(from_yyyymmdd)

        if to_yyyymmdd is not None:
            where.append("month_key <= %s")
            params.append(to_yyyymmdd)

        sql = f"""
            SELECT
                arkiv_sk,
                month_key,
                requisitions_ap,
                requisitions_int
            FROM {TABLE}
            WHERE {" AND ".join(where)}
            ORDER BY month_key ASC;
        """

        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []

        if not rows:
            return {"arkiv_sk": arkiv_sk, "points": []}

        # Map existing rows by normalized month (YYYYMM01)
        by_key: dict[int, dict] = {}
        for r in rows:
            k = int(r["month_key"])
            d = first_of_month(yyyymmdd_to_date(k))
            mk = date_to_yyyymmdd(d)
            by_key[mk] = {
                "date": d.isoformat(),
                "internal": int(r.get("requisitions_int") or 0),
                "ap": int(r.get("requisitions_ap") or 0),
            }

        start_key = min(by_key.keys())
        end_key = max(by_key.keys())

        d = first_of_month(yyyymmdd_to_date(start_key))
        end = first_of_month(yyyymmdd_to_date(end_key))

        points = []
        while d <= end:
            mk = date_to_yyyymmdd(d)
            points.append(by_key.get(mk, {"date": d.isoformat(), "internal": 0, "ap": 0}))
            d = next_month_start(d)

        return {"arkiv_sk": arkiv_sk, "points": points}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if conn:
            conn.close()