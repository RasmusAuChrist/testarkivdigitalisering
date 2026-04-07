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
        conn.close()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}

# -----------------------------
# GET /api/rooms
# -----------------------------
@router.get("/rooms")
def get_available_rooms(depot: str = "OSL1"):
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
        conn.close()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}

# -----------------------------
# GET /api/shelves
# -----------------------------
@router.get("/shelves")
def get_shelves(depot: str = "OSL1", room: str = "1A"):
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
        conn.close()

        return shelves

    except Exception as e:
        return {"error": str(e)}

# -----------------------------
# GET /api/items (LOCATION VIEW)
# -----------------------------
@router.get("/items")
def get_items(depot: str = "OSL1", room: str = "1A"):
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
        conn.close()

        for item in items:
            parts = item["shelf_path"].split("/")
            if len(parts) >= 5:
                item["aisle"] = int(parts[2])
                item["bay"] = int(parts[3])
                item["shelf"] = int(parts[4])
            else:
                item["aisle"] = item["bay"] = item["shelf"] = None

        return items

    except Exception as e:
        return {"error": str(e)}

# =========================================================
# SAH ENDPOINTS (UPDATED TO tbl_gold_stykke_hierarchy)
# =========================================================

# -----------------------------
# GET /api/sah-arkiv-navn
# -----------------------------
@router.get("/sah-arkiv-navn")
def get_sah_arkiv_navn():
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
            SELECT DISTINCT arkiv_navn
            FROM tbl_gold_stykke_hierarchy
            WHERE (
                hylleplassering LIKE 'SAH%'
                OR asta_sti LIKE 'SAH%'
            )
            AND arkiv_navn IS NOT NULL
            AND LTRIM(RTRIM(arkiv_navn)) <> ''
            ORDER BY arkiv_navn
        """

        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        return [row[0] for row in rows if row[0] is not None]

    except Exception as e:
        return {"error": str(e)}

# -----------------------------
# GET /api/sah-items (PAGINATED)
# -----------------------------
@router.get("/sah-items")
def get_sah_items(
    arkiv_navn: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
):
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        filters = [
            "(hylleplassering LIKE 'SAH%' OR asta_sti LIKE 'SAH%')"
        ]
        params = []

        if arkiv_navn and arkiv_navn.strip():
            filters.append("arkiv_navn = %s")
            params.append(arkiv_navn.strip())

        if search and search.strip():
            filters.append("""
                (
                    arkiv_identifikator LIKE %s
                    OR arkiv_navn LIKE %s
                    OR asta_sti LIKE %s
                )
            """)
            like_value = f"%{search.strip()}%"
            params.extend([like_value, like_value, like_value])

        where_clause = " AND ".join(filters)
        offset = (page - 1) * page_size

        # COUNT
        count_query = f"""
            SELECT COUNT(*) AS total
            FROM tbl_gold_stykke_hierarchy
            WHERE {where_clause}
        """
        cursor.execute(count_query, tuple(params))
        total = cursor.fetchone()["total"]

        # DATA
        data_query = f"""
            SELECT
                arkiv_identifikator,
                arkiv_navn,
                asta_sti
            FROM tbl_gold_stykke_hierarchy
            WHERE {where_clause}
            ORDER BY arkiv_navn, arkiv_identifikator, asta_sti
            OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
        """

        cursor.execute(data_query, tuple(params + [offset, page_size]))
        rows = cursor.fetchall()

        return {
            "items": rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }

    except Exception as e:
        return {"error": str(e)}

    finally:
        if conn:
            conn.close()