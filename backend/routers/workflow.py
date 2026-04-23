from fastapi import APIRouter, Depends, HTTPException

from backend.models.workflow import (
    AddStepCommentRequest,
    AssignStepRequest,
    CloseOrderRequest,
    CompleteStepRequest,
    CreateOrderRequest,
    HoldOrderRequest,
    SaveStep3FormDataRequest,
    SaveStepFormDataRequest,
    SendBackStepRequest,
    SetStepStatusRequest,
    UnclaimStepRequest,
)
from backend.routers.auth import get_current_user, MeResponse, require_admin_or_coordinator
from backend.services import workflow_service as service
from fastapi.responses import Response

router = APIRouter()


@router.post("/wf/orders")
def create_order(payload: CreateOrderRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.create_order(
            actor_user_id=me.user_id,
            external_amid=payload.external_amid,
            batch_no=payload.batch_no,
            title=payload.title,
            priority=payload.priority,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/orders/by-amid/{amid}")
def get_order_by_amid(amid: str, me: MeResponse = Depends(get_current_user)):
    try:
        result = service.get_order_by_amid(amid)
        if not result.get("header"):
            raise HTTPException(status_code=404, detail="Fant ikke ordre")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.get("/wf/orders/by-amid/{amid}/report.pdf")
def get_order_pdf_report(amid: str, me: MeResponse = Depends(get_current_user)):
    try:
        from backend.services.pdf_report import render_report_pdf

        report_data = service.build_order_report_data(amid)

        if not report_data.get("header"):
            raise HTTPException(status_code=404, detail="Fant ikke ordre")

        pdf_bytes = render_report_pdf(
            order_meta=report_data["header"],
            steps=report_data["steps"],
        )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="workflow-report-{amid}.pdf"'
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/{step_def_id}/queue")
def get_step_queue(step_def_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.get_step_queue(step_def_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/claim")
def claim_step(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.claim_step(me.user_id, order_step_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/orders/{order_id}/hold")
def hold_order(order_id: int, payload: HoldOrderRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.hold_order(me.user_id, order_id, payload.reason)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/orders/{order_id}/unhold")
def unhold_order(order_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.unhold_order(me.user_id, order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/orders/{order_id}/close")
def close_order(order_id: int, payload: CloseOrderRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.close_order(me.user_id, order_id, payload.reason)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/set-status")
def set_step_status(order_step_id: int, payload: SetStepStatusRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.set_step_status(
            me.user_id,
            order_step_id,
            payload.status,
            payload.reason_code,
            payload.comment,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/complete")
def complete_step(order_step_id: int, payload: CompleteStepRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.complete_step(
            me.user_id,
            order_step_id,
            payload.disposition,
            payload.notes,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/unclaim")
def unclaim_step(order_step_id: int, payload: UnclaimStepRequest, me: MeResponse = Depends(get_current_user)):
    try:
        return service.unclaim_step(me.user_id, order_step_id, payload.comment)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/def/{step_def_id}/form-schema")
def get_step_form_schema(step_def_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        row = service.get_step_form_schema(step_def_id)
        if not row:
            raise HTTPException(status_code=404, detail="Fant ikke skjema for steg")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/{order_step_id}/form-data")
def get_step_form_data(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.get_step_form_data(order_step_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/orders/{order_id}/step-form-data")
def get_order_step_form_data(order_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.get_order_step_form_data(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/form-data")
def save_step_form_data(
    order_step_id: int,
    payload: SaveStepFormDataRequest,
    me: MeResponse = Depends(get_current_user),
):
    try:
        return service.save_step_form_data(
            actor_user_id=me.user_id,
            order_step_id=order_step_id,
            payload_data=payload.data,
            expected_row_ver=payload.expected_row_ver,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/{order_step_id}/external-data")
def get_step_external_data(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        data = service.get_step_external_data(order_step_id)
        if not data:
            raise HTTPException(status_code=404, detail="Fant ikke ExternalAmid for steg")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/{order_step_id}/step3-form")
def get_step3_form(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        data = service.get_step3_form(order_step_id)
        if not data:
            raise HTTPException(status_code=404, detail="Fant ikke steg")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/step3-form")
def save_step3_form_data(
    order_step_id: int,
    payload: SaveStep3FormDataRequest,
    me: MeResponse = Depends(get_current_user),
):
    try:
        return service.save_step3_form_data(
            actor_user_id=me.user_id,
            order_step_id=order_step_id,
            payload_data=payload.data,
            expected_row_ver=payload.expected_row_ver,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wf/steps/{order_step_id}/send-back-targets")
def get_send_back_targets(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.get_send_back_targets(order_step_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/send-back")
def send_step_back(
    order_step_id: int,
    payload: SendBackStepRequest,
    me: MeResponse = Depends(get_current_user),
):
    try:
        return service.send_step_back(
            actor_user_id=me.user_id,
            order_step_id=order_step_id,
            target_step_def_id=payload.target_step_def_id,
            reason=payload.reason,
            notes=payload.notes,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/assign")
def assign_step_to_user(
    order_step_id: int,
    payload: AssignStepRequest,
    me: MeResponse = Depends(get_current_user),
):
    require_admin_or_coordinator(me)

    try:
        return service.set_step_assignees(
            actor_user_id=me.user_id,
            order_step_id=order_step_id,
            target_user_ids=payload.target_user_ids,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.get("/wf/steps/{order_step_id}/comments")
def get_step_comments(order_step_id: int, me: MeResponse = Depends(get_current_user)):
    try:
        return service.get_step_comment_history(order_step_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wf/steps/{order_step_id}/comments")
def add_step_comment(
    order_step_id: int,
    payload: AddStepCommentRequest,
    me: MeResponse = Depends(get_current_user),
):
    try:
        return service.add_step_comment(
            actor_user_id=me.user_id,
            order_step_id=order_step_id,
            comment_text=payload.text,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))