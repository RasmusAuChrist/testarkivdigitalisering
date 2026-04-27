from typing import Any, Dict, List, Optional, Tuple
import json
from backend.db import get_connection


def create_order(
    actor_user_id: int,
    external_amid: str,
    batch_no: Optional[int],
    title: Optional[str],
    priority: int,
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_create_order %s, %s, %s, %s, %s",
            (actor_user_id, external_amid, batch_no, title, priority),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_order_by_amid(amid: str) -> Dict[str, Any]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_order_by_amid %s", (amid,))

        header = cur.fetchone()
        steps = []
        events = []
        step_form_data = []

        if cur.nextset():
            steps = cur.fetchall() or []
        if cur.nextset():
            events = cur.fetchall() or []
        if cur.nextset():
            step_form_data = cur.fetchall() or []

        return {
            "header": header,
            "steps": steps,
            "events": events,
            "step_form_data": step_form_data,
        }
    finally:
        conn.close()


def get_step_queue(step_def_id: int) -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_queue %s", (step_def_id,))
        return cur.fetchall() or []
    finally:
        conn.close()


def claim_step(actor_user_id: int, order_step_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_claim_step %s, %s", (actor_user_id, order_step_id))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def hold_order(actor_user_id: int, order_id: int, reason: str) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_hold_order %s, %s, %s", (actor_user_id, order_id, reason))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def unhold_order(actor_user_id: int, order_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_unhold_order %s, %s", (actor_user_id, order_id))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def close_order(actor_user_id: int, order_id: int, reason: str) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_close_order %s, %s, %s", (actor_user_id, order_id, reason))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def set_step_status(
    actor_user_id: int,
    order_step_id: int,
    status: str,
    reason_code: Optional[str],
    comment: Optional[str],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_set_step_status %s, %s, %s, %s, %s",
            (actor_user_id, order_step_id, status, reason_code, comment),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def complete_step(
    actor_user_id: int,
    order_step_id: int,
    disposition: str,
    notes: Optional[str],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            """
            EXEC dbo.usp_wf_complete_step
                 @ActorUserId=%s,
                 @OrderStepId=%s,
                 @Disposition=%s,
                 @Reason=%s,
                 @Notes=%s
            """,
            (actor_user_id, order_step_id, disposition, None, notes),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def unclaim_step(
    actor_user_id: int,
    order_step_id: int,
    comment: Optional[str],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_unclaim_step %s, %s, %s",
            (actor_user_id, order_step_id, comment),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def get_step_overview() -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_overview")
        return cur.fetchall() or []
    finally:
        conn.close()

def get_multi_step_queue(step_def_ids: Optional[List[int]]) -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        if step_def_ids is None:
            step_ids_json = None
        else:
            step_ids_json = json.dumps(step_def_ids)

        cur.execute(
            """
            EXEC dbo.usp_wf_get_multi_step_queue
                 @StepDefIdsJson=%s
            """,
            (step_ids_json,),
        )

        return cur.fetchall() or []
    finally:
        conn.close()


def get_step_form_schema(step_def_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_form_schema %s", (step_def_id,))
        return cur.fetchone()
    finally:
        conn.close()


def get_step_form_data(order_step_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_form_data %s", (order_step_id,))
        return cur.fetchone()
    finally:
        conn.close()


def get_order_step_form_data(order_id: int) -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_order_step_form_data %s", (order_id,))
        return cur.fetchall() or []
    finally:
        conn.close()


def save_step_form_data(
    actor_user_id: int,
    order_step_id: int,
    data_json: str,
    expected_rowver: Optional[bytes],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_upsert_step_form_data %s, %s, %s, %s",
            (actor_user_id, order_step_id, data_json, expected_rowver),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_step_external_data(order_step_id: int) -> Tuple[str, Optional[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        cur.execute(
            """
            SELECT o.ExternalAmid
            FROM dbo.WfOrderSteps os
            JOIN dbo.WfOrders o ON o.OrderId = os.OrderId
            WHERE os.OrderStepId = %s
            """,
            (order_step_id,),
        )
        row = cur.fetchone()

        if not row or not row.get("ExternalAmid"):
            return "", None, [], []

        amid = row["ExternalAmid"]

        cur.execute("EXEC dbo.usp_wf_get_step3_external_data %s", (amid,))

        serie = cur.fetchone()
        sjekkliste = []
        egenskaper = []

        if cur.nextset():
            sjekkliste = cur.fetchall() or []
        if cur.nextset():
            egenskaper = cur.fetchall() or []

        return amid, serie, sjekkliste, egenskaper
    finally:
        conn.close()


def get_step3_context(order_step_id: int) -> Tuple[Optional[Dict[str, Any]], Optional[bytes]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)

        cur.execute(
            """
            SELECT
                os.OrderStepId,
                os.StepDefId,
                os.Status AS StepStatus,
                os.AssignedToUserId,
                o.OrderId,
                o.ExternalAmid
            FROM dbo.WfOrderSteps os
            INNER JOIN dbo.WfOrders o
                ON o.OrderId = os.OrderId
            WHERE os.OrderStepId = %s
            """,
            (order_step_id,),
        )
        row = cur.fetchone()

        if not row:
            return None, None

        cur.execute(
            """
            SELECT RowVer
            FROM dbo.WfOrderStepFormData
            WHERE OrderStepId = %s
            """,
            (order_step_id,),
        )
        rv = cur.fetchone()
        rowver = rv["RowVer"] if rv and rv.get("RowVer") is not None else None

        return row, rowver
    finally:
        conn.close()


def save_step3_form_data(
    actor_user_id: int,
    order_step_id: int,
    data_json: str,
    expected_rowver: Optional[bytes],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_save_step3_form_data %s, %s, %s, %s",
            (actor_user_id, order_step_id, data_json, expected_rowver),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_send_back_targets(order_step_id: int) -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_send_back_targets %s", (order_step_id,))
        return cur.fetchall() or []
    finally:
        conn.close()


def send_step_back(
    actor_user_id: int,
    order_step_id: int,
    target_step_def_id: int,
    reason: str,
    notes: Optional[str],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_send_step_back %s, %s, %s, %s, %s",
            (actor_user_id, order_step_id, target_step_def_id, reason, notes),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def set_step_assignees(
    actor_user_id: int,
    order_step_id: int,
    target_user_ids: List[int],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            """
            EXEC dbo.usp_wf_set_step_assignees
                 @ActorUserId=%s,
                 @OrderStepId=%s,
                 @TargetUserIdsJson=%s
            """,
            (actor_user_id, order_step_id, json.dumps(target_user_ids)),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def add_step_comment(
    actor_user_id: int,
    order_step_id: int,
    comment_text: str,
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            "EXEC dbo.usp_wf_add_step_comment %s, %s, %s",
            (actor_user_id, order_step_id, comment_text),
        )
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_step_comment_history(order_step_id: int) -> List[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute("EXEC dbo.usp_wf_get_step_comment_history %s", (order_step_id,))
        return cur.fetchall() or []
    finally:
        conn.close()

def set_step_assignees(
    actor_user_id: int,
    order_step_id: int,
    target_user_ids: List[int],
) -> Optional[Dict[str, Any]]:
    conn = get_connection(autocommit=False)
    try:
        cur = conn.cursor(as_dict=True)
        cur.execute(
            """
            EXEC dbo.usp_wf_set_step_assignees
                 @ActorUserId=%s,
                 @OrderStepId=%s,
                 @TargetUserIdsJson=%s
            """,
            (actor_user_id, order_step_id, json.dumps(target_user_ids)),
        )

        row = cur.fetchone()

        newly_assigned_users = []
        if cur.nextset():
            newly_assigned_users = cur.fetchall() or []

        conn.commit()

        return {
            **(row or {}),
            "newly_assigned_users": newly_assigned_users,
        }

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()