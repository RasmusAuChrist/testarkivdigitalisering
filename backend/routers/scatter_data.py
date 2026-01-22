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

@router.get("/scatter-data")
def get_scatter_data():
    """
    Returns data for scatterplot from gold_digitization_views_per_arkiv
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
        SELECT 
            navn, 
            identifikator, 
            lokasjon, 
            percentage_digitized, 
            average_views_media
        FROM gold_digitization_views_per_arkiv
        WHERE percentage_digitized IS NOT NULL
          AND average_views_media IS NOT NULL;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        return rows

    except Exception as e:
        return {"error": str(e)}
