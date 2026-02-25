from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

def require_admin(me: MeResponse):
    if not me.roles or "Admin" not in me.roles:
        raise HTTPException(status_code=403, detail="Ikke tilgang (Admin kreves).")

class AdminCreateUserRequest(BaseModel):
    username: str
    temp_password_hash: str  # bcrypt hash string
    must_change_password: bool = True

class AdminResetPasswordRequest(BaseModel):
    user_id: int
    temp_password_hash: str
    must_change_password: bool = True

class AdminSetRoleRequest(BaseModel):
    user_id: int
    role_name: str  # e.g. "Admin" or "Operator"

@router.post("/admin/users")
def admin_create_user(payload: AdminCreateUserRequest, me: MeResponse = Depends(get_current_user)):
    require_admin(me)
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        # assumes your proc signature matches these params
        cur.execute(
            "EXEC dbo.usp_admin_create_user %s, %s, %s, %s",
            (me.user_id, payload.username, payload.temp_password_hash, int(payload.must_change_password)),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.post("/admin/users/reset-password")
def admin_reset_password(payload: AdminResetPasswordRequest, me: MeResponse = Depends(get_current_user)):
    require_admin(me)
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_admin_reset_password %s, %s, %s, %s",
            (me.user_id, payload.user_id, payload.temp_password_hash, int(payload.must_change_password)),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.post("/admin/users/set-role")
def admin_set_role(payload: AdminSetRoleRequest, me: MeResponse = Depends(get_current_user)):
    require_admin(me)
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_admin_set_user_role %s, %s, %s",
            (me.user_id, payload.user_id, payload.role_name),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()