import html
import logging
from typing import Any, Dict, List

from backend.services.power_automate_notification_service import (
    send_notification_via_power_automate,
)

logger = logging.getLogger(__name__)

EMAIL_DOMAIN = "nasjonalarkivet.no"
FRONTEND_BASE_URL = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net"


def email_from_username(username: str) -> str:
    return f"{username}@{EMAIL_DOMAIN}"


def _as_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value == 1
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "ja")
    return bool(value)


def notify_new_step_assignees(
    *,
    actor_user_id: int,
    order_step_id: int,
    assigned_users: List[Dict[str, Any]],
    order_title: str | None = None,
    step_name: str | None = None,
    external_amid: str | None = None,
    identifikator: str | None = None,
) -> None:
    order_title_safe = html.escape(order_title or "")
    step_name_safe = html.escape(step_name or "")
    identifikator_safe = html.escape(identifikator or "")

    task_url = ""
    if external_amid:
        task_url = f"{FRONTEND_BASE_URL}/views/workflow_order.html?amid={external_amid}"

    task_url_safe = html.escape(task_url)

    subject = f"Ny oppgave tildelt: {step_name or 'Arbeidsflyt'}"

    email_body_html = f"""
<div style="font-family: Arial, sans-serif; font-size:14px; color:#111827; line-height:1.45;">
  <p>Hei,</p>

  <p>Du har fått tildelt en ny oppgave i arbeidsflyten.</p>

  <table style="border-collapse:collapse; margin-top:12px;">
    <tr>
      <td style="font-weight:bold; padding:5px 16px 5px 0;">Steg</td>
      <td style="padding:5px 0;">{step_name_safe}</td>
    </tr>
    <tr>
      <td style="font-weight:bold; padding:5px 16px 5px 0;">Arkivnavn</td>
      <td style="padding:5px 0;">{order_title_safe}</td>
    </tr>
    <tr>
      <td style="font-weight:bold; padding:5px 16px 5px 0;">Identifikator</td>
      <td style="padding:5px 0;">{identifikator_safe}</td>
    </tr>
    <tr>
      <td style="font-weight:bold; padding:5px 16px 5px 0;">OrderStepId</td>
      <td style="padding:5px 0;">{order_step_id}</td>
    </tr>
  </table>

  {f'''
  <p style="margin-top:18px;">
    <a href="{task_url_safe}"
       style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:bold;">
      Åpne oppgaven
    </a>
  </p>
  ''' if task_url else ''}

  <p style="color:#6b7280; margin-top:22px;">
    Dette er en automatisk melding.
  </p>
</div>
"""

    teams_message_html = f"""
<b>Ny oppgave tildelt</b><br><br>
<b>Steg:</b> {step_name_safe}<br>
<b>Arkivnavn:</b> {order_title_safe}<br>
<b>Identifikator:</b> {identifikator_safe}<br>
<b>OrderStepId:</b> {order_step_id}<br>
{f'<br><a href="{task_url_safe}">Åpne oppgaven</a>' if task_url else ''}
"""

    for user in assigned_users:
        username = user.get("Username") or user.get("username")
        user_id = user.get("UserId") or user.get("user_id")

        if not username:
            continue

        if user_id is not None and int(user_id) == int(actor_user_id):
            continue

        notify_email = _as_bool(user.get("NotifyByEmail"), default=True)
        notify_teams = _as_bool(user.get("NotifyByTeams"), default=False)

        if not notify_email and not notify_teams:
            continue

        recipient = email_from_username(username)

        payload = {
            "to": recipient,
            "notify_email": notify_email,
            "notify_teams": notify_teams,
            "subject": subject,
            "body_html": email_body_html,
            "teams_message": teams_message_html,
        }

        try:
            send_notification_via_power_automate(payload)
        except Exception:
            logger.exception("Failed to send workflow notification to %s", recipient)