from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any, Dict
import json
import base64
from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

# -----------------------------
# Models
# -----------------------------
class CreateOrderRequest(BaseModel):
    external_amid: str  # GUID string
    batch_no: Optional[int] = None
    title: Optional[str] = None
    priority: int = 3


class HoldOrderRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=400)


class CloseOrderRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=400)


StepStatus = Literal["Pending", "Active", "Blocked", "Completed"]


class SetStepStatusRequest(BaseModel):
    status: StepStatus
    reason_code: Optional[str] = Field(default=None, max_length=50)
    comment: Optional[str] = Field(default=None, max_length=400)


class CompleteStepRequest(BaseModel):
    disposition: str = Field(min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=400)


class UnclaimStepRequest(BaseModel):
    comment: Optional[str] = Field(default=None, max_length=400)

class SaveStepFormDataRequest(BaseModel):
    data: Dict[str, Any]
    expected_row_ver: Optional[str] = None  # optional, if you support optimistic concurrency


# -----------------------------
# Create order
# -----------------------------
@router.post("/wf/orders")
def create_order(payload: CreateOrderRequest, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_create_order %s, %s, %s, %s, %s",
            (me.user_id, payload.external_amid, payload.batch_no, payload.title, payload.priority),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# -----------------------------
# Read order by amid (3 result sets)
# -----------------------------
@router.get("/wf/orders/by-amid/{amid}")
def get_order_by_amid(amid: str, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_order_by_amid %s", (amid,))

        header = cur.fetchone()
        if not header:
            raise HTTPException(status_code=404, detail="Fant ikke ordre")

        steps = []
        events = []
        if cur.nextset():
            steps = cur.fetchall() or []
        if cur.nextset():
            events = cur.fetchall() or []

        return {"header": header, "steps": steps, "events": events}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# -----------------------------
# Queue for a step
# -----------------------------
@router.get("/wf/steps/{step_def_id}/queue")
def get_step_queue(step_def_id: int, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_queue %s", (step_def_id,))
        rows = cur.fetchall() or []
        return {"step_def_id": step_def_id, "items": rows}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# -----------------------------
# Claim step
# -----------------------------
@router.post("/wf/steps/{order_step_id}/claim")
def claim_step(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_claim_step %s, %s", (me.user_id, order_step_id))
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# ============================================================
# NEW: Order-level mutations
# ============================================================

@router.post("/wf/orders/{order_id}/hold")
def hold_order(order_id: int, payload: HoldOrderRequest, me: MeResponse = Depends(get_current_user)):
    """
    Put whole order on hold (pa vent). Should also prevent step work until released.
    Expected SP: dbo.usp_wf_hold_order(@UserId, @OrderId, @Reason)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_hold_order %s, %s, %s", (me.user_id, order_id, payload.reason))
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post("/wf/orders/{order_id}/unhold")
def unhold_order(order_id: int, me: MeResponse = Depends(get_current_user)):
    """
    Release hold.
    Expected SP: dbo.usp_wf_unhold_order(@UserId, @OrderId)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_unhold_order %s, %s", (me.user_id, order_id))
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post("/wf/orders/{order_id}/close")
def close_order(order_id: int, payload: CloseOrderRequest, me: MeResponse = Depends(get_current_user)):
    """
    Stop/close order early.
    Expected SP: dbo.usp_wf_close_order(@UserId, @OrderId, @Reason)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_close_order %s, %s, %s", (me.user_id, order_id, payload.reason))
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


# ============================================================
# NEW: Step-level mutations
# ============================================================

@router.post("/wf/steps/{order_step_id}/set-status")
def set_step_status(order_step_id: int, payload: SetStepStatusRequest, me: MeResponse = Depends(get_current_user)):
    """
    Generic status setter with audit.
    Expected SP: dbo.usp_wf_set_step_status(@UserId, @OrderStepId, @Status, @ReasonCode, @Comment)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_set_step_status %s, %s, %s, %s, %s",
            (me.user_id, order_step_id, payload.status, payload.reason_code, payload.comment),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post("/wf/steps/{order_step_id}/complete")
def complete_step(order_step_id: int, payload: CompleteStepRequest, me: MeResponse = Depends(get_current_user)):
    """
    Complete a step with disposition + notes.
    Expected SP: dbo.usp_wf_complete_step(@UserId, @OrderStepId, @Disposition, @Notes)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_complete_step %s, %s, %s, %s",
            (me.user_id, order_step_id, payload.disposition, payload.notes),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post("/wf/steps/{order_step_id}/unclaim")
def unclaim_step(order_step_id: int, payload: UnclaimStepRequest, me: MeResponse = Depends(get_current_user)):
    """
    Release assignment on a step (put it back in queue).
    Expected SP: dbo.usp_wf_unclaim_step(@UserId, @OrderStepId, @Comment)
    """
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_unclaim_step %s, %s, %s",
            (me.user_id, order_step_id, payload.comment),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.get("/wf/steps/def/{step_def_id}/form-schema")
def get_step_form_schema(step_def_id: int, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_form_schema %s", (step_def_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fant ikke skjema for steg")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.get("/wf/steps/{order_step_id}/form-data")
def get_step_form_data(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_form_data %s", (order_step_id,))
        row = cur.fetchone()
        # Return empty response instead of 404 if you prefer
        return row or {"OrderStepId": order_step_id, "DataJson": None}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.get("/wf/orders/{order_id}/step-form-data")
def get_order_step_form_data(order_id: int, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_order_step_form_data %s", (order_id,))
        rows = cur.fetchall() or []
        return {"order_id": order_id, "items": rows}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

def _rowver_from_client(v: Optional[str]) -> Optional[bytes]:
    """
    Accept either hex ("0xAABB...") or base64 and return VARBINARY(8) bytes.
    If you don't use concurrency yet, you can remove all of this.
    """
    if not v:
        return None
    s = v.strip()
    if s.lower().startswith("0x"):
        return bytes.fromhex(s[2:])
    # base64
    return base64.b64decode(s)

@router.post("/wf/steps/{order_step_id}/form-data")
def save_step_form_data(order_step_id: int, payload: SaveStepFormDataRequest, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        data_json = json.dumps(payload.data, ensure_ascii=False)
        expected_rowver = _rowver_from_client(payload.expected_row_ver)

        cur.execute(
            "EXEC dbo.usp_wf_upsert_step_form_data %s, %s, %s, %s",
            (me.user_id, order_step_id, data_json, expected_rowver),
        )

        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()