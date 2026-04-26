from __future__ import annotations

from datetime import datetime
from email.message import EmailMessage
import smtplib

from .config import EmailSettings


class PasswordResetEmailSender:
    def __init__(self, settings: EmailSettings) -> None:
        self.settings = settings

    def send_password_reset(self, *, recipient_email: str, reset_url: str, expires_at: datetime) -> None:
        message = EmailMessage()
        message["Subject"] = "Reset your MedAPP password"
        message["From"] = self.settings.smtp_from_email
        message["To"] = recipient_email
        message.set_content(
            "\n".join(
                [
                    "We received a request to reset your MedAPP password.",
                    "",
                    f"Reset your password using this link: {reset_url}",
                    "",
                    f"This link expires at {expires_at.isoformat()}.",
                    "If you did not request this, you can ignore this email.",
                ]
            )
        )

        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(self.settings.smtp_username, self.settings.smtp_password)
            smtp.send_message(message)
