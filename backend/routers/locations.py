from fastapi import APIRouter, Query
import pymssql
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# Utility: Get DB connection
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
# GET /api/items
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
            FROM consolidated_stykke_hierarchy
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
            FROM consolidated_stykke_hierarchy
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
# GET /api/sah-items
# -----------------------------
@router.get("/sah-items")
@router.get("/sah-items")
def get_sah_items(arkiv_navn: str | None = Query(default=None)):
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        if arkiv_navn and arkiv_navn.strip():
            query = """
                SELECT
                    arkiv_identifikator,
                    arkiv_navn,
                    asta_sti
                FROM consolidated_stykke_hierarchy
                WHERE (
                    hylleplassering LIKE 'SAH%'
                    OR asta_sti LIKE 'SAH%'
                )
                AND arkiv_navn = %s
                ORDER BY arkiv_navn, arkiv_identifikator, asta_sti
            """
            cursor.execute(query, (arkiv_navn.strip(),))
        else:
            query = """
                SELECT
                    arkiv_identifikator,
                    arkiv_navn,
                    asta_sti
                FROM consolidated_stykke_hierarchy
                WHERE (
                    hylleplassering LIKE 'SAH%'
                    OR asta_sti LIKE 'SAH%'
                )
                ORDER BY arkiv_navn, arkiv_identifikator, asta_sti
            """
            cursor.execute(query)

        rows = cursor.fetchall()
        conn.close()
        return rows

    except Exception as e:
        return {"error": str(e)}