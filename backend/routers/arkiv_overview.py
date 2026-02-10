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

@router.get("/arkiv-overview")
def get_arkiv_overview():
    """
    Returns overview data for each arkiv from gold_digitization_views_per_arkiv
    Excludes arkiv_sk and last_refreshed_utc
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = """
        SELECT
            navn,
            lokasjon,
            identifikator,
            percentage_digitized,
            stykke_count,
            views_internal,
            views_media,
            views_digark,
            topdesk_references,
            average_views_media,
            average_views_digark,
            requisitions_internal,
            requisitions_ap,
            tags,
            serier
        FROM gold_digitization_views_per_arkiv;
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        conn.close()
        return rows

    except Exception as e:
        return {"error": str(e)}
