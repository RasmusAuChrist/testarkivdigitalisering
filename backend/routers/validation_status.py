from fastapi import APIRouter
import pymssql
import os
import json
from collections import Counter

router = APIRouter()

def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE")
    )

def _parse_missing_items(raw):
    try:
        items = json.loads(raw or "[]")
        return items if isinstance(items, list) else []
    except Exception:
        return []

def _item_id(item):
    if not isinstance(item, dict):
        return ""
    return (
        item.get("identifikator")
        or item.get("stykke_identifikator")
        or item.get("item_id")
        or ""
    )

def _chunked(values, size=400):
    for i in range(0, len(values), size):
        yield values[i:i + size]

def _pct(part, whole):
    return round((part / whole) * 100, 1) if whole else 0

def _is_false(value):
    return value is False or value == 0

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

@router.get("/missing-date-series")
def get_missing_date_series():
    """
    Returns series that contain stykker with missing start-/sluttår, enriched
    with serie metadata and location/archive summaries where the stykke ids can
    be matched against tbl_gold_stykke_hierarchy.
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        cursor.execute("""
            SELECT
                COUNT(1) AS total_series,
                SUM(COALESCE(stykke_count, 0)) AS total_stykker
            FROM dbo.tbl_gold_serie_hierarchy;
        """)
        totals = cursor.fetchone() or {}
        total_series = int(totals.get("total_series") or 0)
        total_stykker = int(totals.get("total_stykker") or 0)

        cursor.execute("""
            SELECT
                ordre,
                serie_path,
                missing_count,
                missing_items,
                ordre_startdato_ok,
                ordre_sluttdato_ok,
                ordre_hyllemeter_ok
            FROM dbo.tbl_ref_validation_status
            WHERE COALESCE(missing_count, 0) > 0
            ORDER BY ordre, serie_path;
        """)
        validation_rows = cursor.fetchall()

        serie_paths = sorted({
            row.get("serie_path")
            for row in validation_rows
            if row.get("serie_path")
        })
        series_by_path = {}
        for chunk in _chunked(serie_paths):
            placeholders = ", ".join(["%s"] * len(chunk))
            cursor.execute(f"""
                SELECT
                    path,
                    identifikator,
                    navn,
                    stykke_count,
                    hyllemeter,
                    startaar,
                    sluttaar
                FROM dbo.tbl_gold_serie_hierarchy
                WHERE path IN ({placeholders});
            """, tuple(chunk))
            for row in cursor.fetchall():
                series_by_path[row.get("path")] = row

        parsed_by_path = {}
        missing_ids = []
        for row in validation_rows:
            items = _parse_missing_items(row.get("missing_items"))
            parsed_by_path[row.get("serie_path")] = items
            for item in items:
                item_id = _item_id(item)
                if item_id:
                    missing_ids.append(item_id)

        item_details = {}
        for chunk in _chunked(sorted(set(missing_ids))):
            placeholders = ", ".join(["%s"] * len(chunk))
            cursor.execute(f"""
                SELECT
                    stykke_identifikator,
                    arkiv_identifikator,
                    arkiv_navn,
                    lokasjon,
                    hylleplassering,
                    asta_sti
                FROM dbo.tbl_gold_stykke_hierarchy
                WHERE stykke_identifikator IN ({placeholders});
            """, tuple(chunk))
            for row in cursor.fetchall():
                item_details[row.get("stykke_identifikator")] = row

        location_counts = Counter()
        archive_counts = Counter()
        known_location_count = 0
        rows = []

        for row in validation_rows:
            serie_path = row.get("serie_path") or ""
            serie_meta = series_by_path.get(serie_path) or {}
            raw_items = parsed_by_path.get(serie_path) or []
            missing_count = int(row.get("missing_count") or len(raw_items) or 0)
            item_ids = [_item_id(item) for item in raw_items if _item_id(item)]
            details = [item_details[item_id] for item_id in item_ids if item_id in item_details]

            series_location_counts = Counter()
            series_archive_counts = Counter()
            samples = []

            for detail in details:
                location = detail.get("lokasjon") or "Ukjent"
                archive = detail.get("arkiv_identifikator") or "Ukjent"
                series_location_counts[location] += 1
                series_archive_counts[archive] += 1
                location_counts[location] += 1
                archive_counts[archive] += 1
                if detail.get("lokasjon"):
                    known_location_count += 1
                if len(samples) < 5:
                    samples.append({
                        "identifikator": detail.get("stykke_identifikator"),
                        "lokasjon": detail.get("lokasjon"),
                        "hylleplassering": detail.get("hylleplassering"),
                        "arkiv_identifikator": detail.get("arkiv_identifikator"),
                        "asta_sti": detail.get("asta_sti"),
                    })

            issue_types = []
            if _is_false(row.get("ordre_startdato_ok")):
                issue_types.append("Startår mangler på serienivå")
            if _is_false(row.get("ordre_sluttdato_ok")):
                issue_types.append("Sluttår mangler på serienivå")
            if _is_false(row.get("ordre_hyllemeter_ok")):
                issue_types.append("Hyllemeter mangler på serienivå")
            issue_types.append(f"{missing_count} stykker mangler start-/sluttår")

            rows.append({
                "ordre": row.get("ordre"),
                "serie_path": serie_path,
                "serie_identifikator": serie_meta.get("identifikator"),
                "serie_navn": serie_meta.get("navn"),
                "stykke_count": int(serie_meta.get("stykke_count") or 0),
                "hyllemeter": float(serie_meta.get("hyllemeter") or 0),
                "startaar": serie_meta.get("startaar"),
                "sluttaar": serie_meta.get("sluttaar"),
                "missing_count": missing_count,
                "missing_item_ids": item_ids[:25],
                "matched_item_count": len(details),
                "location_counts": [
                    {"name": name, "count": count}
                    for name, count in series_location_counts.most_common()
                ],
                "archive_counts": [
                    {"name": name, "count": count}
                    for name, count in series_archive_counts.most_common(5)
                ],
                "sample_items": samples,
                "issue_types": issue_types,
            })

        missing_total = sum(row["missing_count"] for row in rows)
        summary = {
            "series_with_missing": len(rows),
            "total_series": total_series,
            "affected_series_percent": _pct(len(rows), total_series),
            "missing_items": missing_total,
            "total_stykker": total_stykker,
            "missing_items_percent": _pct(missing_total, total_stykker),
            "items_with_known_location": known_location_count,
            "items_with_known_location_percent": _pct(known_location_count, missing_total),
            "locations": [
                {"name": name, "count": count, "percent": _pct(count, missing_total)}
                for name, count in location_counts.most_common(12)
            ],
            "archives": [
                {"name": name, "count": count, "percent": _pct(count, missing_total)}
                for name, count in archive_counts.most_common(12)
            ],
        }

        return {"summary": summary, "items": rows}

    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

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
