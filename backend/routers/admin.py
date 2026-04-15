from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse, require_admin_or_coordinator
from backend.security import hash_password

router = APIRouter()


def require_admin(me: MeResponse):
    if not me.roles or "Admin" not in me.roles:
        raise HTTPException(status_code=403, detail="Ikke tilgang (Admin kreves).")


def resolve_user_id(cur, *, username: Optional[str] = None, user_id: Optional[int] = None) -> int:
    if user_id:
        return user_id

    if not username:
        raise HTTPException(status_code=400, detail="Brukernavn eller UserId må oppgis.")

    cur.execute(
        """
        SELECT TOP 1 UserId
        FROM dbo.AppUsers
        WHERE Username = %s
        """,
        (username,),
    )
    row = cur.fetchone()

    if not row or not row.get("UserId"):
        raise HTTPException(status_code=404, detail=f"Fant ikke bruker: {username}")

    return int(row["UserId"])


class AdminCreateUserRequest(BaseModel):
    username: str
    display_name: Optional[str] = None
    temp_password: str
    must_change_password: bool = True
    role_name: Optional[str] = None


class AdminResetPasswordRequest(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    temp_password: str
    must_change_password: bool = True

    @model_validator(mode="after")
    def validate_identifier(self):
        if not self.username and not self.user_id:
            raise ValueError("username eller user_id må oppgis")
        return self


class AdminSetRoleRequest(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    role_name: str
    is_enabled: bool = True

    @model_validator(mode="after")
    def validate_identifier(self):
        if not self.username and not self.user_id:
            raise ValueError("username eller user_id må oppgis")
        return self


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

        password_hash = hash_password(payload.temp_password)
        role_name = payload.role_name or "User"

        cur.execute(
            """
            EXEC dbo.usp_admin_create_user
                 @ActorUserId=%s,
                 @Username=%s,
                 @DisplayName=%s,
                 @PasswordHash=%s,
                 @MustChangePassword=%s,
                 @RoleName=%s
            """,
            (
                me.user_id,
                payload.username,
                payload.display_name,
                password_hash,
                int(payload.must_change_password),
                role_name,
            ),
        )

        row = cur.fetchone() or {}
        conn.commit()

        if "Username" not in row:
            row["Username"] = payload.username

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

        target_user_id = resolve_user_id(cur, username=payload.username, user_id=payload.user_id)
        password_hash = hash_password(payload.temp_password)

        cur.execute(
            """
            EXEC dbo.usp_admin_reset_password
                 @ActorUserId=%s,
                 @UserId=%s,
                 @PasswordHash=%s,
                 @MustChangePassword=%s
            """,
            (
                me.user_id,
                target_user_id,
                password_hash,
                int(payload.must_change_password),
            ),
        )

        row = cur.fetchone() or {"ok": True}
        conn.commit()
        return row

    except HTTPException:
        conn.rollback()
        raise
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

        target_user_id = resolve_user_id(cur, username=payload.username, user_id=payload.user_id)

        cur.execute(
            """
            EXEC dbo.usp_admin_set_user_role
                 @ActorUserId=%s,
                 @UserId=%s,
                 @RoleName=%s,
                 @IsEnabled=%s
            """,
            (
                me.user_id,
                target_user_id,
                payload.role_name,
                int(payload.is_enabled),
            ),
        )

        row = cur.fetchone() or {"ok": True}
        conn.commit()
        return row

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.get("/admin/users/assignable")
def admin_list_assignable_users(me: MeResponse = Depends(get_current_user)):
    require_admin_or_coordinator(me)

    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_admin_list_assignable_users @ActorUserId=%s",
            (me.user_id,),
        )
        return {"items": cur.fetchall() or []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()