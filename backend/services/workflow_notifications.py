import html
import logging
from typing import Any, Dict, List

from backend.services.power_automate_email_service import send_email_via_power_automate

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

    link_html = ""
    if external_amid:
        url = f"{FRONTEND_BASE_URL}/views/workflow_order.html?amid={external_amid}"
        link_html = f"""
          <p style="margin-top:18px;">
            <a href="{html.escape(url)}"
               style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:bold;">
              Åpne oppgaven
            </a>
          </p>
        """

    subject = f"Ny oppgave tildelt: {step_name or 'Arbeidsflyt'}"

    body = f"""
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

  {link_html}

  <p style="color:#6b7280; margin-top:22px;">
    Dette er en automatisk melding.
  </p>
</div>
"""

    for user in assigned_users:
        username = user.get("Username") or user.get("username")
        user_id = user.get("UserId") or user.get("user_id")

        if not username:
            continue

        if user_id is not None and int(user_id) == int(actor_user_id):
            continue

        if not _as_bool(user.get("NotifyByEmail"), default=True):
            continue

        to_email = email_from_username(username)

        try:
            send_email_via_power_automate(to_email, subject, body)
        except Exception:
            logger.exception("Failed to send workflow assignment email to %s", to_email)