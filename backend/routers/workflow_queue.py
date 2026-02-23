from fastapi import APIRouter, Depends, HTTPException
from backend.db import get_connection
from backend.routers.auth import get_current_user, MeResponse

router = APIRouter()

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