from pydantic import BaseModel, Field
from typing import Optional, Literal, Any, Dict


class CreateOrderRequest(BaseModel):
    external_amid: str
    batch_no: Optional[int] = None
    title: Optional[str] = None
    priority: int = 3


class HoldOrderRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=400)


class CloseOrderRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=400)


StepStatus = Literal["Pending", "Active", "Blocked", "Completed"]


class SetStepStatusRequest(BaseModel):
    status: StepStatus
    reason_code: Optional[str] = Field(default=None, max_length=50)
    comment: Optional[str] = Field(default=None, max_length=400)


class CompleteStepRequest(BaseModel):
    disposition: str = Field(min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=400)


class UnclaimStepRequest(BaseModel):
    comment: Optional[str] = Field(default=None, max_length=400)


class SaveStepFormDataRequest(BaseModel):
    data: Dict[str, Any]
    expected_row_ver: Optional[str] = None


class SaveStep3FormDataRequest(BaseModel):
    data: Dict[str, Any]
    expected_row_ver: Optional[str] = None


class SendBackStepRequest(BaseModel):
    target_step_def_id: int
    reason: str = Field(min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=400)


class AssignStepRequest(BaseModel):
    target_user_id: int