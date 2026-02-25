from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/account/change-password")
def change_password(payload: ChangePasswordRequest, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        # assumes you already have this proc:
        # dbo.usp_auth_change_password(@UserId, @OldPassword, @NewPassword)
        cur.execute(
            "EXEC dbo.usp_auth_change_password %s, %s, %s",
            (me.user_id, payload.old_password, payload.new_password),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()