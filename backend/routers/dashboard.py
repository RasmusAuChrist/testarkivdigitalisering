from fastapi import APIRouter
import pymssql
import os

router = APIRouter()

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE")
    )

@router.get("/status-distribution")
def get_status_distribution():
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
        SELECT 
        ISNULL(ValgtStatusSerie, 'Udefinert') AS status,
        SUM(CAST(stykker AS INT)) AS total_stykker,
        COUNT(DISTINCT Ordre) AS ordre_count
        FROM sysTblOrdreSerierKommentar
        GROUP BY ValgtStatusSerie

        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        return rows

    except Exception as e:
        return {"error": str(e)}
