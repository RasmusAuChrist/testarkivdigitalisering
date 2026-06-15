from fastapi import APIRouter
import pymssql
import os
import json

router = APIRouter()

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE")
    )

def _chunked(values, size=400):
    for i in range(0, len(values), size):
        yield values[i:i + size]

def _pct(part, whole):
    return round((part / whole) * 100, 1) if whole else 0

def _quote_ident(name):
    return f"[{str(name).replace(']', ']]')}]"

def _columns_for_table(cursor, table_name):
    cursor.execute("""
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = %s;
    """, (table_name,))
    return {row["COLUMN_NAME"].lower(): row["COLUMN_NAME"] for row in cursor.fetchall()}

def _pick_column(columns, candidates):
    for candidate in candidates:
        found = columns.get(candidate.lower())
        if found:
            return found
    return None

def _missing_year_expr(column):
    q = _quote_ident(column)
    return f"""
        (
            {q} IS NULL
            OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), {q}))) IN ('', '0', '0000')
        )
    """

def _parent_path_expr(path_column):
    q = _quote_ident(path_column)
    return f"""
        CASE
            WHEN {q} IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), {q}))) = '' THEN 'Ukjent'
            WHEN CHARINDEX('/', REVERSE(CONVERT(NVARCHAR(MAX), {q}))) > 0
                THEN LEFT(
                    CONVERT(NVARCHAR(MAX), {q}),
                    LEN(CONVERT(NVARCHAR(MAX), {q})) - CHARINDEX('/', REVERSE(CONVERT(NVARCHAR(MAX), {q})))
                )
            ELSE CONVERT(NVARCHAR(MAX), {q})
        END
    """

def _leaf(value):
    text = str(value or "").strip().strip("/")
    return text.rsplit("/", 1)[-1] if text else ""

