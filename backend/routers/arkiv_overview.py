from fastapi import APIRouter
import pymssql
import os
from datetime import date

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
            arkiv_sk,
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


@router.get("/arkiv-requisitions-current-year")
def get_arkiv_requisitions_current_year():
    """
    Returns current-year requisition totals per arkiv for the infoscreen ticker.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        year = date.today().year
        start_key = year * 10000 + 101
        next_year_key = (year + 1) * 10000 + 101

        query = """
        SELECT
            r.arkiv_sk,
            MAX(o.navn) AS navn,
            MAX(o.identifikator) AS identifikator,
            SUM(COALESCE(r.requisitions_int, 0)) AS requisitions_internal,
            SUM(COALESCE(r.requisitions_ap, 0)) AS requisitions_ap,
            SUM(COALESCE(r.requisitions_int, 0) + COALESCE(r.requisitions_ap, 0)) AS total_requisitions
        FROM dbo.gold_fact_requisitions_monthly r
        LEFT JOIN dbo.gold_digitization_views_per_arkiv o
            ON o.arkiv_sk = r.arkiv_sk
        WHERE r.month_key >= %s
          AND r.month_key < %s
        GROUP BY r.arkiv_sk
        HAVING SUM(COALESCE(r.requisitions_int, 0) + COALESCE(r.requisitions_ap, 0)) > 0
        ORDER BY total_requisitions DESC;
        """

        cursor.execute(query, (start_key, next_year_key))
        rows = cursor.fetchall()

        conn.close()
        return rows

    except Exception as e:
        return {"error": str(e)}
