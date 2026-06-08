# routers/auth.py
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from pydantic import BaseModel
from typing import List, Optional

from backend.db import get_connection
from backend.security import (
    verify_password,
    create_access_token,
    hash_password,
    JWT_SECRET,
    JWT_ISSUER,
    JWT_AUDIENCE,
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
class LoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = False
    login_context: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MeResponse(BaseModel):
    user_id: int
    username: str
    roles: List[str]
    must_change_password: Optional[bool] = None
    notify_by_email: Optional[bool] = None
    notify_by_teams: Optional[bool] = None

def _decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        JWT_SECRET,
        algorithms=["HS256"],
        issuer=JWT_ISSUER,
        audience=JWT_AUDIENCE,
    )

def get_current_user(token: str = Depends(oauth2_scheme)) -> MeResponse:
    try:
        claims = _decode_token(token)
        return MeResponse(
            user_id=int(claims["sub"]),
            username=claims.get("username", ""),
            roles=claims.get("roles", []) or [],
            must_change_password=claims.get("must_change_password"),
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def require_roles(*roles: str):
    required = set(roles)
    def _dep(me: MeResponse = Depends(get_current_user)) -> MeResponse:
        if required and not required.intersection(set(me.roles)):
            raise HTTPException(status_code=403, detail="Forbidden")
        return me
    return _dep

def has_any_role(me: MeResponse, *allowed: str) -> bool:
    return bool(set(me.roles or []).intersection(set(allowed)))

def require_admin_or_coordinator(me: MeResponse):
    if not has_any_role(me, "Admin", "Koordinator"):
        raise HTTPException(status_code=403, detail="Ikke tilgang.")

@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        # Proc should return:
        # Result set 1: user row with UserId, Username, DisplayName, PasswordHash, IsActive, MustChangePassword
        # Result set 2: roles rows with RoleName
        cur.execute("EXEC dbo.usp_auth_login %s", (payload.username,))
        user = cur.fetchone()

        if not user or not user.get("IsActive"):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_password(payload.password, user["PasswordHash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        roles: List[str] = []
        if cur.nextset():
            roles_rows = cur.fetchall() or []
            roles = [r["RoleName"] for r in roles_rows if r.get("RoleName")]

        must_change = bool(user.get("MustChangePassword", False))

        login_context = (payload.login_context or "").strip().lower()
        token_minutes = 720
        if payload.remember:
            token_minutes = 518400 if login_context == "arkiv_infoscreen" else 43200
        # 518400 = 360 days for kiosk-style infoscreen logins
        # 43200 = 30 days
        # 720 = 12 hours

        token = create_access_token(
            subject=str(user["UserId"]),
            expires_minutes=token_minutes,
            extra_claims={
                "username": user["Username"],
                "roles": roles,
                "must_change_password": must_change,
            },
        )

        # Update last login (write proc)
        cur.execute("EXEC dbo.usp_auth_set_last_login %s", (user["UserId"],))
        conn.commit()

        return TokenResponse(access_token=token)

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.get("/auth/me", response_model=MeResponse)
def me(me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            """
            SELECT NotifyByEmail, NotifyByTeams
            FROM dbo.AppUsers
            WHERE UserId = %s
              AND IsActive = 1
            """,
            (me.user_id,),
        )
        row = cur.fetchone() or {}

        return MeResponse(
            user_id=me.user_id,
            username=me.username,
            roles=me.roles,
            must_change_password=me.must_change_password,
            notify_by_email=bool(row.get("NotifyByEmail", True)),
            notify_by_teams=bool(row.get("NotifyByTeams", False)),
        )
    finally:
        conn.close()
        
class ChangePasswordRequest(BaseModel):
    new_password: str

@router.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest, me: MeResponse = Depends(get_current_user)):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor()
        new_hash = hash_password(payload.new_password)
        cur.execute("EXEC dbo.usp_auth_change_password %s, %s", (me.user_id, new_hash))
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
