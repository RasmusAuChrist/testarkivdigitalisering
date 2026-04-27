import os
import requests


# Keeping the existing env var name, as requested.
POWER_AUTOMATE_EMAIL_WEBHOOK_URL = os.getenv("POWER_AUTOMATE_EMAIL_WEBHOOK_URL")


def send_notification_via_power_automate(payload: dict) -> None:
    if not POWER_AUTOMATE_EMAIL_WEBHOOK_URL:
        raise RuntimeError("POWER_AUTOMATE_EMAIL_WEBHOOK_URL is not configured.")

    res = requests.post(
        POWER_AUTOMATE_EMAIL_WEBHOOK_URL,
        json=payload,
        timeout=15,
    )

    res.raise_for_status()