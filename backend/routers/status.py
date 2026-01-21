from fastapi import APIRouter
import pymssql
import os
from datetime import datetime

router = APIRouter()

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE")
    )

@router.get("/status")
def get_status():
    """
    Returns list of {TableName, LastLoaded} from tbl_ref_LookupTable
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
        SELECT TableName, LastLoaded
        FROM tbl_ref_LookupTable
        ORDER BY TableName;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        # Convert datetime to ISO
        for row in rows:
            if isinstance(row["LastLoaded"], datetime):
                row["LastLoaded"] = row["LastLoaded"].isoformat()

        return rows

    except Exception as e:
        return {"error": str(e)}
