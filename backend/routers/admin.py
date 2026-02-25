from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse
from backend.security import hash_password  # <-- NEW: hash plaintext password server-side

router = APIRouter()


def require_admin(me: MeResponse):
    if not me.roles or "Admin" not in me.roles:
        raise HTTPException(status_code=403, detail="Ikke tilgang (Admin kreves).")


class AdminCreateUserRequest(BaseModel):
    username: str
    display_name: Optional[str] = None
    temp_password: str  # <-- CHANGED: plaintext temp password
    must_change_password: bool = True
    role_name: Optional[str] = None  # e.g. "Operator" or "Admin"


class AdminResetPasswordRequest(BaseModel):
    user_id: int
    temp_password: str  # <-- CHANGED: plaintext temp password
    must_change_password: bool = True


class AdminSetRoleRequest(BaseModel):
    user_id: int
    role_name: str
    is_enabled: bool = True


@router.get("/admin/roles")
def admin_list_roles(me: MeResponse = Depends(get_current_user)):
    require_admin(me)
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_admin_list_roles @ActorUserId=%s",
            (me.user_id,),
        )
        return {"roles": cur.fetchall() or []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post("/admin/users")
def admin_create_user(payload: AdminCreateUserRequest, me: MeResponse = Depends(get_current_user)):
    require_admin(me)
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        # Hash plaintext temp password in API
        password_hash = hash_password(payload.temp_password)

        # Correct param mapping (includes DisplayName)
        cur.execute(
            """
            EXEC dbo.usp_admin_create_user
                 @ActorUserId=%s,
                 @Username=%s,
                 @DisplayName=%s,
                 @PasswordHash=%s,
                 @MustChangePassword=%s
            """,
            (
                me.user_id,
                payload.username,
                payload.display_name,
                password_hash,
                int(payload.must_change_password),
            ),
        )

        row = cur.fetchone() or {"ok": True}

        # Optional: set role at creation (IMPORTANT: pass IsEnabled)
        if payload.role_name:
            new_user_id = row.get("UserId") or row.get("user_id")
            if not new_user_id:
                raise HTTPException(status_code=400, detail="Create user did not return UserId")

            cur.execute(
                """
                EXEC dbo.usp_admin_set_user_role
                     @ActorUserId=%s,
                     @UserId=%s,
                     @RoleName=%s,
                     @IsEnabled=%s
                """,
                (me.user_id, int(new_user_id), payload.role_name, 1),
            )

        conn.commit()
        return row
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

        # Hash plaintext temp password in API
        password_hash = hash_password(payload.temp_password)

        cur.execute(
            """
            EXEC dbo.usp_admin_reset_password
                 @ActorUserId=%s,
                 @UserId=%s,
                 @PasswordHash=%s,
                 @MustChangePassword=%s
            """,
            (me.user_id, payload.user_id, password_hash, int(payload.must_change_password)),
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
            """
            EXEC dbo.usp_admin_set_user_role
                 @ActorUserId=%s,
                 @UserId=%s,
                 @RoleName=%s,
                 @IsEnabled=%s
            """,
            (me.user_id, payload.user_id, payload.role_name, int(payload.is_enabled)),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()