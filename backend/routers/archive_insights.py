from fastapi import APIRouter, Query
import os
import pymssql

router = APIRouter()


def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
    )


def fetch_all(query: str):
    conn = get_connection()
    try:
        cursor = conn.cursor(as_dict=True)
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        conn.close()


@router.get("/archive-insights/summary")
def get_archive_insights_summary():
    query = """
    SELECT
        COUNT(*) AS archives,
        SUM(total_raw_views) AS total_raw_views,
        SUM(total_adjusted_views) AS total_adjusted_views,
        SUM(total_requisitions) AS total_requisitions,
        AVG(percentage_digitized) AS avg_digitized,
        SUM(CASE WHEN total_adjusted_views > 0 THEN 1 ELSE 0 END) AS archives_with_views
    FROM dbo.v_infoscreen_archive_usage;
    """
    rows = fetch_all(query)
    return rows[0] if rows else {}


@router.get("/archive-insights/top")
def get_archive_top(limit: int = Query(25, ge=1, le=100)):
    query = f"""
    SELECT TOP ({limit})
        arkiv_sk,
        navn,
        identifikator,
        percentage_digitized,
        total_adjusted_views,
        total_requisitions
    FROM dbo.v_infoscreen_archive_top
    ORDER BY total_adjusted_views DESC;
    """
    return fetch_all(query)


@router.get("/archive-insights/monthly-trend")
def get_archive_monthly_trend():
    query = """
    SELECT
        month_key,
        raw_views,
        capped_views,
        adjusted_views,
        requisitions
    FROM dbo.v_infoscreen_archive_monthly_trend
    ORDER BY month_key;
    """
    return fetch_all(query)


@router.get("/archive-insights/concentration")
def get_archive_concentration():
    query = """
    SELECT
        arkiv_sk,
        total_adjusted_views,
        archive_share,
        cumulative_view_share
    FROM dbo.v_infoscreen_archive_concentration
    ORDER BY archive_share;
    """
    return fetch_all(query)


@router.get("/archive-insights/digitization-scatter")
def get_archive_digitization_scatter(limit: int = Query(5000, ge=100, le=20000)):
    query = f"""
    SELECT TOP ({limit})
        arkiv_sk,
        navn,
        identifikator,
        percentage_digitized,
        total_adjusted_views,
        total_requisitions
    FROM dbo.v_infoscreen_archive_usage
    WHERE total_adjusted_views > 0
    ORDER BY total_adjusted_views DESC;
    """
    return fetch_all(query)


@router.get("/archive-insights/digitization-groups")
def get_archive_digitization_groups():
    query = """
    SELECT
        CASE
            WHEN percentage_digitized = 0 THEN '0%'
            WHEN percentage_digitized <= 0.25 THEN '1-25%'
            WHEN percentage_digitized <= 0.75 THEN '26-75%'
            ELSE '76-100%'
        END AS digitization_group,
        COUNT(*) AS archives,
        SUM(total_adjusted_views) AS adjusted_views,
        AVG(total_adjusted_views) AS avg_adjusted_views,
        SUM(total_requisitions) AS requisitions
    FROM dbo.v_infoscreen_archive_usage
    GROUP BY
        CASE
            WHEN percentage_digitized = 0 THEN '0%'
            WHEN percentage_digitized <= 0.25 THEN '1-25%'
            WHEN percentage_digitized <= 0.75 THEN '26-75%'
            ELSE '76-100%'
        END
    ORDER BY
        CASE
            WHEN
                CASE
                    WHEN percentage_digitized = 0 THEN '0%'
                    WHEN percentage_digitized <= 0.25 THEN '1-25%'
                    WHEN percentage_digitized <= 0.75 THEN '26-75%'
                    ELSE '76-100%'
                END = '0%' THEN 1
            WHEN
                CASE
                    WHEN percentage_digitized = 0 THEN '0%'
                    WHEN percentage_digitized <= 0.25 THEN '1-25%'
                    WHEN percentage_digitized <= 0.75 THEN '26-75%'
                    ELSE '76-100%'
                END = '1-25%' THEN 2
            WHEN
                CASE
                    WHEN percentage_digitized = 0 THEN '0%'
                    WHEN percentage_digitized <= 0.25 THEN '1-25%'
                    WHEN percentage_digitized <= 0.75 THEN '26-75%'
                    ELSE '76-100%'
                END = '26-75%' THEN 3
            ELSE 4
        END;
    """
    return fetch_all(query)