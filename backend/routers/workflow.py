from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse  # adjust import to your project

router = APIRouter()

class CreateOrderRequest(BaseModel):
    external_amid: str  # GUID string
    batch_no: Optional[int] = None
    title: Optional[str] = None
    priority: int = 3

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