from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pymssql
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://brave-mud-0dbaa4d03.2.azurestaticapps.net"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# GET /api/rooms
# -----------------------------
@app.get("/api/rooms")
def get_available_rooms(depot: str = "OSL1"):
    try:
        conn = pymssql.connect(
            server=os.getenv("AZURE_SERVER"),
            user=os.getenv("AZURE_USERNAME"),
            password=os.getenv("AZURE_PASSWORD"),
            database=os.getenv("AZURE_DATABASE")
        )
        cursor = conn.cursor()

        query = f"""
        SELECT DISTINCT
            SUBSTRING(path, CHARINDEX('/', path) + 1, CHARINDEX('/', path, CHARINDEX('/', path) + 1) - CHARINDEX('/', path) - 1) AS room
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
@app.get("/api/shelves")
def get_shelves(depot: str = "OSL1", room: str = "1A"):
    try:
        conn = pymssql.connect(
            server=os.getenv("AZURE_SERVER"),
            user=os.getenv("AZURE_USERNAME"),
            password=os.getenv("AZURE_PASSWORD"),
            database=os.getenv("AZURE_DATABASE")
        )
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
@app.get("/api/items")
def get_items(depot: str = "OSL1", room: str = "1A"):
    try:
        conn = pymssql.connect(
            server=os.getenv("AZURE_SERVER"),
            user=os.getenv("AZURE_USERNAME"),
            password=os.getenv("AZURE_PASSWORD"),
            database=os.getenv("AZURE_DATABASE")
        )
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
