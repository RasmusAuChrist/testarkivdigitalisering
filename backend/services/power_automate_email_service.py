import os
import requests


POWER_AUTOMATE_EMAIL_WEBHOOK_URL = os.getenv("POWER_AUTOMATE_EMAIL_WEBHOOK_URL")


def send_email_via_power_automate(to: str, subject: str, body: str) -> None:
    if not POWER_AUTOMATE_EMAIL_WEBHOOK_URL:
        raise RuntimeError("POWER_AUTOMATE_EMAIL_WEBHOOK_URL is not configured.")

    res = requests.post(
        POWER_AUTOMATE_EMAIL_WEBHOOK_URL,
        json={
            "to": to,
            "subject": subject,
            "body": body,
        },
        timeout=15,
    )
    res.raise_for_status()