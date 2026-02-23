from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

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