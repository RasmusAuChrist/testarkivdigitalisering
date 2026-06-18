from fastapi import APIRouter, Query
import pymssql
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# -----------------------------
# DB Connection
# -----------------------------
def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE")
    )

# -----------------------------
# GET /api/depots
# -----------------------------
@router.get("/depots")
def get_depots():
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
            SELECT DISTINCT
                LEFT(path, CHARINDEX('/', path) - 1) AS depot
            FROM tbl_bronze_asta_shelf
            WHERE path LIKE '%/%/%/%/%'
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

# -----------------------------
# GET /api/rooms
# -----------------------------
@router.get("/rooms")
def get_available_rooms(depot: str = "OSL1"):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
            SELECT DISTINCT
                SUBSTRING(path, CHARINDEX('/', path) + 1,
                          CHARINDEX('/', path, CHARINDEX('/', path) + 1)
                          - CHARINDEX('/', path) - 1) AS room
            FROM tbl_bronze_asta_shelf
            WHERE path LIKE %s
        """

        cursor.execute(query, (f"{depot}/%/%/%/%",))
        rows = cursor.fetchall()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

# -----------------------------
# GET /api/shelves
# -----------------------------
@router.get("/shelves")
def get_shelves(depot: str = "OSL1", room: str = "1A"):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
            SELECT name, path, total_space
            FROM tbl_bronze_asta_shelf
            WHERE path LIKE %s
        """

        cursor.execute(query, (f"{depot}/{room}/%",))
        shelves = cursor.fetchall()

        return shelves

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

