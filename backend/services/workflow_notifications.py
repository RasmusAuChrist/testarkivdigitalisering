import logging
from typing import Any, Dict, List

from backend.services.power_automate_email_service import send_email_via_power_automate

logger = logging.getLogger(__name__)

EMAIL_DOMAIN = "nasjonalarkivet.no"
FRONTEND_BASE_URL = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net"


def email_from_username(username: str) -> str:
    return f"{username}@{EMAIL_DOMAIN}"


def notify_new_step_assignees(
    *,
    actor_user_id: int,
    order_step_id: int,
    assigned_users: List[Dict[str, Any]],
    order_title: str | None = None,
    step_name: str | None = None,
    external_amid: str | None = None,
) -> None:
    for user in assigned_users:
        username = user.get("Username") or user.get("username")
        user_id = user.get("UserId") or user.get("user_id")

        if not username:
            continue

        if user_id is not None and int(user_id) == int(actor_user_id):
            continue

        to_email = email_from_username(username)

        subject = f"Ny oppgave tildelt: {step_name or 'Arbeidsflyt'}"

        link = ""
        if external_amid:
            link = f"\n\nÅpne oppgaven:\n{FRONTEND_BASE_URL}/views/workflow_order.html?amid={external_amid}"

        body = f"""Hei,

Du har fått tildelt en ny oppgave i arbeidsflyten.

Ordre: {order_title or ''}
Steg: {step_name or ''}
OrderStepId: {order_step_id}

{link}

Dette er en automatisk melding.
"""

        try:
            send_email_via_power_automate(to_email, subject, body)
        except Exception:
            logger.exception("Failed to send workflow assignment email to %s", to_email)