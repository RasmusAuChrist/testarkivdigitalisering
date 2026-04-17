import base64
import json
from typing import Any, Dict, Optional, List

from backend.repositories import workflow_repository as repo


def rowver_from_client(v: Optional[str]) -> Optional[bytes]:
    if not v:
        return None
    s = v.strip()
    if s.lower().startswith("0x"):
        return bytes.fromhex(s[2:])
    return base64.b64decode(s)


def rowver_to_client(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, (bytes, bytearray)):
        return "0x" + bytes(v).hex().upper()
    return str(v)

def _parse_schema_json(schema_json: Optional[str]) -> Dict[str, Any]:
    if not schema_json:
        return {}

    try:
        parsed = json.loads(schema_json)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def build_step3_payload(
    amid: str,
    serie: Optional[dict],
    sjekkliste: list[dict],
    egenskaper: list[dict],
) -> Dict[str, Any]:
    serie_id = serie.get("MyID") if serie else None

    schema = {
        "source": "external",
        "editor": "step3",
        "readOnly": True,
        "fields": [
            {
                "key": "sjekkliste",
                "label": "Sjekkliste",
                "type": "status_comment_list",
                "items": [],
            },
            {
                "key": "egenskaper",
                "label": "Egenskaper",
                "type": "status_comment_list",
                "items": [],
            },
        ],
    }

    data = {
        "external": {
            "amid": str(amid),
            "serieId": serie_id,
        },
        "sjekkliste": {},
        "egenskaper": {},
    }

    for row in sjekkliste or []:
        item_id = str(row["id"])
        schema["fields"][0]["items"].append(
            {
                "key": item_id,
                "label": row.get("tekst") or f"#{item_id}",
                "level": row.get("nivå"),
                "sort": row.get("Sort", row.get("sort")),
            }
        )
        data["sjekkliste"][item_id] = {
            "status": bool(row.get("checked")),
            "kommentar": row.get("kommentar") or "",
        }

    for row in egenskaper or []:
        item_id = str(row["id"])
        schema["fields"][1]["items"].append(
            {
                "key": item_id,
                "label": row.get("navn") or f"#{item_id}",
                "level": row.get("nivå"),
                "sort": row.get("Sort", row.get("sort")),
            }
        )
        data["egenskaper"][item_id] = {
            "status": bool(row.get("status")),
            "kommentar": row.get("kommentar") or "",
        }

    for field in schema["fields"]:
        field["items"] = sorted(field["items"], key=lambda x: ((x.get("sort") or 0), x["key"]))

    return {
        "schema": schema,
        "data": data,
    }


def create_order(
    actor_user_id: int,
    external_amid: str,
    batch_no: Optional[int],
    title: Optional[str],
    priority: int,
) -> Dict[str, Any]:
    return repo.create_order(actor_user_id, external_amid, batch_no, title, priority) or {"ok": True}


def get_order_by_amid(amid: str) -> Dict[str, Any]:
    return repo.get_order_by_amid(amid)


def get_step_queue(step_def_id: int) -> Dict[str, Any]:
    return {"step_def_id": step_def_id, "items": repo.get_step_queue(step_def_id)}


def claim_step(actor_user_id: int, order_step_id: int) -> Dict[str, Any]:
    return repo.claim_step(actor_user_id, order_step_id) or {"ok": True}


def hold_order(actor_user_id: int, order_id: int, reason: str) -> Dict[str, Any]:
    return repo.hold_order(actor_user_id, order_id, reason) or {"ok": True}


def unhold_order(actor_user_id: int, order_id: int) -> Dict[str, Any]:
    return repo.unhold_order(actor_user_id, order_id) or {"ok": True}


def close_order(actor_user_id: int, order_id: int, reason: str) -> Dict[str, Any]:
    return repo.close_order(actor_user_id, order_id, reason) or {"ok": True}


def set_step_status(
    actor_user_id: int,
    order_step_id: int,
    status: str,
    reason_code: Optional[str],
    comment: Optional[str],
) -> Dict[str, Any]:
    return repo.set_step_status(actor_user_id, order_step_id, status, reason_code, comment) or {"ok": True}


def complete_step(
    actor_user_id: int,
    order_step_id: int,
    disposition: str,
    notes: Optional[str],
) -> Dict[str, Any]:
    return repo.complete_step(actor_user_id, order_step_id, disposition, notes) or {"ok": True}


def unclaim_step(
    actor_user_id: int,
    order_step_id: int,
    comment: Optional[str],
) -> Dict[str, Any]:
    return repo.unclaim_step(actor_user_id, order_step_id, comment) or {"ok": True}


def get_step_form_schema(step_def_id: int) -> Optional[Dict[str, Any]]:
    return repo.get_step_form_schema(step_def_id)