# -----------------------------
# GET /api/items (LOCATION VIEW)
# -----------------------------
@router.get("/items")
def get_items(depot: str = "OSL1", room: str = "1A"):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
            SELECT
                stykke_identifikator AS item_id,
                arkiv_identifikator AS arkiv,
                hylleplassering AS shelf_path,
                asta_sti AS item_path
            FROM tbl_gold_stykke_hierarchy
            WHERE hylleplassering LIKE %s
        """

        cursor.execute(query, (f"{depot}/{room}/%",))
        items = cursor.fetchall()

        for item in items:
            parts = item["shelf_path"].split("/") if item["shelf_path"] else []
            if len(parts) >= 5:
                item["aisle"] = int(parts[2])
                item["bay"] = int(parts[3])
                item["shelf"] = int(parts[4])
            else:
                item["aisle"] = None
                item["bay"] = None
                item["shelf"] = None

        return items

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

# =========================================================
# SAH MOVEMENT TRACKING
# =========================================================

# -----------------------------
# GET /api/sah-arkiv-navn
# -----------------------------
@router.get("/sah-arkiv-navn")
def get_sah_arkiv_navn():
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
            SELECT DISTINCT arkiv_navn
            FROM tbl_gold_stykke_hierarchy
            WHERE lokasjon = 'SAH'
              AND arkiv_navn IS NOT NULL
              AND LTRIM(RTRIM(arkiv_navn)) <> ''
            ORDER BY arkiv_navn
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

# -----------------------------
# GET /api/sah-items
# -----------------------------
@router.get("/sah-items")
def get_sah_items(
    arkiv_navn: str | None = Query(default=None),
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: str = Query(default="100"),
    sort_by: str = Query(default="asta_sti"),
    sort_dir: str = Query(default="asc"),
):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        filters = ["lokasjon = %s"]
        params = ["SAH"]

        if arkiv_navn and arkiv_navn.strip():
            filters.append("arkiv_navn = %s")
            params.append(arkiv_navn.strip())

        if status == "ikke_flyttet":
            filters.append("(hylleplassering IS NULL OR hylleplassering LIKE 'SAH%')")
        elif status == "flyttet":
            filters.append("hylleplassering LIKE 'Hamar%'")
        elif status == "avvik":
            filters.append("""
                NOT (
                    hylleplassering IS NULL
                    OR hylleplassering LIKE 'SAH%'
                    OR hylleplassering LIKE 'Hamar%'
                )
            """)

        if search and search.strip():
            like_value = f"%{search.strip()}%"
            filters.append("""
                (
                    stykke_identifikator LIKE %s
                    OR arkiv_identifikator LIKE %s
                    OR arkiv_navn LIKE %s
                    OR asta_sti LIKE %s
                    OR hylleplassering LIKE %s
                )
            """)
            params.extend([like_value, like_value, like_value, like_value, like_value])

        page_size_raw = str(page_size).strip().lower()
        show_all = page_size_raw == "all"
        if show_all:
            effective_page_size = None
        else:
            try:
                effective_page_size = int(page_size_raw)
            except ValueError:
                effective_page_size = 100
            effective_page_size = max(1, min(effective_page_size, 5000))

        sortable_columns = {
            "asta_sti": "asta_sti",
            "hylleplassering": "hylleplassering",
        }
        sort_column = sortable_columns.get(sort_by, "asta_sti")
        sort_direction = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

        where_clause = " AND ".join(filters)

        count_query = f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE
                    WHEN hylleplassering IS NULL OR hylleplassering LIKE 'SAH%' THEN 1
                    ELSE 0
                END) AS not_moved_total,
                SUM(CASE
                    WHEN hylleplassering LIKE 'Hamar%' THEN 1
                    ELSE 0
                END) AS moved_total,
                SUM(CASE
                    WHEN NOT (
                        hylleplassering IS NULL
                        OR hylleplassering LIKE 'SAH%'
                        OR hylleplassering LIKE 'Hamar%'
                    ) THEN 1
                    ELSE 0
                END) AS deviation_total
            FROM tbl_gold_stykke_hierarchy
            WHERE {where_clause}
        """
        cursor.execute(count_query, tuple(params))
        totals = cursor.fetchone() or {}

        order_by_clause = f"""
            CASE WHEN {sort_column} IS NULL OR LTRIM(RTRIM({sort_column})) = '' THEN 1 ELSE 0 END,
            {sort_column} {sort_direction},
            arkiv_identifikator,
            stykke_identifikator
        """

        data_query = f"""
            SELECT
                stykke_identifikator,
                arkiv_identifikator,
                arkiv_navn,
                lokasjon,
                hylleplassering,
                asta_sti,
                CASE
                    WHEN hylleplassering IS NULL OR hylleplassering LIKE 'SAH%' THEN 'ikke_flyttet'
                    WHEN hylleplassering LIKE 'Hamar%' THEN 'flyttet'
                    ELSE 'avvik'
                END AS movement_status
            FROM tbl_gold_stykke_hierarchy
            WHERE {where_clause}
            ORDER BY {order_by_clause}
        """

        total = totals.get("total") or 0
        if show_all:
            cursor.execute(data_query, tuple(params))
            response_page = 1
            response_page_size = total
            total_pages = 1 if total else 0
        else:
            offset = (page - 1) * effective_page_size
            paged_query = f"{data_query} OFFSET %s ROWS FETCH NEXT %s ROWS ONLY"
            cursor.execute(paged_query, tuple(params + [offset, effective_page_size]))
            response_page = page
            response_page_size = effective_page_size
            total_pages = (total + effective_page_size - 1) // effective_page_size if total else 0
        rows = cursor.fetchall()

        moved_total = totals.get("moved_total") or 0
        not_moved_total = totals.get("not_moved_total") or 0
        deviation_total = totals.get("deviation_total") or 0
        progress_percent = round((moved_total / total) * 100, 2) if total else 0

        return {
            "items": rows,
            "total": total,
            "page": response_page,
            "page_size": response_page_size,
            "total_pages": total_pages,
            "summary": {
                "total_items": total,
                "not_moved": not_moved_total,
                "moved_correctly": moved_total,
                "deviations": deviation_total,
                "progress_percent": progress_percent
            }
        }

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()
