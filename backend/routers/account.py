# account.py (router) - patched version

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

# IMPORTANT: use the SAME hashing logic as admin create user + login
# (Your uploaded security.py uses pbkdf2_sha256) :contentReference[oaicite:1]{index=1}
from backend.security import verify_password, hash_password  # <-- adjust if needed

router = APIRouter()


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)

class NotificationPreferencesRequest(BaseModel):
    notify_by_email: bool
    notify_by_teams: bool


@router.post("/account/change-password")
def change_password(payload: ChangePasswordRequest, me: MeResponse = Depends(get_current_user)):
    # backend enforcement (6 chars)
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nytt passord må være minst 6 tegn.")

    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        # 1) Load current password hash
        cur.execute(
            """
            SELECT PasswordHash
            FROM dbo.AppUsers
            WHERE UserId = %s AND IsActive = 1
            """,
            (me.user_id,),
        )
        row = cur.fetchone()

        if not row or not row.get("PasswordHash"):
            raise HTTPException(status_code=404, detail="User not found or inactive")

        stored_hash = row["PasswordHash"]

        # 2) Verify old password using project security (pbkdf2_sha256)
        if not verify_password(payload.old_password, stored_hash):
            raise HTTPException(status_code=400, detail="Nåværende passord er feil.")

        # 3) Hash new password using same logic as admin create user
        new_hash = hash_password(payload.new_password)

        # 4) Call proc with ONLY 2 args (matches SQL proc)
        cur.execute(
            "EXEC dbo.usp_auth_change_password %s, %s",
            (me.user_id, new_hash),
        )

        conn.commit()
        return {"ok": True}

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.post("/account/notification-preferences")
def update_notification_preferences(
    payload: NotificationPreferencesRequest,
    me: MeResponse = Depends(get_current_user),
):
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        cur.execute(
            """
            EXEC dbo.usp_account_update_notification_preferences
                 @UserId=%s,
                 @NotifyByEmail=%s,
                 @NotifyByTeams=%s
            """,
            (
                me.user_id,
                1 if payload.notify_by_email else 0,
                1 if payload.notify_by_teams else 0,
            ),
        )

        row = cur.fetchone()
        conn.commit()
        return row or {"ok": True}

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()