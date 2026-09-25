import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


_COPY = {
    "signup": {
        "subject": "Verify your ChessOpeningAnalyzer account",
        "heading": "Verify your account",
        "intro": "Enter the code below to confirm your email address.",
        "ignore": "If you did not create an account, ignore this email.",
    },
    "email_change": {
        "subject": "Confirm your new ChessOpeningAnalyzer email",
        "heading": "Confirm your new email",
        "intro": "Enter the code below in Settings to switch your account to this address.",
        "ignore": "If you did not request this change, ignore this email — nothing will change.",
    },
}


def send_verification_email(to_email: str, code: str, purpose: str = "signup"):
    copy = _COPY[purpose]
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = copy["subject"]
    msg["From"] = smtp_from
    msg["To"] = to_email

    text = f"Your ChessOpeningAnalyzer verification code is: {code}\n\nThis code expires in 15 minutes."
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#0e111e;color:#c8cce0;border-radius:12px;">
      <h2 style="color:#c9a84c;margin-bottom:0.5rem;">{copy['heading']}</h2>
      <p style="color:#5c6180;">{copy['intro']}</p>
      <div style="font-size:2.5rem;font-weight:800;letter-spacing:0.3em;color:#eceffe;
                  background:#12162a;padding:1.5rem;border-radius:8px;text-align:center;
                  margin:1.5rem 0;border:1px solid #1e2338;">
        {code}
      </div>
      <p style="color:#5c6180;font-size:0.85rem;">This code expires in 15 minutes. {copy['ignore']}</p>
    </div>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as s:
        s.starttls()
        s.login(smtp_user, smtp_password)
        s.sendmail(smtp_from, [to_email], msg.as_string())