def get_step_form_data(order_step_id: int) -> Dict[str, Any]:
    return repo.get_step_form_data(order_step_id) or {"OrderStepId": order_step_id, "DataJson": None}


def get_order_step_form_data(order_id: int) -> Dict[str, Any]:
    return {"order_id": order_id, "items": repo.get_order_step_form_data(order_id)}


def save_step_form_data(
    actor_user_id: int,
    order_step_id: int,
    payload_data: Dict[str, Any],
    expected_row_ver: Optional[str],
) -> Dict[str, Any]:
    data_json = json.dumps(payload_data, ensure_ascii=False)
    expected_rowver = rowver_from_client(expected_row_ver)
    return repo.save_step_form_data(actor_user_id, order_step_id, data_json, expected_rowver) or {"ok": True}


def get_step_external_data(order_step_id: int) -> Optional[Dict[str, Any]]:
    amid, serie, sjekkliste, egenskaper = repo.get_step_external_data(order_step_id)
    if not amid:
        return None

    return {
        "amid": amid,
        "serie": serie,
        "sjekkliste": sjekkliste,
        "egenskaper": egenskaper,
    }


def get_step3_form(order_step_id: int) -> Optional[Dict[str, Any]]:
    ctx, rowver = repo.get_step3_context(order_step_id)
    if not ctx:
        return None

    amid = ctx.get("ExternalAmid")
    if not amid:
        return None

    _, serie, sjekkliste, egenskaper = repo.get_step_external_data(order_step_id)
    payload = build_step3_payload(amid, serie, sjekkliste, egenskaper)

    return {
        "orderStepId": order_step_id,
        "rowVer": rowver_to_client(rowver),
        "readOnly": True,
        **payload,
    }


def save_step3_form_data(
    actor_user_id: int,
    order_step_id: int,
    payload_data: Dict[str, Any],
    expected_row_ver: Optional[str],
) -> Dict[str, Any]:
    data_json = json.dumps(payload_data, ensure_ascii=False)
    expected_rowver = rowver_from_client(expected_row_ver)
    return repo.save_step3_form_data(actor_user_id, order_step_id, data_json, expected_rowver) or {"ok": True}


def get_send_back_targets(order_step_id: int) -> Dict[str, Any]:
    return {"order_step_id": order_step_id, "items": repo.get_send_back_targets(order_step_id)}


def send_step_back(
    actor_user_id: int,
    order_step_id: int,
    target_step_def_id: int,
    reason: str,
    notes: Optional[str],
) -> Dict[str, Any]:
    return repo.send_step_back(actor_user_id, order_step_id, target_step_def_id, reason, notes) or {"ok": True}


def assign_step_to_user(
    actor_user_id: int,
    order_step_id: int,
    target_user_id: int,
) -> Dict[str, Any]:
    return repo.assign_step_to_user(actor_user_id, order_step_id, target_user_id) or {"ok": True}

def _parse_data_json(data_json: Optional[str]) -> Dict[str, Any]:
    if not data_json:
        return {}

    try:
        parsed = json.loads(data_json)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except Exception:
        return {"_raw": data_json}


def _extract_commentary(data: Dict[str, Any]) -> str:
    return str(data.get("kommentarer") or data.get("commentary") or "")


def build_order_report_data(amid: str) -> Dict[str, Any]:
    order_data = get_order_by_amid(amid)

    header = order_data.get("header")
    if not header:
        return {}

    steps = order_data.get("steps") or []
    step_form_data = order_data.get("step_form_data") or []

    form_data_by_order_step_id = {
        row.get("OrderStepId"): row
        for row in step_form_data
        if row.get("OrderStepId") is not None
    }

    enriched_steps: List[Dict[str, Any]] = []

    for step in steps:
        order_step_id = step.get("OrderStepId")
        step_def_id = step.get("StepDefId")

        raw_form_row = form_data_by_order_step_id.get(order_step_id, {})
        parsed_data = _parse_data_json(raw_form_row.get("DataJson"))

        parsed_schema: Dict[str, Any] = {}

        if step_def_id == 3:
            step3_form = get_step3_form(order_step_id)
            if step3_form:
                parsed_schema = step3_form.get("schema") or {}
                if not parsed_data:
                    parsed_data = step3_form.get("data") or {}
        else:
            schema_row = get_step_form_schema(step_def_id)
            if schema_row:
                parsed_schema = _parse_schema_json(schema_row.get("SchemaJson"))

        enriched_steps.append(
            {
                **step,
                "form_data": parsed_data,
                "form_schema": parsed_schema,
                "commentary": _extract_commentary(parsed_data),
                "form_updated_at_utc": raw_form_row.get("UpdatedAtUtc"),
                "updated_by_user_id": raw_form_row.get("UpdatedByUserId"),
            }
        )

    return {
        "header": header,
        "steps": enriched_steps,
        "events": order_data.get("events") or [],
    }