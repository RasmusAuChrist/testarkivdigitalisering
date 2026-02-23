from fastapi import APIRouter, Depends, HTTPException
from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

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