@router.get("/validation-status")
def get_validation_status():
    """
    Returns validation results from tbl_ref_validation_status,
    including parsed missing_items and ordre-level validation flags.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
        SELECT 
            ordre,
            serie_path,
            missing_count,
            missing_items,
            ordre_startdato_ok,
            ordre_sluttdato_ok,
            ordre_hyllemeter_ok
        FROM dbo.tbl_ref_validation_status
        ORDER BY ordre;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            try:
                row["missing_items"] = json.loads(row["missing_items"])
            except Exception:
                row["missing_items"] = []

        return rows

    except Exception as e:
        return {"error": str(e)}

@router.get("/missing-date-series")
def get_missing_date_series():
    """
    Returns all Asta series that contain stykker with missing start-/sluttår,
    calculated directly from tbl_gold_stykke_hierarchy instead of the workflow
    validation status table.
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        columns = _columns_for_table(cursor, "tbl_gold_stykke_hierarchy")
        serie_columns = _columns_for_table(cursor, "tbl_gold_serie_hierarchy")
        start_col = _pick_column(columns, ["stykke_startaar", "startaar", "startar", "startår", "start_year"])
        end_col = _pick_column(columns, ["stykke_sluttar", "stykke_sluttaar", "sluttaar", "sluttar", "sluttår", "endaar", "end_year"])
        path_col = _pick_column(columns, ["asta_sti", "path"])
        arkiv_col = _pick_column(columns, ["arkiv_identifikator"])
        arkiv_navn_col = _pick_column(columns, ["arkiv_navn"])
        lokasjon_col = _pick_column(columns, ["lokasjon"])
        serie_path_col = _pick_column(columns, ["serie_path", "serie_sti", "serie_asta_sti"])
        serie_ident_col = _pick_column(columns, ["serie_identifikator"])
        serie_name_col = _pick_column(columns, ["serie_navn"])
        serie_amid_col = _pick_column(serie_columns, ["_amid", "amid", "ExternalAmid"])

        missing_columns = [
            label
            for label, col in [
                ("startår", start_col),
                ("sluttår", end_col),
                ("Asta-sti/path", path_col),
            ]
            if not col
        ]
        if missing_columns:
            return {
                "error": (
                    "Mangler forventede kolonner i dbo.tbl_gold_stykke_hierarchy: "
                    + ", ".join(missing_columns)
                ),
                "available_columns": sorted(columns.values()),
            }

        start_missing = _missing_year_expr(start_col)
        end_missing = _missing_year_expr(end_col)
        serie_path_expr = _quote_ident(serie_path_col) if serie_path_col else _parent_path_expr(path_col)
        serie_ident_expr = _quote_ident(serie_ident_col) if serie_ident_col else "NULL"
        serie_name_expr = _quote_ident(serie_name_col) if serie_name_col else "NULL"
        arkiv_expr = _quote_ident(arkiv_col) if arkiv_col else "NULL"
        arkiv_navn_expr = _quote_ident(arkiv_navn_col) if arkiv_navn_col else "NULL"
        lokasjon_expr = _quote_ident(lokasjon_col) if lokasjon_col else "NULL"
        serie_amid_expr = _quote_ident(serie_amid_col) if serie_amid_col else "NULL"

        base_cte = f"""
            WITH item_base AS (
                SELECT
                    CONVERT(NVARCHAR(1000), {serie_path_expr}) AS serie_path,
                    CONVERT(NVARCHAR(255), {serie_ident_expr}) AS serie_identifikator,
                    CONVERT(NVARCHAR(500), {serie_name_expr}) AS serie_navn,
                    CONVERT(NVARCHAR(255), {arkiv_expr}) AS arkiv_identifikator,
                    CONVERT(NVARCHAR(500), {arkiv_navn_expr}) AS arkiv_navn,
                    CONVERT(NVARCHAR(255), {lokasjon_expr}) AS lokasjon,
                    CONVERT(NVARCHAR(1000), {_quote_ident(path_col)}) AS asta_sti,
                    CONVERT(NVARCHAR(50), {_quote_ident(start_col)}) AS startaar,
                    CONVERT(NVARCHAR(50), {_quote_ident(end_col)}) AS sluttaar,
                    CASE WHEN {start_missing} THEN 1 ELSE 0 END AS start_missing,
                    CASE WHEN {end_missing} THEN 1 ELSE 0 END AS slutt_missing
                FROM dbo.tbl_gold_stykke_hierarchy
            )
        """

        cursor.execute(f"""
            {base_cte}
            SELECT
                COUNT(DISTINCT serie_path) AS total_series,
                COUNT(1) AS total_stykker
            FROM item_base;
        """)
        totals = cursor.fetchone() or {}
        total_series = int(totals.get("total_series") or 0)
        total_stykker = int(totals.get("total_stykker") or 0)

        cursor.execute(f"""
            {base_cte}
            SELECT
                serie_path,
                MAX(serie_identifikator) AS serie_identifikator,
                MAX(serie_navn) AS serie_navn,
                COUNT(1) AS stykke_count,
                SUM(CASE WHEN start_missing = 1 OR slutt_missing = 1 THEN 1 ELSE 0 END) AS missing_count,
                SUM(start_missing) AS start_missing_count,
                SUM(slutt_missing) AS slutt_missing_count,
                SUM(CASE WHEN start_missing = 1 AND slutt_missing = 1 THEN 1 ELSE 0 END) AS both_missing_count
            FROM item_base
            GROUP BY serie_path
            HAVING SUM(CASE WHEN start_missing = 1 OR slutt_missing = 1 THEN 1 ELSE 0 END) > 0
            ORDER BY missing_count DESC, serie_path;
        """)
        series_rows = cursor.fetchall()

        serie_paths = sorted({
            row.get("serie_path")
            for row in series_rows
            if row.get("serie_path")
        })
        series_by_path = {}
        for chunk in _chunked(serie_paths):
            placeholders = ", ".join(["%s"] * len(chunk))
            cursor.execute(f"""
                SELECT
                    path,
                    identifikator,
                    navn,
                    stykke_count,
                    hyllemeter,
                    startaar,
                    sluttaar,
                    CONVERT(NVARCHAR(100), {serie_amid_expr}) AS _amid
                FROM dbo.tbl_gold_serie_hierarchy
                WHERE path IN ({placeholders});
            """, tuple(chunk))
            for row in cursor.fetchall():
                series_by_path[row.get("path")] = row

        cursor.execute(f"""
            {base_cte}
            SELECT
                COALESCE(NULLIF(lokasjon, ''), 'Ukjent') AS name,
                COUNT(1) AS count
            FROM item_base
            WHERE start_missing = 1 OR slutt_missing = 1
            GROUP BY COALESCE(NULLIF(lokasjon, ''), 'Ukjent')
            ORDER BY count DESC;
        """)
        location_rows = cursor.fetchall()

        cursor.execute(f"""
            {base_cte}
            SELECT
                COALESCE(NULLIF(arkiv_identifikator, ''), 'Ukjent') AS name,
                COUNT(1) AS count
            FROM item_base
            WHERE start_missing = 1 OR slutt_missing = 1
            GROUP BY COALESCE(NULLIF(arkiv_identifikator, ''), 'Ukjent')
            ORDER BY count DESC;
        """)
        archive_rows = cursor.fetchall()

        cursor.execute(f"""
            {base_cte}
            SELECT
                serie_path,
                COALESCE(NULLIF(lokasjon, ''), 'Ukjent') AS name,
                COUNT(1) AS count
            FROM item_base
            WHERE start_missing = 1 OR slutt_missing = 1
            GROUP BY serie_path, COALESCE(NULLIF(lokasjon, ''), 'Ukjent');
        """)
        location_by_series_rows = cursor.fetchall()

        cursor.execute(f"""
            {base_cte}
            SELECT
                serie_path,
                COALESCE(NULLIF(arkiv_identifikator, ''), 'Ukjent') AS name,
                COUNT(1) AS count
            FROM item_base
            WHERE start_missing = 1 OR slutt_missing = 1
            GROUP BY serie_path, COALESCE(NULLIF(arkiv_identifikator, ''), 'Ukjent');
        """)
        archive_by_series_rows = cursor.fetchall()

        locations_by_series = {}
        for item in location_by_series_rows:
            locations_by_series.setdefault(item.get("serie_path"), []).append({
                "name": item.get("name") or "Ukjent",
                "count": int(item.get("count") or 0),
            })

        archives_by_series = {}
        for item in archive_by_series_rows:
            archives_by_series.setdefault(item.get("serie_path"), []).append({
                "name": item.get("name") or "Ukjent",
                "count": int(item.get("count") or 0),
            })

        rows = []
        for row in series_rows:
            serie_path = row.get("serie_path") or ""
            serie_meta = series_by_path.get(serie_path) or {}
            missing_count = int(row.get("missing_count") or 0)
            start_missing_count = int(row.get("start_missing_count") or 0)
            slutt_missing_count = int(row.get("slutt_missing_count") or 0)
            both_missing_count = int(row.get("both_missing_count") or 0)
            start_only_count = max(0, start_missing_count - both_missing_count)
            slutt_only_count = max(0, slutt_missing_count - both_missing_count)

            issue_types = []
            if both_missing_count:
                issue_types.append(f"{both_missing_count} stykker mangler start-/sluttår")
            if start_only_count:
                issue_types.append(f"{start_only_count} stykker mangler startår")
            if slutt_only_count:
                issue_types.append(f"{slutt_only_count} stykker mangler sluttår")

            rows.append({
                "serie_path": serie_path,
                "serie_identifikator": (
                    serie_meta.get("identifikator")
                    or row.get("serie_identifikator")
                    or _leaf(serie_path)
                ),
                "serie_navn": serie_meta.get("navn") or row.get("serie_navn"),
                "_amid": serie_meta.get("_amid"),
                "external_amid": serie_meta.get("_amid"),
                "stykke_count": int(row.get("stykke_count") or serie_meta.get("stykke_count") or 0),
                "hyllemeter": float(serie_meta.get("hyllemeter") or 0),
                "startaar": serie_meta.get("startaar"),
                "sluttaar": serie_meta.get("sluttaar"),
                "missing_count": missing_count,
                "start_missing_count": start_missing_count,
                "slutt_missing_count": slutt_missing_count,
                "both_missing_count": both_missing_count,
                "matched_item_count": missing_count,
                "location_counts": sorted(
                    locations_by_series.get(serie_path, []),
                    key=lambda item: item["count"],
                    reverse=True,
                ),
                "archive_counts": sorted(
                    archives_by_series.get(serie_path, []),
                    key=lambda item: item["count"],
                    reverse=True,
                )[:5],
                "issue_types": issue_types,
            })

        missing_total = sum(row["missing_count"] for row in rows)
        known_location_count = sum(
            int(row.get("count") or 0)
            for row in location_rows
            if row.get("name") != "Ukjent"
        )
        summary = {
            "series_with_missing": len(rows),
            "total_series": total_series,
            "affected_series_percent": _pct(len(rows), total_series),
            "missing_items": missing_total,
            "total_stykker": total_stykker,
            "missing_items_percent": _pct(missing_total, total_stykker),
            "items_with_known_location": known_location_count,
            "items_with_known_location_percent": _pct(known_location_count, missing_total),
            "locations": [
                {
                    "name": row.get("name") or "Ukjent",
                    "count": int(row.get("count") or 0),
                    "percent": _pct(int(row.get("count") or 0), missing_total),
                }
                for row in location_rows[:12]
            ],
            "archives": [
                {
                    "name": row.get("name") or "Ukjent",
                    "count": int(row.get("count") or 0),
                    "percent": _pct(int(row.get("count") or 0), missing_total),
                }
                for row in archive_rows[:12]
            ],
            "source": "dbo.tbl_gold_stykke_hierarchy",
            "date_columns": {"start": start_col, "end": end_col},
        }

        return {"summary": summary, "items": rows}

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

@router.post("/validation-status/refresh")
def refresh_validation_status():
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # ✅ schema-qualify the proc
        cursor.execute("EXEC dbo.usp_RefreshValidationStatus;")
        conn.commit()

        # ✅ verify table exists + readable AFTER refresh
        cursor = conn.cursor(as_dict=True)
        cursor.execute("SELECT COUNT(1) AS cnt FROM dbo.tbl_ref_validation_status;")
        cnt = cursor.fetchone()["cnt"]

        return {"ok": True, "count": int(cnt)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn:
            conn.close()
