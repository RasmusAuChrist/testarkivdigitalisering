from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)  # <-- backend enforcement (6)


@router.post("/account/change-password")
def change_password(payload: ChangePasswordRequest, me: MeResponse = Depends(get_current_user)):
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

        # 2) Verify old password (bcrypt)
        if not pwd_context.verify(payload.old_password, stored_hash):
            raise HTTPException(status_code=400, detail="Nåværende passord er feil.")

        # 3) Hash new password
        new_hash = pwd_context.hash(payload.new_password)

        # 4) Call proc with ONLY 2 args (matches your SQL proc)
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