from fastapi import APIRouter, Query
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

def _table_exists(cursor, table_name):
    cursor.execute(
        "SELECT CASE WHEN OBJECT_ID(%s, 'U') IS NULL THEN 0 ELSE 1 END AS exists_flag;",
        (f"dbo.{table_name}",),
    )
    row = cursor.fetchone() or {}
    return bool(row.get("exists_flag"))

def _table_row_count(cursor, table_name):
    allowed_tables = {
        "tbl_ref_missing_date_series",
        "tbl_ref_missing_date_series_detail",
        "tbl_ref_missing_date_series_summary",
    }
    if table_name not in allowed_tables:
        raise ValueError(f"Unsupported row count table: {table_name}")

    cursor.execute(f"SELECT COUNT(1) AS row_count FROM dbo.{_quote_ident(table_name)};")
    row = cursor.fetchone() or {}
    return int(row.get("row_count") or 0)

def _index_exists(cursor, table_name, index_name):
    cursor.execute("""
        SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE object_id = OBJECT_ID(%s)
              AND name = %s
        ) THEN 1 ELSE 0 END AS exists_flag;
    """, (f"dbo.{table_name}", index_name))
    row = cursor.fetchone() or {}
    return bool(row.get("exists_flag"))

def _missing_date_issue_types(row):
    both_missing_count = int(row.get("both_missing_count") or 0)
    start_missing_count = int(row.get("start_missing_count") or 0)
    slutt_missing_count = int(row.get("slutt_missing_count") or 0)
    start_only_count = max(0, int(row.get("start_only_count") or (start_missing_count - both_missing_count)))
    slutt_only_count = max(0, int(row.get("slutt_only_count") or (slutt_missing_count - both_missing_count)))

    issue_types = []
    if both_missing_count:
        issue_types.append(f"{both_missing_count} stykker mangler både start- og sluttår")
    if start_only_count:
        issue_types.append(f"{start_only_count} stykker mangler bare startår")
    if slutt_only_count:
        issue_types.append(f"{slutt_only_count} stykker mangler bare sluttår")
    return issue_types

def _get_missing_date_summary_from_cache(cursor):
    cursor.execute("""
        SELECT TOP 1
            total_series,
            total_stykker,
            series_with_missing,
            stykker_in_affected_series,
            missing_items,
            both_missing_items,
            start_only_items,
            slutt_only_items,
            fully_missing_series,
            items_with_known_location,
            refreshed_at_utc
        FROM dbo.tbl_ref_missing_date_series_summary;
    """)
    row = cursor.fetchone() or {}
    missing_total = int(row.get("missing_items") or 0)
    total_series = int(row.get("total_series") or 0)
    total_stykker = int(row.get("total_stykker") or 0)
    series_with_missing = int(row.get("series_with_missing") or 0)

    cursor.execute("""
        SELECT name, SUM(count) AS count
        FROM dbo.tbl_ref_missing_date_series_detail
        WHERE kind = 'location'
        GROUP BY name
        ORDER BY count DESC;
    """)
    location_rows = cursor.fetchall()

    cursor.execute("""
        SELECT name, SUM(count) AS count
        FROM dbo.tbl_ref_missing_date_series_detail
        WHERE kind = 'archive'
        GROUP BY name
        ORDER BY count DESC;
    """)
    archive_rows = cursor.fetchall()

    return {
        "series_with_missing": series_with_missing,
        "total_series": total_series,
        "affected_series_percent": _pct(series_with_missing, total_series),
        "fully_missing_series": int(row.get("fully_missing_series") or 0),
        "fully_missing_series_percent": _pct(int(row.get("fully_missing_series") or 0), series_with_missing),
        "stykker_in_affected_series": int(row.get("stykker_in_affected_series") or 0),
        "missing_items": missing_total,
        "total_stykker": total_stykker,
        "missing_items_percent": _pct(missing_total, total_stykker),
        "both_missing_items": int(row.get("both_missing_items") or 0),
        "both_missing_items_percent": _pct(int(row.get("both_missing_items") or 0), missing_total),
        "start_only_items": int(row.get("start_only_items") or 0),
        "start_only_items_percent": _pct(int(row.get("start_only_items") or 0), missing_total),
        "slutt_only_items": int(row.get("slutt_only_items") or 0),
        "slutt_only_items_percent": _pct(int(row.get("slutt_only_items") or 0), missing_total),
        "items_with_known_location": int(row.get("items_with_known_location") or 0),
        "items_with_known_location_percent": _pct(int(row.get("items_with_known_location") or 0), missing_total),
        "locations": [
            {
                "name": item.get("name") or "Ukjent",
                "count": int(item.get("count") or 0),
                "percent": _pct(int(item.get("count") or 0), missing_total),
            }
            for item in location_rows[:12]
        ],
        "location_options": [
            item.get("name") or "Ukjent"
            for item in location_rows
        ],
        "archives": [
            {
                "name": item.get("name") or "Ukjent",
                "count": int(item.get("count") or 0),
                "percent": _pct(int(item.get("count") or 0), missing_total),
            }
            for item in archive_rows[:12]
        ],
        "source": "dbo.tbl_ref_missing_date_series",
        "refreshed_at_utc": row.get("refreshed_at_utc"),
    }

