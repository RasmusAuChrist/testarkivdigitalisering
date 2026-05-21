# routers/order_degree.py

from fastapi import APIRouter, HTTPException, Query
import os
import pymssql

router = APIRouter()

ARKIV_TABLE = "dbo.tbl_silver_dim_asta_arkiv"
ORDNINGSGRAD_TABLE = "dbo.tbl_silver_dim_ordningsgrad"
KATALOGISERING_TABLE = "dbo.tbl_silver_dim_katalogisering"
FYSISK_TILSTAND_TABLE = "dbo.tbl_silver_dim_fysisktilstand"
DIGITIZATION_TABLE = "dbo.gold_digitization_views_per_arkiv"


def get_connection():
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
        autocommit=True,
    )


def to_int(value):
    return int(value or 0)


def attention_needed(row):
    ord_code = row.get("ordningsgrad_code")
    kat_code = row.get("katalogisering_code")
    fys_code = str(row.get("fysisktilstand_code") or "")
    stykke_count = to_int(row.get("stykke_count"))

    return (
        ord_code in ("D", "E", "F")
        or kat_code in ("D", "E")
        or fys_code in ("3", "4")
        or stykke_count == 0
    )


@router.get("/order-degree/archives")
def get_order_degree_archives(
    lokasjon = "SAB"
):
    conn = None

    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = f"""
            SELECT
                a.arkiv_sk,
                a._amid,
                a.navn,
                a.identifikator,
                a.lokasjon,
                a.startaar,
                a.sluttar,

                a.ordningsgrad AS ordningsgrad_code,
                og.value AS ordningsgrad_value,

                a.katalogisering AS katalogisering_code,
                k.value AS katalogisering_value,

                a.fysisktilstand AS fysisktilstand_code,
                ft.value AS fysisktilstand_value,

                COALESCE(g.stykke_count, 0) AS stykke_count,
                g.tags,
                g.serier,
                g.last_refreshed_utc

            FROM {ARKIV_TABLE} a

            LEFT JOIN {ORDNINGSGRAD_TABLE} og
                ON a.ordningsgrad = og.code

            LEFT JOIN {KATALOGISERING_TABLE} k
                ON a.katalogisering = k.code

            LEFT JOIN {FYSISK_TILSTAND_TABLE} ft
                ON CONVERT(varchar(20), a.fysisktilstand) = CONVERT(varchar(20), ft.code)

            LEFT JOIN {DIGITIZATION_TABLE} g
                ON a.arkiv_sk = g.arkiv_sk

            WHERE a.lokasjon = %s

            ORDER BY
                CASE
                    WHEN a.ordningsgrad IN ('E', 'F') THEN 1
                    WHEN a.ordningsgrad = 'D' THEN 2
                    WHEN a.katalogisering IN ('D', 'E') THEN 3
                    WHEN COALESCE(g.stykke_count, 0) = 0 THEN 4
                    ELSE 5
                END,
                a.navn ASC;
        """

        cursor.execute(query, (lokasjon,))
        rows = cursor.fetchall() or []

        for row in rows:
            row["attention_needed"] = attention_needed(row)

        return {
            "lokasjon": lokasjon,
            "total": len(rows),
            "items": rows,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        if conn:
            conn.close()


@router.get("/order-degree/summary")
def get_order_degree_summary():
    lokasjon = "SAB"

    conn = None

    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        query = f"""
            SELECT
                a.arkiv_sk,

                a.ordningsgrad AS ordningsgrad_code,
                og.value AS ordningsgrad_value,

                a.katalogisering AS katalogisering_code,
                k.value AS katalogisering_value,

                a.fysisktilstand AS fysisktilstand_code,
                ft.value AS fysisktilstand_value,

                COALESCE(g.stykke_count, 0) AS stykke_count

            FROM {ARKIV_TABLE} a

            LEFT JOIN {ORDNINGSGRAD_TABLE} og
                ON a.ordningsgrad = og.code

            LEFT JOIN {KATALOGISERING_TABLE} k
                ON a.katalogisering = k.code

            LEFT JOIN {FYSISK_TILSTAND_TABLE} ft
                ON CONVERT(varchar(20), a.fysisktilstand) = CONVERT(varchar(20), ft.code)

            LEFT JOIN {DIGITIZATION_TABLE} g
                ON a.arkiv_sk = g.arkiv_sk

            WHERE a.lokasjon = %s;
        """

        cursor.execute(query, (lokasjon,))
        rows = cursor.fetchall() or []

        by_ordningsgrad = {}
        by_katalogisering = {}
        by_fysisktilstand = {}
        stykke_by_ordningsgrad = {}

        attention_count = 0
        total_stykke = 0

        for row in rows:
            stykke_count = to_int(row.get("stykke_count"))
            total_stykke += stykke_count

            if attention_needed(row):
                attention_count += 1

            ord_key = row.get("ordningsgrad_value") or row.get("ordningsgrad_code") or "Ukjent"
            kat_key = row.get("katalogisering_value") or row.get("katalogisering_code") or "Ukjent"
            fys_key = row.get("fysisktilstand_value") or row.get("fysisktilstand_code") or "Ukjent"

            by_ordningsgrad[ord_key] = by_ordningsgrad.get(ord_key, 0) + 1
            by_katalogisering[kat_key] = by_katalogisering.get(kat_key, 0) + 1
            by_fysisktilstand[fys_key] = by_fysisktilstand.get(fys_key, 0) + 1
            stykke_by_ordningsgrad[ord_key] = (
                stykke_by_ordningsgrad.get(ord_key, 0) + stykke_count
            )

        total_archives = len(rows)

        return {
            "lokasjon": lokasjon,
            "archives_total": total_archives,
            "stykke_total": total_stykke,
            "attention_needed_count": attention_count,
            "by_ordningsgrad": by_ordningsgrad,
            "by_katalogisering": by_katalogisering,
            "by_fysisktilstand": by_fysisktilstand,
            "stykke_by_ordningsgrad": stykke_by_ordningsgrad,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        if conn:
            conn.close()

@router.get("/order-degree/code-values")
def get_order_degree_code_values():
    conn = None

    try:
        conn = get_connection()
        cursor = conn.cursor(as_dict=True)

        def fetch_codes(table_name):
            cursor.execute(f"SELECT code, value FROM {table_name} ORDER BY code;")
            return cursor.fetchall() or []

        return {
            "ordningsgrad": fetch_codes(ORDNINGSGRAD_TABLE),
            "katalogisering": fetch_codes(KATALOGISERING_TABLE),
            "fysisktilstand": fetch_codes(FYSISK_TILSTAND_TABLE),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        if conn:
            conn.close()