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
