from fastapi import APIRouter
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
        query = f"""
            SELECT DISTINCT
                SUBSTRING(path, CHARINDEX('/', path) + 1,
                          CHARINDEX('/', path, CHARINDEX('/', path) + 1)
                          - CHARINDEX('/', path) - 1) AS room
            FROM tbl_bronze_asta_shelf
            WHERE path LIKE '{depot}/%/%/%/%'
        """
        cursor.execute(query)
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
        query = f"""
            SELECT name, path, total_space
            FROM tbl_bronze_asta_shelf
            WHERE path LIKE '{depot}/{room}/%'
        """
        cursor.execute(query)
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
        query = f"""
            SELECT
                stykke_identifikator AS item_id,
                arkiv_identifikator AS arkiv,
                hylleplassering AS shelf_path,
                asta_sti AS item_path
            FROM consolidated_stykke_hierarchy
            WHERE hylleplassering LIKE '{depot}/{room}/%'
        """
        cursor.execute(query)
        items = cursor.fetchall()
        conn.close()

        for item in items:
            parts = item['shelf_path'].split('/')
            if len(parts) >= 5:
                item['aisle'] = int(parts[2])
                item['bay'] = int(parts[3])
                item['shelf'] = int(parts[4])
            else:
                item['aisle'] = item['bay'] = item['shelf'] = None

        return items
    except Exception as e:
        return {"error": str(e)}
