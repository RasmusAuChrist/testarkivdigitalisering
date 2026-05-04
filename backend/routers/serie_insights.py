from fastapi import APIRouter, Query
import pymssql
import os

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


@router.get("/serie-insights/summary")
def get_serie_insights_summary():
    try:
        query = """
        SELECT TOP 1
            series_total,
            total_adjusted_views,
            total_requisitions,
            undigitized_series,
            low_digitized_series,
            low_digitized_with_physical_demand,
            low_digitized_with_digital_signal
        FROM dbo.gold_infoscreen_serie_summary;
        """
        rows = fetch_all(query)
        return rows[0] if rows else {}
    except Exception as e:
        return {"error": str(e)}


@router.get("/serie-insights/candidates/balanced")
def get_candidates_balanced(limit: int = Query(50, ge=1, le=250)):
    try:
        query = f"""
        SELECT TOP ({limit})
            ROW_NUMBER() OVER (ORDER BY priority_balanced DESC) AS rank_no,
            serie_gsk,
            serie_level,
            navn,
            identifikator,
            serie_category,
            startaar,
            sluttar,
            mid_year,
            percentage_digitized,
            total_adjusted_views,
            total_requisitions,
            digital_intensity,
            priority_physical,
            priority_digital,
            priority_balanced
        FROM dbo.gold_infoscreen_serie_candidates_post1950
        ORDER BY priority_balanced DESC;
        """
        return fetch_all(query)
    except Exception as e:
        return {"error": str(e)}


@router.get("/serie-insights/candidates/physical")
def get_candidates_physical(limit: int = Query(50, ge=1, le=250)):
    try:
        query = f"""
        SELECT TOP ({limit})
            ROW_NUMBER() OVER (ORDER BY priority_physical DESC) AS rank_no,
            serie_gsk,
            serie_level,
            navn,
            identifikator,
            serie_category,
            startaar,
            sluttar,
            mid_year,
            percentage_digitized,
            total_adjusted_views,
            total_requisitions,
            digital_intensity,
            priority_physical,
            priority_digital,
            priority_balanced
        FROM dbo.gold_infoscreen_serie_candidates_post1950
        ORDER BY priority_physical DESC;
        """
        return fetch_all(query)
    except Exception as e:
        return {"error": str(e)}


@router.get("/serie-insights/candidates/digital")
def get_candidates_digital(limit: int = Query(50, ge=1, le=250)):
    try:
        query = f"""
        SELECT TOP ({limit})
            ROW_NUMBER() OVER (ORDER BY priority_digital DESC) AS rank_no,
            serie_gsk,
            serie_level,
            navn,
            identifikator,
            serie_category,
            startaar,
            sluttar,
            mid_year,
            percentage_digitized,
            total_adjusted_views,
            total_requisitions,
            digital_intensity,
            priority_physical,
            priority_digital,
            priority_balanced
        FROM dbo.gold_infoscreen_serie_candidates_post1950
        ORDER BY priority_digital DESC;
        """
        return fetch_all(query)
    except Exception as e:
        return {"error": str(e)}


@router.get("/serie-insights/candidates/category-summary")
def get_candidate_category_summary():
    try:
        query = """
        SELECT
            serie_category,
            COUNT(*) AS candidates,
            SUM(total_requisitions) AS total_requisitions,
            SUM(total_adjusted_views) AS total_adjusted_views,
            AVG(priority_balanced) AS avg_priority
        FROM dbo.gold_infoscreen_serie_candidates_post1950
        GROUP BY serie_category
        ORDER BY candidates DESC;
        """
        return fetch_all(query)
    except Exception as e:
        return {"error": str(e)}


@router.get("/serie-insights/time-comparison")
def get_serie_time_comparison():
    try:
        query = """
        SELECT
            time_bin,
            sort_order,
            series,
            total_views,
            total_requisitions,
            digitized_equivalents,
            views_per_digitized_equivalent,
            requisitions_per_series
        FROM dbo.gold_infoscreen_serie_time_comparison
        ORDER BY sort_order;
        """
        return fetch_all(query)
    except Exception as e:
        return {"error": str(e)}