# routers/arkiv_details.py
from fastapi import APIRouter, HTTPException, Query
import os
import pymssql
from datetime import date

router = APIRouter()

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

def add_months(d: date, months: int) -> date:
    # Safe month add (keeps day=1 in our usage)
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return date(y, m, 1)

def next_quarter_start(d: date) -> date:
    # Move to next quarter boundary (Jan/Apr/Jul/Oct) on day 1
    q = ((d.month - 1) // 3)  # 0..3
    next_q_month = q * 3 + 1 + 3
    y = d.year
    if next_q_month > 12:
        next_q_month -= 12
        y += 1
    return date(y, next_q_month, 1)

@router.get("/arkiv/{arkiv_sk}/requisition-history")
def requisition_history(
    arkiv_sk: int,
    # Optional: if you want to constrain chart range from UI later
    from_yyyymmdd: int | None = Query(default=None),
    to_yyyymmdd: int | None = Query(default=None),
):
    """
    Returns requisition history for one arkiv_sk as a quarter-stepped time series
    with missing quarters filled with zeros.
    """
    # ✅ Change these identifiers to your real table/column names:
    TABLE = "dbo.tbl_requisition_history"     # <-- change if needed
    COL_DATE = "period_yyyymmdd"              # <-- change if needed
    COL_INT = "requisitions_internal"         # <-- change if needed
    COL_AP = "requisitions_ap"                # <-- change if needed

    where = ["arkiv_sk = %s"]
    params: list = [arkiv_sk]

    if from_yyyymmdd is not None:
        where.append(f"{COL_DATE} >= %s")
        params.append(from_yyyymmdd)

    if to_yyyymmdd is not None:
        where.append(f"{COL_DATE} <= %s")
        params.append(to_yyyymmdd)

    sql = f"""
        SELECT
            arkiv_sk,
            {COL_DATE} AS period_yyyymmdd,
            {COL_INT}  AS requisitions_internal,
            {COL_AP}   AS requisitions_ap
        FROM {TABLE}
        WHERE {" AND ".join(where)}
        ORDER BY {COL_DATE} ASC;
    """

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(as_dict=True)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []

        if not rows:
            return {"arkiv_sk": arkiv_sk, "points": []}

        # Map existing rows by date_key
        by_key: dict[int, dict] = {}
        for r in rows:
            k = int(r["period_yyyymmdd"])
            by_key[k] = {
                "date": yyyymmdd_to_date(k).isoformat(),
                "internal": int(r.get("requisitions_internal") or 0),
                "ap": int(r.get("requisitions_ap") or 0),
            }

        # Build continuous quarter series from min..max
        min_key = min(by_key.keys())
        max_key = max(by_key.keys())
        start = yyyymmdd_to_date(min_key)
        end = yyyymmdd_to_date(max_key)

        # Normalize start/end to quarter starts (day=1 assumed; if not, we still step quarters)
        start = date(start.year, start.month, 1)
        end = date(end.year, end.month, 1)

        points = []
        d = start
        while d <= end:
            k = date_to_yyyymmdd(d)
            if k in by_key:
                points.append(by_key[k])
            else:
                points.append({"date": d.isoformat(), "internal": 0, "ap": 0})

            d = next_quarter_start(d)

        return {"arkiv_sk": arkiv_sk, "points": points}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if conn:
            conn.close()