def _get_missing_date_series_from_cache(cursor, page, page_size, q, location, include_summary, summary_only, sort_by, sort_dir):
    summary = _get_missing_date_summary_from_cache(cursor) if (include_summary or summary_only) else None
    if summary_only:
        return {
            "summary": summary,
            "items": [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": 0,
                "total_pages": 1,
                "has_previous": False,
                "has_next": False,
            },
        }

    where = []
    params = []
    q_value = (q or "").strip()
    location_value = (location or "").strip()
    if q_value:
        q_like = f"%{q_value}%"
        where.append("""
            (
                s.serie_path LIKE %s
                OR s.serie_identifikator LIKE %s
                OR s.serie_navn LIKE %s
                OR EXISTS (
                    SELECT 1
                    FROM dbo.tbl_ref_missing_date_series_detail d
                    WHERE d.serie_path = s.serie_path
                      AND d.name LIKE %s
                )
            )
        """)
        params.extend([q_like, q_like, q_like, q_like])
    if location_value:
        where.append("""
            EXISTS (
                SELECT 1
                FROM dbo.tbl_ref_missing_date_series_detail d
                WHERE d.serie_path = s.serie_path
                  AND d.kind = 'location'
                  AND d.name = %s
            )
        """)
        params.append(location_value)

    where_sql = "WHERE " + " AND ".join(where) if where else ""
    sort_map = {
        "serie": "s.serie_identifikator",
        "path": "s.serie_path",
        "stykker": "s.stykke_count",
        "missing": "s.missing_count",
        "andel": "CAST(s.missing_count AS FLOAT) / NULLIF(s.stykke_count, 0)",
        "avvik": "s.missing_count",
        "start": "s.start_only_count",
        "slutt": "s.slutt_only_count",
    }
    sort_expression = sort_map.get(sort_by, "s.missing_count")
    direction = "ASC" if str(sort_dir or "").lower() == "asc" else "DESC"
    if sort_expression == "s.missing_count":
        order_by = f"{sort_expression} {direction}, s.serie_path ASC"
    else:
        order_by = f"{sort_expression} {direction}, s.missing_count DESC, s.serie_path ASC"
    if where:
        cursor.execute(f"""
            SELECT COUNT(1) AS total_items
            FROM dbo.tbl_ref_missing_date_series s
            {where_sql};
        """, tuple(params))
        total_items = int((cursor.fetchone() or {}).get("total_items") or 0)
    else:
        total_items = _table_row_count(cursor, "tbl_ref_missing_date_series")

    offset = (page - 1) * page_size
    cursor.execute(f"""
        SELECT
            serie_path,
            serie_identifikator,
            serie_navn,
            external_amid,
            stykke_count,
            hyllemeter,
            startaar,
            sluttaar,
            missing_count,
            start_missing_count,
            slutt_missing_count,
            both_missing_count,
            start_only_count,
            slutt_only_count
        FROM dbo.tbl_ref_missing_date_series s
        {where_sql}
        ORDER BY {order_by}
        OFFSET %s ROWS
        FETCH NEXT %s ROWS ONLY;
    """, tuple(params + [offset, page_size]))
    series_rows = cursor.fetchall()

    serie_paths = [row.get("serie_path") for row in series_rows if row.get("serie_path")]
    detail_rows = []
    if serie_paths:
        for chunk in _chunked(serie_paths):
            placeholders = ", ".join(["%s"] * len(chunk))
            cursor.execute(f"""
                SELECT serie_path, kind, name, count
                FROM dbo.tbl_ref_missing_date_series_detail
                WHERE serie_path IN ({placeholders})
                ORDER BY count DESC, name;
            """, tuple(chunk))
            detail_rows.extend(cursor.fetchall())

    details_by_series = {}
    for detail in detail_rows:
        details_by_series.setdefault(detail.get("serie_path"), {}).setdefault(detail.get("kind"), []).append({
            "name": detail.get("name") or "Ukjent",
            "count": int(detail.get("count") or 0),
        })

    items = []
    for row in series_rows:
        serie_path = row.get("serie_path") or ""
        detail = details_by_series.get(serie_path, {})
        items.append({
            "serie_path": serie_path,
            "serie_identifikator": row.get("serie_identifikator") or _leaf(serie_path),
            "serie_navn": row.get("serie_navn"),
            "_amid": row.get("external_amid"),
            "external_amid": row.get("external_amid"),
            "stykke_count": int(row.get("stykke_count") or 0),
            "hyllemeter": float(row.get("hyllemeter") or 0),
            "startaar": row.get("startaar"),
            "sluttaar": row.get("sluttaar"),
            "missing_count": int(row.get("missing_count") or 0),
            "start_missing_count": int(row.get("start_missing_count") or 0),
            "slutt_missing_count": int(row.get("slutt_missing_count") or 0),
            "both_missing_count": int(row.get("both_missing_count") or 0),
            "matched_item_count": int(row.get("missing_count") or 0),
            "location_counts": detail.get("location", []),
            "archive_counts": detail.get("archive", [])[:5],
            "issue_types": _missing_date_issue_types(row),
        })

    total_pages = max(1, (total_items + page_size - 1) // page_size)
    return {
        "summary": summary,
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total_items,
            "total_pages": total_pages,
            "has_previous": page > 1,
            "has_next": page < total_pages,
        },
    }

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
def get_missing_date_series(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    q: str | None = Query(None),
    location: str | None = Query(None),
    include_summary: bool = Query(True),
    summary_only: bool = Query(False),
    sort_by: str = Query("missing"),
    sort_dir: str = Query("desc"),
):
    """
    Returns all Asta series that contain stykker with missing start-/sluttår,
    calculated directly from tbl_gold_stykke_hierarchy instead of the workflow
    validation status table.
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        if _table_exists(cursor, "tbl_ref_missing_date_series"):
            return _get_missing_date_series_from_cache(
                cursor,
                page=page,
                page_size=page_size,
                q=q,
                location=location,
                include_summary=include_summary,
                summary_only=summary_only,
                sort_by=sort_by,
                sort_dir=sort_dir,
            )

        return {
            "error": (
                "Mangler hurtigbuffer for manglende år. "
                "Kjør dbo.usp_refresh_missing_date_series_cache i databasen først."
            ),
            "missing_cache": True,
        }

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

        series_base_cte = f"""
            {base_cte},
            missing_series AS (
                SELECT
                    serie_path,
                    MAX(serie_identifikator) AS serie_identifikator,
                    MAX(serie_navn) AS serie_navn,
                    COUNT(1) AS missing_count,
                    SUM(start_missing) AS start_missing_count,
                    SUM(slutt_missing) AS slutt_missing_count,
                    SUM(CASE WHEN start_missing = 1 AND slutt_missing = 1 THEN 1 ELSE 0 END) AS both_missing_count
                FROM item_base
                WHERE start_missing = 1 OR slutt_missing = 1
                GROUP BY serie_path
            ),
            series_base AS (
                SELECT
                    ms.serie_path,
                    COALESCE(CONVERT(NVARCHAR(255), h.identifikator), ms.serie_identifikator) AS serie_identifikator,
                    COALESCE(CONVERT(NVARCHAR(500), h.navn), ms.serie_navn) AS serie_navn,
                    COALESCE(h.stykke_count, ms.missing_count) AS stykke_count,
                    ms.missing_count,
                    ms.start_missing_count,
                    ms.slutt_missing_count,
                    ms.both_missing_count
                FROM missing_series ms
                LEFT JOIN dbo.tbl_gold_serie_hierarchy h
                  ON h.path = ms.serie_path
            )
        """

        filter_clauses = []
        filter_params = []
        q_value = (q or "").strip()
        location_value = (location or "").strip()

        if q_value:
            q_like = f"%{q_value}%"
            filter_clauses.append("""
                (
                    sb.serie_path LIKE %s
                    OR sb.serie_identifikator LIKE %s
                    OR sb.serie_navn LIKE %s
                    OR EXISTS (
                        SELECT 1
                        FROM item_base ib
                        WHERE ib.serie_path = sb.serie_path
                          AND (
                            ib.lokasjon LIKE %s
                            OR ib.arkiv_identifikator LIKE %s
                            OR ib.arkiv_navn LIKE %s
                          )
                    )
                )
            """)
            filter_params.extend([q_like, q_like, q_like, q_like, q_like, q_like])

        if location_value:
            filter_clauses.append("""
                EXISTS (
                    SELECT 1
                    FROM item_base ib
                    WHERE ib.serie_path = sb.serie_path
                      AND (ib.start_missing = 1 OR ib.slutt_missing = 1)
                      AND COALESCE(NULLIF(ib.lokasjon, ''), 'Ukjent') = %s
                )
            """)
            filter_params.append(location_value)

        filter_sql = "WHERE " + " AND ".join(filter_clauses) if filter_clauses else ""
        filtered_cte = f"""
            {series_base_cte},
            filtered_series AS (
                SELECT sb.*
                FROM series_base sb
                {filter_sql}
            )
        """

        def build_summary():
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
                {series_base_cte}
                SELECT
                    COUNT(1) AS series_with_missing,
                    SUM(stykke_count) AS stykker_in_affected_series,
                    SUM(missing_count) AS missing_items,
                    SUM(both_missing_count) AS both_missing_items,
                    SUM(start_missing_count - both_missing_count) AS start_only_items,
                    SUM(slutt_missing_count - both_missing_count) AS slutt_only_items,
                    SUM(CASE WHEN missing_count = stykke_count THEN 1 ELSE 0 END) AS fully_missing_series
                FROM series_base;
            """)
            issue_totals = cursor.fetchone() or {}
            series_with_missing = int(issue_totals.get("series_with_missing") or 0)
            missing_total = int(issue_totals.get("missing_items") or 0)
            both_missing_total = int(issue_totals.get("both_missing_items") or 0)
            start_only_total = int(issue_totals.get("start_only_items") or 0)
            slutt_only_total = int(issue_totals.get("slutt_only_items") or 0)
            fully_missing_series = int(issue_totals.get("fully_missing_series") or 0)

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

            known_location_count = sum(
                int(row.get("count") or 0)
                for row in location_rows
                if row.get("name") != "Ukjent"
            )

            return {
                "series_with_missing": series_with_missing,
                "total_series": total_series,
                "affected_series_percent": _pct(series_with_missing, total_series),
                "fully_missing_series": fully_missing_series,
                "fully_missing_series_percent": _pct(fully_missing_series, series_with_missing),
                "stykker_in_affected_series": int(issue_totals.get("stykker_in_affected_series") or 0),
                "missing_items": missing_total,
                "total_stykker": total_stykker,
                "missing_items_percent": _pct(missing_total, total_stykker),
                "both_missing_items": both_missing_total,
                "both_missing_items_percent": _pct(both_missing_total, missing_total),
                "start_only_items": start_only_total,
                "start_only_items_percent": _pct(start_only_total, missing_total),
                "slutt_only_items": slutt_only_total,
                "slutt_only_items_percent": _pct(slutt_only_total, missing_total),
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
                "location_options": [
                    row.get("name") or "Ukjent"
                    for row in location_rows
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

        if summary_only:
            return {
                "summary": build_summary(),
                "items": [],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_items": None,
                    "total_pages": None,
                    "has_previous": False,
                    "has_next": False,
                },
            }

        offset = (page - 1) * page_size
        cursor.execute(f"""
            {filtered_cte}
            SELECT
                serie_path,
                serie_identifikator,
                serie_navn,
                stykke_count,
                missing_count,
                start_missing_count,
                slutt_missing_count,
                both_missing_count
            FROM filtered_series
            ORDER BY missing_count DESC, serie_path
            OFFSET %s ROWS
            FETCH NEXT %s ROWS ONLY;
        """, tuple(filter_params + [offset, page_size + 1]))
        fetched_series_rows = cursor.fetchall()
        has_next = len(fetched_series_rows) > page_size
        series_rows = fetched_series_rows[:page_size]

        serie_paths = sorted({
            row.get("serie_path")
            for row in series_rows
            if row.get("serie_path")
        })
        series_by_path = {}
        location_by_series_rows = []
        archive_by_series_rows = []

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
                    ib.serie_path,
                    v.kind,
                    v.name,
                    COUNT(1) AS count
                FROM item_base ib
                CROSS APPLY (VALUES
                    ('location', COALESCE(NULLIF(ib.lokasjon, ''), 'Ukjent')),
                    ('archive', COALESCE(NULLIF(ib.arkiv_identifikator, ''), 'Ukjent'))
                ) AS v(kind, name)
                WHERE (ib.start_missing = 1 OR ib.slutt_missing = 1)
                  AND ib.serie_path IN ({placeholders})
                GROUP BY ib.serie_path, v.kind, v.name;
            """, tuple(chunk))
            for detail_row in cursor.fetchall():
                if detail_row.get("kind") == "location":
                    location_by_series_rows.append(detail_row)
                elif detail_row.get("kind") == "archive":
                    archive_by_series_rows.append(detail_row)

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
                issue_types.append(f"{both_missing_count} stykker mangler både start- og sluttår")
            if start_only_count:
                issue_types.append(f"{start_only_count} stykker mangler bare startår")
            if slutt_only_count:
                issue_types.append(f"{slutt_only_count} stykker mangler bare sluttår")

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

        summary = None
        pagination = {
            "page": page,
            "page_size": page_size,
            "total_items": None,
            "total_pages": None,
            "has_previous": page > 1,
            "has_next": has_next,
        }

        return {"summary": summary, "items": rows, "pagination": pagination}

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

@router.get("/missing-date-series/cache-status")
def get_missing_date_series_cache_status():
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        tables = [
            "tbl_ref_missing_date_series",
            "tbl_ref_missing_date_series_detail",
            "tbl_ref_missing_date_series_summary",
        ]
        table_status = {}
        for table_name in tables:
            exists = _table_exists(cursor, table_name)
            table_status[table_name] = {
                "exists": exists,
                "row_count": _table_row_count(cursor, table_name) if exists else 0,
            }

        refreshed_at_utc = None
        if table_status["tbl_ref_missing_date_series_summary"]["exists"]:
            cursor.execute("""
                SELECT TOP 1 refreshed_at_utc
                FROM dbo.tbl_ref_missing_date_series_summary;
            """)
            refreshed_at_utc = (cursor.fetchone() or {}).get("refreshed_at_utc")

        indexes = {}
        if table_status["tbl_ref_missing_date_series_detail"]["exists"]:
            indexes["IX_tbl_ref_missing_date_series_detail_path"] = _index_exists(
                cursor,
                "tbl_ref_missing_date_series_detail",
                "IX_tbl_ref_missing_date_series_detail_path",
            )
            indexes["IX_tbl_ref_missing_date_series_detail_kind_name"] = _index_exists(
                cursor,
                "tbl_ref_missing_date_series_detail",
                "IX_tbl_ref_missing_date_series_detail_kind_name",
            )

        return {
            "ok": True,
            "cache_ready": all(item["exists"] for item in table_status.values()),
            "tables": table_status,
            "indexes": indexes,
            "refreshed_at_utc": refreshed_at_utc,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn:
            conn.close()

@router.post("/missing-date-series/refresh-cache")
def refresh_missing_date_series_cache():
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute("EXEC dbo.usp_refresh_missing_date_series_cache;")
        conn.commit()
        cursor.execute("SELECT COUNT(1) AS cnt FROM dbo.tbl_ref_missing_date_series;")
        count = int((cursor.fetchone() or {}).get("cnt") or 0)
        return {"ok": True, "count": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}
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
