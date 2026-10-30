from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
import io
import json as _json
import os
import asyncio
import threading
import logging
import uuid
import jwt
import bcrypt
import hashlib
import secrets
import re
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from typing import List, Optional, Literal, Any, Dict
from datetime import datetime, timezone, timedelta, date

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
media_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="tenant_evidence")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXP_DAYS = 7
JWT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

APP_ENV = os.environ.get("APP_ENV", "development")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app = FastAPI(title="FixMyCribs API", docs_url=None if APP_ENV == "production" else "/docs",
                 redoc_url=None if APP_ENV == "production" else "/redoc",
                 openapi_url=None if APP_ENV == "production" else "/openapi.json")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fixmycribs")


# ---------------- HELPERS ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, auth_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "ver": int(auth_version),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def sha256_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def create_secure_token() -> str:
    return secrets.token_urlsafe(32)


PASSWORD_POLICY_MSG = (
    "Password must be at least 8 characters and include an uppercase letter, "
    "a lowercase letter, a number, and a special character."
)


def validate_password_strength(pw: str):
    """Enforce a strong password policy. Raises HTTP 400 if the password is weak."""
    if not pw or len(pw) < 8:
        raise HTTPException(400, PASSWORD_POLICY_MSG)
    if not re.search(r"[A-Z]", pw):
        raise HTTPException(400, PASSWORD_POLICY_MSG)
    if not re.search(r"[a-z]", pw):
        raise HTTPException(400, PASSWORD_POLICY_MSG)
    if not re.search(r"\d", pw):
        raise HTTPException(400, PASSWORD_POLICY_MSG)
    if not re.search(r"[^A-Za-z0-9]", pw):
        raise HTTPException(400, PASSWORD_POLICY_MSG)


# ---- Brute-force protection ----
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15


async def check_login_lockout(email: str):
    rec = await db.login_attempts.find_one({"email": email})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until:
        try:
            lu = datetime.fromisoformat(locked_until)
            if datetime.now(timezone.utc) < lu:
                mins = max(1, int((lu - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
                raise HTTPException(429, f"Too many failed attempts. Try again in {mins} minute(s).")
        except HTTPException:
            raise
        except Exception:
            pass


async def register_failed_login(email: str):
    # A single atomic increment prevents concurrent guesses bypassing the counter.
    rec = await db.login_attempts.find_one_and_update(
        {"email": email}, {"$inc": {"count": 1}, "$set": {"updated_at": now_iso()}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if rec.get("count", 0) >= MAX_LOGIN_ATTEMPTS:
        await db.login_attempts.update_one(
            {"email": email, "count": {"$gte": MAX_LOGIN_ATTEMPTS}},
            {"$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)).isoformat(), "count": 0}})


async def clear_login_attempts(email: str):
    await db.login_attempts.delete_one({"email": email})


async def throttle_sensitive_action(action: str, identifier: str, seconds: int):
    """Mongo-backed per-identity cooldown shared across all server replicas."""
    now = datetime.now(timezone.utc)
    key = sha256_token(f"{action}:{identifier.casefold()}")
    try:
        await db.auth_throttles.find_one_and_update(
            {"key": key, "$or": [{"until": {"$lte": now}}, {"until": {"$exists": False}}]},
            {"$set": {"until": now + timedelta(seconds=seconds), "updated_at": now}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        raise HTTPException(429, "Too many requests. Please try again later.")


async def _create_email_verification(user: dict) -> str:
    """Create an email-verification token, log a dev email, return the raw verification link."""
    await db.email_verification_tokens.update_many(
        {"user_id": user["id"], "status": "pending"}, {"$set": {"status": "superseded"}}
    )
    raw = create_secure_token()
    await db.email_verification_tokens.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "email": user["email"],
        "token_hash": sha256_token(raw),
        "status": "pending",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "created_at": now_iso(),
    })
    link = f"{FRONTEND_URL}/verify-email/{raw}"
    send_email_dev(
        to=user["email"],
        subject="Verify your FixMyCribs email",
        title="Confirm your email address",
        cta="Verify my email",
        accent="#10b981",
        eyebrow="Account setup",
        preheader="One quick tap to activate your FixMyCribs account.",
        footnote="This link expires in 24 hours. If you didn't create a FixMyCribs account, you can safely ignore this email.",
        body=(
            f"Hi {user.get('full_name','') or 'there'},\n\n"
            f"Welcome to FixMyCribs — the calmest way to run rent, bills and tenants. "
            f"You're one tap away from your dashboard.\n\n"
            f"Tap the button below to confirm this is really you and unlock full access."
        ),
        link=link,
        from_type="noreply",
    )
    return link

def _validate_session_claims(payload: dict, user: dict):
    # Legacy tokens without a version remain valid until the first password change.
    if int(payload.get("ver", 0)) != int(user.get("auth_version", 0)):
        raise HTTPException(401, "Session expired. Please sign in again.")
    try:
        age = datetime.now(timezone.utc).timestamp() - int(payload["iat"])
    except (ValueError, TypeError, KeyError):
        raise HTTPException(401, "Invalid session")
    if age > JWT_MAX_AGE_SECONDS or age < -60:
        raise HTTPException(401, "Session expired. Please sign in again.")


def strip_private(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    doc.pop("auth_version", None)
    return doc

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(401, "User not found")
    _validate_session_claims(payload, user)
    if user.get("account_status", "active") not in ("active",):
        # allow tenant/facility manager suspended to still call /auth/me but not other endpoints
        raise HTTPException(403, "Your account is not active. Contact support.")
    if user.get("role") == "owner" and not user.get("email_verified", False):
        raise HTTPException(403, "Please verify your email address to continue. Check your inbox for the verification link.")
    return strip_private(user)

async def get_current_user_soft(creds: HTTPAuthorizationCredentials = Depends(security)):
    """Same as get_current_user but tolerates non-active status (for /auth/me)."""
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(401, "User not found")
    _validate_session_claims(payload, user)
    return strip_private(user)


def require_roles(user, allowed: List[str]):
    if user.get("role") not in allowed:
        raise HTTPException(403, "Forbidden")
    if user.get("account_status", "active") != "active":
        raise HTTPException(403, "Account not active")
    return True


async def resolve_owner_id(user: dict) -> str:
    """Return the owner's user_id for the given actor. Owner returns own id;
    facility_manager returns the linked owner_id. Raises 403 otherwise."""
    role = user.get("role")
    if role == "owner":
        return user["id"]
    if role == "facility_manager":
        fm = await db.facility_managers.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0})
        if not fm:
            raise HTTPException(403, "Facility manager not linked to any owner")
        return fm["owner_id"]
    raise HTTPException(403, "Forbidden")




def parse_date(s: str) -> date:
    if isinstance(s, date):
        return s
    return datetime.fromisoformat(s).date() if "T" in s else date.fromisoformat(s)


def compute_status(due_date_str: str, amount_due: float, amount_paid: float) -> str:
    today = date.today()
    due = parse_date(due_date_str)
    if amount_paid >= amount_due and amount_due > 0:
        return "paid"
    if amount_paid > 0 and amount_paid < amount_due:
        return "partially_paid" if today <= due else "overdue"
    if today > due:
        return "overdue"
    if today == due:
        return "due_today"
    return "upcoming"


def days_diff(due_date_str: str) -> int:
    return (date.today() - parse_date(due_date_str)).days


# Recurring-charge frequencies → how far to advance one cycle
RECURRING_FREQS = {"weekly", "monthly", "quarterly", "bi_annually", "biannually",
                   "semi_annually", "yearly", "annually"}


def advance_date(d: date, freq: str, n: int = 1):
    """Advance a date by n cycles of the given frequency. Returns None for non-recurring."""
    from dateutil.relativedelta import relativedelta
    f = (freq or "").lower()
    if f == "weekly":
        return d + timedelta(weeks=n)
    if f == "monthly":
        return d + relativedelta(months=n)
    if f == "quarterly":
        return d + relativedelta(months=3 * n)
    if f in ("bi_annually", "biannually", "semi_annually"):
        return d + relativedelta(months=6 * n)
    if f in ("yearly", "annually"):
        return d + relativedelta(years=n)
    return None


async def log_action(actor: dict, action: str, target_type: str, target_id: str,
                     before: Any = None, after: Any = None, reason: str = ""):
    doc = {
        "id": new_id(),
        "admin_id": actor.get("id") if actor else None,
        "admin_email": actor.get("email") if actor else None,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "before": before,
        "after": after,
        "reason": reason,
        "created_at": now_iso(),
    }
    await db.audit_logs.insert_one(doc)


def _html_email(title: str, body: str, link: Optional[str], cta: str = "Open",
                accent: str = "#10b981", eyebrow: str = "FixMyCribs",
                preheader: str = "", footnote: str = "") -> str:
    """Build a premium, brand-aligned responsive HTML email (email-client-safe tables)."""
    paras = "".join(
        f'<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#334155;">{p}</p>'
        for p in (body or "").split("\n\n") if p.strip()
    ).replace("\n", "<br/>")
    btn = ""
    if link:
        btn = f"""
        <tr><td style="padding:6px 0 4px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:{accent};box-shadow:0 8px 20px -6px {accent}66;">
          <a href="{link}" style="display:inline-block;padding:14px 34px;color:#04120c;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.2px;border-radius:999px;">{cta} &nbsp;&rarr;</a>
          </td></tr></table>
        </td></tr>"""
    link_line = (
        f'<tr><td style="padding-top:8px;font-size:12px;color:#94a3b8;line-height:1.5;word-break:break-all;">'
        f'Button not working? Paste this link:<br/><a href="{link}" style="color:{accent};text-decoration:none;">{link}</a></td></tr>'
        if link else ""
    )
    foot = footnote or "You're receiving this because an action was taken on your FixMyCribs account."
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/></head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader or title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:40px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px -24px rgba(15,23,42,.35);">
  <!-- header band -->
  <tr><td style="background:#0b1220;padding:26px 34px 22px 34px;">
    <table role="presentation" width="100%"><tr>
      <td style="vertical-align:middle;">
        <span style="display:inline-block;width:36px;height:36px;background:{accent};color:#04120c;border-radius:10px;text-align:center;line-height:36px;font-weight:900;font-size:18px;vertical-align:middle;">F</span>
        <span style="color:#ffffff;font-weight:800;font-size:17px;letter-spacing:.3px;margin-left:10px;vertical-align:middle;">FixMyCribs</span>
      </td>
      <td align="right" style="vertical-align:middle;">
        <span style="color:{accent};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;">{eyebrow}</span>
      </td>
    </tr></table>
    <div style="height:4px;width:64px;background:{accent};border-radius:999px;margin-top:18px;"></div>
  </td></tr>
  <!-- body -->
  <tr><td style="padding:32px 34px 8px 34px;">
    <h1 style="margin:0 0 16px 0;font-size:25px;line-height:1.25;font-weight:800;color:#0b1220;letter-spacing:-.3px;">{title}</h1>
  </td></tr>
  <tr><td style="padding:0 34px 4px 34px;">{paras}</td></tr>
  <tr><td style="padding:14px 34px 4px 34px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">{btn}{link_line}</table>
  </td></tr>
  <!-- footer -->
  <tr><td style="padding:26px 34px 30px 34px;">
    <div style="height:1px;background:#e6ebf1;margin-bottom:18px;"></div>
    <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;line-height:1.6;">{foot}</p>
    <p style="margin:0;font-size:12px;color:#cbd5e1;">FixMyCribs &middot; Rent, bills &amp; tenants on autopilot &middot; Lagos, NG</p>
  </td></tr>
</table>
<div style="color:#b6c1cf;font-size:11px;margin-top:18px;">&copy; {date.today().year} FixMyCribs. All rights reserved.</div>
</td></tr></table></body></html>"""


def _smtp_send_sync(to: str, subject: str, plain: str, html: str, from_email: str, from_name: str):
    """Blocking SMTP send (runs in a background thread)."""
    import smtplib, ssl
    from email.message import EmailMessage
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "465"))
    username = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to
    msg["Reply-To"] = from_email
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")
    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
                s.login(username, password)
                s.send_message(msg, from_addr=username, to_addrs=[to])
        else:
            with smtplib.SMTP(host, port, timeout=20) as s:
                s.starttls(context=ctx)
                s.login(username, password)
                s.send_message(msg, from_addr=username, to_addrs=[to])
        logger.info(f"[email->sent] to={to} subject={subject!r} from={from_email}")
    except Exception as e:
        logger.error(f"[email->FAILED] to={to} subject={subject!r} error={e}")
        raise


def _resend_send_sync(to: str, subject: str, plain: str, html: str, from_email: str, from_name: str):
    """Send transactional email via HTTPS (works on Railway Hobby)."""
    import requests
    key = os.environ["RESEND_API_KEY"]
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"from": f"{from_name} <{from_email}>", "to": [to],
              "subject": subject, "text": plain, "html": html}, timeout=25,
    )
    response.raise_for_status()
    logger.info("[email->accepted] via=resend to=%s", to)
    return response.json().get("id")


def _transactional_email_ready() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("EMAIL_FROM")) or bool(
        os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USERNAME") and os.environ.get("SMTP_PASSWORD")
    )


def send_email_dev(to: str, subject: str, body: str, link: Optional[str] = None,
                   from_type: str = "noreply", cta: str = "Open", title: Optional[str] = None,
                   accent: str = "#10b981", eyebrow: str = "FixMyCribs", preheader: str = "",
                   footnote: str = ""):
    """Send a transactional email. Uses real SMTP when configured; otherwise logs (dev)."""
    resend_configured = bool(os.environ.get("RESEND_API_KEY") and os.environ.get("EMAIL_FROM"))
    smtp_configured = bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USERNAME") and os.environ.get("SMTP_PASSWORD"))
    if resend_configured or smtp_configured:
        if from_type == "welcome":
            from_email = os.environ.get("SMTP_FROM_EMAIL_WELCOME") or os.environ.get("SMTP_FROM_EMAIL") or os.environ.get("SMTP_USERNAME")
        else:
            from_email = os.environ.get("SMTP_FROM_EMAIL") or os.environ.get("SMTP_USERNAME")
        from_name = os.environ.get("EMAIL_FROM_NAME") or os.environ.get("SMTP_FROM_NAME", "FixMyCribs")
        if resend_configured:
            from_email = os.environ["EMAIL_FROM"]
        html = _html_email(title or subject, body, link, cta=cta, accent=accent,
                           eyebrow=eyebrow, preheader=preheader or subject, footnote=footnote)
        # Fire-and-forget in a daemon thread so we never block the event loop.
        sender = _resend_send_sync if resend_configured else _smtp_send_sync
        threading.Thread(target=sender, args=(to, subject, body, html, from_email, from_name), daemon=True).start()
        return
    if APP_ENV == "production":
        logger.error("Transactional email is not configured. No email sent to %s", to)
        return
    logger.info("=" * 72)
    logger.info(f"[DEV EMAIL] TO: {to}")
    logger.info(f"[DEV EMAIL] SUBJECT: {subject}")
    if link:
        logger.info(f"[DEV EMAIL] LINK: {link}")
    logger.info(f"[DEV EMAIL] BODY:\n{body}")
    logger.info("=" * 72)


# ---------------- PLAN CONFIG ----------------
DEFAULT_PLAN_CONFIGS = [
    {
        "id": "starter", "name": "Starter", "price": 0, "billing_cycle": "month",
        "limits": {
            "properties": 2, "tenants": 5, "facility_managers": 0,
            "messages_per_month": 100, "ai_reminders_per_month": 10,
            "postpaid_billing": False, "maintenance": False, "tenant_portal": True,
            "bills": False, "reports": False,
        },
        "features": ["Up to 2 properties", "Up to 5 tenants", "Basic rent tracking", "Manual reminders", "10 AI reminders/mo", "Tenant portal"],
        "active": True,
    },
    {
        "id": "growth", "name": "Growth", "price": 5000, "billing_cycle": "month",
        "limits": {
            "properties": 20, "tenants": 100, "facility_managers": 5,
            "messages_per_month": 5000, "ai_reminders_per_month": 500,
            "postpaid_billing": True, "maintenance": True, "tenant_portal": True,
            "bills": True, "reports": True,
        },
        "features": ["Up to 20 properties", "Up to 100 tenants", "AI reminder generator", "Overdue tracking", "Reports & exports", "500 AI reminders/mo", "Maintenance workflow", "Utility bills"],
        "active": True,
    },
    {
        "id": "pro", "name": "Pro", "price": 15000, "billing_cycle": "month",
        "limits": {
            "properties": 999999, "tenants": 999999, "facility_managers": 999999,
            "messages_per_month": 999999, "ai_reminders_per_month": 999999,
            "postpaid_billing": True, "maintenance": True, "tenant_portal": True,
            "bills": True, "reports": True,
        },
        "features": ["Unlimited properties", "Unlimited tenants", "Team members", "Advanced analytics", "Priority support", "Unlimited AI", "Maintenance workflow", "Utility bills"],
        "active": True,
    },
]


async def get_plan_config(plan_id: str) -> dict:
    cfg = await db.plan_configs.find_one({"id": plan_id}, {"_id": 0})
    if cfg:
        return cfg
    for p in DEFAULT_PLAN_CONFIGS:
        if p["id"] == plan_id:
            return p
    return DEFAULT_PLAN_CONFIGS[0]


async def get_effective_plan(user: dict) -> dict:
    """Return the effective plan config for the user based on subscription/status."""
    plan_id = user.get("plan", "starter")
    status = user.get("plan_status", "free")
    expires = user.get("plan_expires_at")
    # Paid access is granted only by valid, unexpired, supported plan states.
    if user.get("role") == "owner" and plan_id != "starter":
        if status not in ("active", "gifted", "trial", "non_renewing") or not expires:
            plan_id = "starter"
        else:
            try:
                end = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
                if end.tzinfo is None:
                    end = end.replace(tzinfo=timezone.utc)
                if end <= datetime.now(timezone.utc):
                    plan_id = "starter"
            except (ValueError, TypeError):
                plan_id = "starter"
    cfg = await get_plan_config(plan_id)
    return cfg if cfg.get("active", True) else await get_plan_config("starter")


async def check_plan_limit(user: dict, key: str, current_count: int) -> bool:
    cfg = await get_effective_plan(user)
    limit = cfg.get("limits", {}).get(key, 0)
    return current_count < limit


async def require_feature(user: dict, key: str, label: str):
    """Raise 403 if the user's effective plan does not include a boolean feature."""
    cfg = await get_effective_plan(user)
    if not cfg.get("limits", {}).get(key, False):
        raise HTTPException(403, f"{label} is not available on the {cfg.get('name', 'Starter')} plan. Upgrade to unlock it.")


async def enforce_ai_reminder_quota(user: dict):
    """Raise 403 if the owner has used up this month's AI reminder allowance."""
    cfg = await get_effective_plan(user)
    limit = int(cfg.get("limits", {}).get("ai_reminders_per_month", 0))
    month = date.today().isoformat()[:7]
    used = await db.ai_usage.count_documents({"user_id": user["id"], "type": "reminder", "month": month})
    if used >= limit:
        raise HTTPException(403, f"You've used all {limit} AI reminders included in the {cfg.get('name', 'Starter')} plan this month. Upgrade for more.")
    return limit, used


# ---------------- STARTUP ----------------
@app.on_event("startup")
async def on_startup():
    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("role")
        await db.login_attempts.create_index("email", unique=True)
        await db.auth_throttles.create_index("key", unique=True)
        await db.auth_throttles.create_index("until", expireAfterSeconds=0)
        await db.users.create_index("owner_id")
        await db.users.create_index("tenant_id")

        await db.tenants.create_index("user_id")
        await db.tenants.create_index("tenant_user_id")
        await db.tenants.create_index("email")
        await db.tenants.create_index("property_id")

        await db.tenant_invites.create_index("token_hash", unique=True)
        await db.tenant_invites.create_index("email")
        await db.tenant_invites.create_index("owner_id")
        await db.tenant_invites.create_index("tenant_id")
        await db.tenant_invites.create_index("status")

        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("user_id")
        await db.password_reset_tokens.create_index("status")

        await db.conversations.create_index("owner_id")
        await db.conversations.create_index("tenant_id")
        await db.conversations.create_index("tenant_user_id")

        await db.messages.create_index("conversation_id")
        await db.messages.create_index("created_at")

        await db.subscriptions.create_index("owner_id", unique=True)
        await db.subscriptions.create_index("status")

        await db.audit_logs.create_index("admin_id")
        await db.audit_logs.create_index("action")
        await db.audit_logs.create_index("created_at")

        await db.plan_configs.create_index("id", unique=True)

        # Phase 2 indexes
        await db.utility_bills.create_index("owner_id")
        await db.utility_bills.create_index("tenant_id")
        await db.utility_bills.create_index("property_id")
        await db.utility_bills.create_index("bill_type")
        await db.utility_bills.create_index("status")
        await db.bill_payments.create_index("bill_id")
        await db.bill_payments.create_index("owner_id")
        await db.maintenance_complaints.create_index("owner_id")
        await db.maintenance_complaints.create_index("tenant_id")
        await db.maintenance_complaints.create_index("assigned_to_facility_manager_id")
        await db.maintenance_complaints.create_index("status")
        await db.maintenance_complaints.create_index("created_at")
        await db.maintenance_updates.create_index("complaint_id")
        await db.facility_managers.create_index("owner_id")
        await db.facility_managers.create_index("user_id")
        await db.facility_managers.create_index("email")
        await db.facility_manager_invites.create_index("token_hash", unique=True)
        await db.facility_manager_invites.create_index("facility_manager_id")
        await db.support_tickets.create_index("created_by_user_id")
        await db.support_tickets.create_index("status")
        await db.support_tickets.create_index("assigned_support_id")
        await db.support_ticket_messages.create_index("ticket_id")

        await db.expenses.create_index("user_id")
        await db.expenses.create_index("property_id")
        await db.expenses.create_index("incurred_at")

        await db.notification_dismissals.create_index([("user_id", 1), ("key", 1)], unique=True)

        # Scale/pagination compound indexes
        await db.utility_bills.create_index("id")
        await db.utility_bills.create_index([("owner_id", 1), ("property_id", 1), ("tenant_id", 1), ("due_date", 1)])
        await db.utility_bills.create_index([("owner_id", 1), ("property_id", 1), ("bill_type", 1), ("due_date", -1)])
        await db.utility_bills.create_index([("owner_id", 1), ("tenant_id", 1)])
        await db.utility_bills.create_index([("owner_id", 1), ("due_date", 1)])
        await db.utility_bills.create_index([("owner_id", 1), ("created_at", -1)])
        await db.bill_payments.create_index("payment_date")
        await db.payments.create_index([("user_id", 1), ("property_id", 1)])
        await db.payments.create_index("payment_date")
        await db.rent_records.create_index("tenant_id")
        await db.rent_records.create_index("property_id")
        await db.rent_records.create_index([("property_id", 1), ("due_date", -1)])
        await db.rent_records.create_index([("tenant_id", 1), ("due_date", -1)])
        await db.expenses.create_index([("user_id", 1), ("property_id", 1)])
        await db.tenants.create_index([("user_id", 1), ("status", 1)])
        await db.tenants.create_index([("user_id", 1), ("created_at", -1), ("id", 1)])
        await db.properties.create_index("user_id")
    except Exception:
        logger.exception("Failed to create indexes")

    # Seed plan configs (upsert)
    for cfg in DEFAULT_PLAN_CONFIGS:
        exists = await db.plan_configs.find_one({"id": cfg["id"]})
        if not exists:
            await db.plan_configs.insert_one({**cfg, "created_at": now_iso(), "updated_at": now_iso()})

    # Seed admin
    admin_email = os.environ.get("ADMIN_SEED_EMAIL", "").lower()
    admin_pw = os.environ.get("ADMIN_SEED_PASSWORD", "")
    if admin_email and admin_pw:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "id": new_id(),
                "full_name": os.environ.get("ADMIN_SEED_NAME", "FixMyCribs Admin"),
                "email": admin_email,
                "phone": os.environ.get("ADMIN_SEED_PHONE", ""),
                "password_hash": hash_password(admin_pw),
                "role": "admin",
                "account_status": "active",
                "plan": "pro",
                "plan_status": "active",
                "email_verified": True,
                "must_change_password": False,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
            logger.info(f"Seeded admin account: {admin_email}")
        elif existing.get("role") == "admin":
            # Seed variables may manage profile details but NEVER silently reset a password.
            profile = {}
            if os.environ.get("ADMIN_SEED_NAME"):
                profile["full_name"] = os.environ["ADMIN_SEED_NAME"]
            if os.environ.get("ADMIN_SEED_PHONE"):
                profile["phone"] = os.environ["ADMIN_SEED_PHONE"]
            if profile:
                await db.users.update_one({"id": existing["id"]}, {"$set": profile})

    # Backfill defaults on existing user docs
    await db.users.update_many({"role": {"$exists": False}}, {"$set": {"role": "owner"}})
    await db.users.update_many({"account_status": {"$exists": False}}, {"$set": {"account_status": "active"}})
    await db.users.update_many({"plan": {"$exists": False}}, {"$set": {"plan": "starter"}})
    await db.users.update_many({"plan_status": {"$exists": False}}, {"$set": {"plan_status": "free"}})
    # Existing users predate email verification -> treat as already verified so they aren't locked out
    await db.users.update_many({"email_verified": {"$exists": False}}, {"$set": {"email_verified": True}})
    # Backfill new plan feature flags (bills, reports) onto any plan_configs missing them
    for _cfg in DEFAULT_PLAN_CONFIGS:
        for _key in ("bills", "reports"):
            await db.plan_configs.update_one(
                {"id": _cfg["id"], f"limits.{_key}": {"$exists": False}},
                {"$set": {f"limits.{_key}": _cfg["limits"][_key]}},
            )

    # Backfill defaults on existing tenant docs
    await db.tenants.update_many({"apartment_number": {"$exists": False}}, {"$set": {"apartment_number": ""}})
    await db.tenants.update_many({"invite_status": {"$exists": False}}, {"$set": {"invite_status": "not_sent"}})

    # Retention sweep: purge past tenants older than 6 months (best-effort; failures are logged)
    try:
        purged = await purge_expired_past_tenants()
        if purged:
            logger.info(f"[startup] Retention sweep purged {purged} past tenants")
    except Exception as e:
        logger.warning(f"[startup] Retention sweep failed: {e}")

    # Auto-renew recurring rent & service charges, then keep renewing in the background
    try:
        await renew_recurring_charges()
    except Exception as e:
        logger.warning(f"[startup] Initial charge renewal failed: {e}")
    try:
        asyncio.create_task(_renew_loop())
    except Exception as e:
        logger.warning(f"[startup] Could not start renewal loop: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------- MODELS ----------------
class RegisterIn(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = ""
    password: str = Field(..., min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PropertyIn(BaseModel):
    name: str
    type: str
    address: str
    city: str = ""
    state: str = ""
    country: str = "Nigeria"
    status: str = "active"
    notes: str = ""
    capacity_type: str = "occupants"  # occupants | beds | flats | rooms | units
    capacity: int = 0

class UnitIn(BaseModel):
    unit_name: str
    unit_number: Optional[str] = ""
    rent_amount: float
    rent_frequency: str = "monthly"
    status: str = "vacant"

class TenantIn(BaseModel):
    full_name: str
    email: Optional[str] = ""
    phone: str = ""
    whatsapp: Optional[str] = ""
    property_id: str
    unit_id: Optional[str] = None
    apartment_number: str = Field(..., min_length=1)
    rent_amount: float
    rent_frequency: str = "monthly"
    due_date: str
    lease_start: Optional[str] = None
    lease_end: Optional[str] = None
    notes: Optional[str] = ""

class TenantUpdateIn(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    property_id: Optional[str] = None
    unit_id: Optional[str] = None
    apartment_number: Optional[str] = None
    rent_amount: Optional[float] = None
    rent_frequency: Optional[str] = None
    due_date: Optional[str] = None
    lease_start: Optional[str] = None
    lease_end: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class PaymentIn(BaseModel):
    tenant_id: str
    rent_record_id: str
    amount: float
    method: str = "bank_transfer"
    reference: Optional[str] = ""
    payment_date: Optional[str] = None
    notes: Optional[str] = ""

class ReminderGenIn(BaseModel):
    tenant_id: str
    rent_record_id: Optional[str] = None
    tone: str = "polite"

class ReminderLogIn(BaseModel):
    tenant_id: str
    rent_record_id: Optional[str] = None
    message: str
    channel: str = "in_app"
    tone: str = "polite"
    ai_generated: bool = False

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str
    password: str

class VerifyEmailIn(BaseModel):
    token: str

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

class AcceptInviteIn(BaseModel):
    full_name: Optional[str] = None
    password: str
    phone: Optional[str] = None

class MessageIn(BaseModel):
    message: str

class CheckoutIn(BaseModel):
    plan: str  # growth | pro

class MockPaymentConfirmIn(BaseModel):
    reference: str

class AdminGiftIn(BaseModel):
    months: int = 1
    reason: Optional[str] = ""
    plan: Optional[str] = "growth"

class AdminManualUpgradeIn(BaseModel):
    plan: str  # starter/growth/pro
    months: int = 1
    reason: Optional[str] = ""

class AdminUpdateUserIn(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    plan: Optional[str] = None


# ---------------- AUTH ROUTES ----------------
@api_router.post("/auth/register")
async def register(data: RegisterIn):
    """Public registration - creates OWNER accounts only."""
    email = data.email.lower()
    validate_password_strength(data.password)
    existing = await db.users.find_one({"email": email})
    if existing:
        # If existing user is revoked tenant, block reuse but suggest support
        if existing.get("account_status") in ("revoked",) and existing.get("role") == "tenant":
            raise HTTPException(400, "This email was previously used as a tenant. Please contact support to convert your account.")
        raise HTTPException(400, "Email already registered")
    user_id = new_id()
    user_doc = {
        "id": user_id,
        "full_name": data.full_name,
        "email": email,
        "phone": data.phone,
        "password_hash": hash_password(data.password),
        "role": "owner",
        "plan": "starter",
        "plan_status": "free",
        "account_status": "active",
        "email_verified": False,
        "must_change_password": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    dev_link = await _create_email_verification(user_doc)
    token = create_token(user_id)
    resp = {"token": token, "user": strip_private(user_doc), "email_verification_required": True}
    if APP_ENV == "development":
        resp["dev_verification_link"] = dev_link
    return resp

@api_router.post("/auth/login")
async def login(data: LoginIn):
    email = data.email.lower()
    await check_login_lockout(email)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await register_failed_login(email)
        raise HTTPException(401, "Invalid email or password")
    if user.get("account_status", "active") == "suspended":
        raise HTTPException(403, "Your account has been suspended. Contact support.")
    if user.get("account_status", "active") == "revoked":
        raise HTTPException(403, "Your access has been revoked. Contact your landlord or support.")
    await clear_login_attempts(email)
    token = create_token(user["id"], user.get("auth_version", 0))
    return {"token": token, "user": strip_private(user)}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user_soft)):
    return user

@api_router.post("/auth/verify-email")
async def verify_email(data: VerifyEmailIn):
    rec = await db.email_verification_tokens.find_one({"token_hash": sha256_token(data.token)})
    if not rec or rec.get("status") != "pending":
        raise HTTPException(400, "Invalid or expired verification link")
    try:
        exp = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.email_verification_tokens.update_one({"id": rec["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Verification link has expired. Please request a new one.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid verification link")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"email_verified": True, "updated_at": now_iso()}})
    await db.email_verification_tokens.update_one({"id": rec["id"]}, {"$set": {"status": "used", "used_at": now_iso()}})
    # Send a welcome email (from the "hello@" sender) after successful signup verification.
    verified_user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0})
    if verified_user:
        send_email_dev(
            to=verified_user["email"],
            subject="Welcome to FixMyCribs 🎉",
            title=f"You're in, {verified_user.get('full_name','') or 'welcome'}! 🎉",
            cta="Open my dashboard",
            accent="#0ea5e9",
            eyebrow="Welcome aboard",
            preheader="Your account is verified — here's how to get value in 5 minutes.",
            footnote="Need a hand getting set up? Just reply to this email — a real human reads it.",
            body=(
                "Your email is verified and your account is fully unlocked. 🔓\n\n"
                "Here's a great first 5 minutes:\n"
                "• Add your first property and its units\n"
                "• Invite a tenant — they get their own portal\n"
                "• Log rent & bills, then let auto-reminders do the chasing\n\n"
                "Everything lives in one calm dashboard. Let's get your portfolio running on autopilot."
            ),
            link=f"{FRONTEND_URL}/dashboard",
            from_type="welcome",
        )
    return {"ok": True, "message": "Email verified. You now have full access."}

@api_router.post("/auth/resend-verification")
async def resend_verification(user=Depends(get_current_user_soft)):
    await throttle_sensitive_action("verify", user["id"], 120)
    if user.get("email_verified"):
        return {"ok": True, "message": "Email already verified"}
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    dev_link = await _create_email_verification(full)
    resp = {"ok": True, "message": "Verification email sent. Check your inbox."}
    if APP_ENV == "development":
        resp["dev_verification_link"] = dev_link
    return resp

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordIn):
    email = data.email.lower()
    await throttle_sensitive_action("password_reset", email, 90)
    user = await db.users.find_one({"email": email})
    generic_msg = {"ok": True, "message": "If this email exists, a reset link has been sent."}
    if not user or user.get("account_status") != "active":
        return generic_msg
    raw = create_secure_token()
    token_doc = {
        "id": new_id(),
        "user_id": user["id"],
        "email": email,
        "token_hash": sha256_token(raw),
        "status": "pending",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        "used_at": None,
        "created_at": now_iso(),
    }
    await db.password_reset_tokens.insert_one(token_doc)
    link = f"{FRONTEND_URL}/reset-password/{raw}"
    send_email_dev(
        to=email,
        subject="Reset your FixMyCribs password",
        title="Let's reset your password",
        cta="Choose a new password",
        accent="#f59e0b",
        eyebrow="Security",
        preheader="A password reset was requested for your FixMyCribs account.",
        footnote="This link expires in 2 hours and can only be used once. Didn't request it? Ignore this email and your password stays unchanged.",
        body=(
            f"Hi {user.get('full_name','') or 'there'},\n\n"
            f"We received a request to reset the password for your FixMyCribs account. "
            f"Tap the button below to set a new one.\n\n"
            f"For your security, choose a strong password with upper &amp; lower case letters, a number and a symbol."
        ),
        link=link,
        from_type="noreply",
    )
    if APP_ENV == "development":
        return {**generic_msg, "dev_link": link}
    return generic_msg

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordIn):
    validate_password_strength(data.password)
    token_hash = sha256_token(data.token)
    rec = await db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    if rec.get("status") != "pending":
        raise HTTPException(400, "This reset link has already been used")
    try:
        exp = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.password_reset_tokens.update_one({"id": rec["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Reset link has expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid reset link")
    user = await db.users.find_one({"id": rec["user_id"]})
    if not user:
        raise HTTPException(400, "User not found")
    consumed = await db.password_reset_tokens.update_one(
        {"id": rec["id"], "status": "pending"}, {"$set": {"status": "used", "used_at": now_iso()}})
    if consumed.modified_count != 1:
        raise HTTPException(400, "This reset link has already been used")
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"password_hash": hash_password(data.password), "updated_at": now_iso()},
        "$inc": {"auth_version": 1},
    })
    await log_action(user, "password_reset", "user", user["id"])
    return {"ok": True, "message": "Password updated. You can now log in."}

@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user=Depends(get_current_user)):
    validate_password_strength(data.new_password)
    stored = await db.users.find_one({"id": user["id"]})
    if not stored or not verify_password(data.current_password, stored["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"password_hash": hash_password(data.new_password), "must_change_password": False, "updated_at": now_iso()},
        "$inc": {"auth_version": 1},
    })
    await log_action(user, "password_changed", "user", user["id"])
    return {"ok": True, "message": "Password updated"}


@api_router.post("/admin/email/test")
async def admin_test_email(user=Depends(get_current_user)):
    """Admin-only test of transactional email transport. Sends to the logged-in admin."""
    require_roles(user, ["admin"])
    if not _transactional_email_ready():
        raise HTTPException(503, "Configure Resend HTTPS or SMTP email variables")
    from_name = os.environ.get("EMAIL_FROM_NAME", "FixMyCribs")
    if os.environ.get("RESEND_API_KEY") and os.environ.get("EMAIL_FROM"):
        try:
            message_id = await asyncio.to_thread(
                _resend_send_sync, user["email"], "FixMyCribs email test",
                "Email delivery configuration is operational.",
                "<p>FixMyCribs email delivery configuration is operational.</p>",
                os.environ["EMAIL_FROM"], from_name,
            )
            return {"ok": True, "provider": "resend", "message_id": message_id}
        except Exception:
            logger.exception("Admin email delivery test failed")
            raise HTTPException(502, "Email provider rejected the test. Check Railway logs")
    try:
        await asyncio.to_thread(_smtp_send_sync, user["email"], "FixMyCribs email test",
            "Email delivery configuration is operational.",
            "<p>FixMyCribs email delivery configuration is operational.</p>",
            os.environ.get("SMTP_FROM_EMAIL") or os.environ["SMTP_USERNAME"], from_name)
    except Exception:
        raise HTTPException(502, "SMTP test failed. Check Railway logs")
    return {"ok": True, "provider": "smtp", "note": "Check Railway logs for SMTP confirmation"}


# ---------------- PAYSTACK GATEWAY ----------------
def _paystack_key() -> str:
    key = os.environ.get("PAYSTACK_SECRET_KEY", "")
    if not key:
        raise HTTPException(503, "Payment gateway is not configured")
    # Prevent test transactions from unlocking paid plans in production.
    if APP_ENV == "production" and not key.startswith("sk_live_"):
        raise HTTPException(503, "A live Paystack key is required in production")
    return key


def _paystack_request_sync(method: str, path: str, body=None):
    import requests
    key = _paystack_key()
    try:
        response = requests.request(method, "https://api.paystack.co" + path,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body, timeout=25)
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") is not True:
            raise ValueError("Paystack declined the operation")
        return payload.get("data") or {}
    except Exception:
        logger.exception("Paystack API request failed (%s %s)", method, path.split("?")[0])
        raise HTTPException(502, "Payment gateway is unavailable. Please try again")


async def _complete_paystack_payment(reference: str, owner_id: str = None):
    """Verify independently, match price/currency/customer, and activate once per charge."""
    if not re.fullmatch(r"[A-Za-z0-9.=_-]{1,110}", reference or ""):
        raise HTTPException(400, "Invalid payment reference")
    session = await db.payment_sessions.find_one({"reference": reference, "provider": "paystack"})
    if not session or (owner_id and session.get("owner_id") != owner_id):
        raise HTTPException(404, "Payment session not found")
    if session.get("status") == "paid":
        return {"ok": True, "status": "already_paid", "plan": session["plan"]}
    if session.get("status") != "pending":
        raise HTTPException(409, "Payment is already being processed or is unavailable")
    paid = await asyncio.to_thread(_paystack_request_sync, "GET", f"/transaction/verify/{reference}")
    owner = await db.users.find_one({"id": session["owner_id"], "role": "owner"})
    buyer = (paid.get("customer") or {}).get("email", "").lower()
    if (not owner or paid.get("reference") != reference or paid.get("status") != "success"
            or paid.get("currency") != "NGN"
            or int(paid.get("amount") or 0) != session.get("amount_kobo")
            or buyer != owner.get("email", "").lower()):
        raise HTTPException(400, "Payment is pending or does not match the checkout")
    domain = paid.get("domain", "")
    key = _paystack_key()
    if (key.startswith("sk_live_") and domain != "live") or (key.startswith("sk_test_") and domain != "test"):
        raise HTTPException(400, "Payment environment mismatch")
    # Atomic claim protects against concurrent webhook + browser verification.
    claimed = await db.payment_sessions.find_one_and_update(
        {"id": session["id"], "status": "pending"}, {"$set": {"status": "processing"}})
    if not claimed:
        return {"ok": True, "status": "processing", "plan": session["plan"]}
    try:
        now = datetime.now(timezone.utc)
        expiry = (now + timedelta(days=30)).isoformat()
        sub_doc = {
            "id": new_id(), "owner_id": owner["id"], "plan": session["plan"],
            "status": "active", "payment_provider": "paystack",
            "provider_customer_id": str((paid.get("customer") or {}).get("customer_code") or ""),
            "provider_subscription_id": reference,
            "current_period_start": now.isoformat(), "current_period_end": expiry,
            "cancelled_at": None, "created_at": now_iso(), "updated_at": now_iso(),
            "auto_renews": False,
        }
        await db.subscriptions.update_one({"owner_id": owner["id"]}, {"$set": sub_doc}, upsert=True)
        await db.users.update_one({"id": owner["id"]}, {"$set": {
            "plan": session["plan"], "plan_status": "active",
            "plan_started_at": now.isoformat(), "plan_expires_at": expiry,
            "updated_at": now_iso()}})
        await db.payment_sessions.update_one({"id": session["id"]}, {"$set": {
            "status": "paid", "paid_at": now.isoformat(),
            "provider_transaction_id": str(paid.get("id") or "")}})
    except Exception:
        logger.exception("Payment fulfillment incomplete; manual reconciliation required: %s", reference)
        # Leave processing status for manual review; never auto-credit twice.
        raise
    return {"ok": True, "status": "paid", "plan": session["plan"], "expires_at": expiry}


@api_router.post("/subscriptions/verify/{reference}")
async def verify_subscription_payment(reference: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    return await _complete_paystack_payment(reference, owner_id=user["id"])


@api_router.post("/webhooks/paystack")
async def paystack_webhook(request: Request):
    import hmac
    body = await request.body()
    key = _paystack_key()
    signature = request.headers.get("x-paystack-signature", "")
    digest = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(signature, digest):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        event = _json.loads(body)
    except ValueError:
        raise HTTPException(400, "Invalid event JSON")
    if event.get("event") != "charge.success":
        return {"ok": True, "ignored": True}
    reference = (event.get("data") or {}).get("reference")
    if not isinstance(reference, str):
        return {"ok": True, "ignored": True}
    # Only recognize checkouts created by our backend: unknown events cannot grant access.
    session = await db.payment_sessions.find_one({"reference": reference, "provider": "paystack"})
    if not session:
        return {"ok": True, "ignored": True}
    return await _complete_paystack_payment(reference)


# ---------------- PLAN / SUBSCRIPTION ROUTES ----------------
@api_router.get("/plans")
async def get_plans():
    plans = await db.plan_configs.find({"active": True}, {"_id": 0}).sort("price", 1).to_list(5000000)
    if not plans:
        plans = DEFAULT_PLAN_CONFIGS
    # add flat limit fields for backward compat
    for p in plans:
        for k, v in (p.get("limits") or {}).items():
            p.setdefault(k, v)
    return plans

@api_router.get("/subscriptions/current")
async def current_subscription(user=Depends(get_current_user)):
    if user["role"] != "owner":
        # Non-owners have no subscription concept
        return {"plan": user.get("plan", "starter"), "plan_status": "free", "limits": (await get_effective_plan(user)).get("limits", {})}
    cfg = await get_effective_plan(user)
    sub = await db.subscriptions.find_one({"owner_id": user["id"]}, {"_id": 0})
    effective_id = cfg.get("id", "starter")
    return {
        "plan": effective_id,
        "plan_status": user.get("plan_status", "free") if effective_id != "starter" else "free",
        "plan_started_at": user.get("plan_started_at"),
        "plan_expires_at": user.get("plan_expires_at"),
        "gifted_until": user.get("gifted_until"),
        "limits": cfg.get("limits", {}),
        "features": cfg.get("features", []),
        "subscription": sub,
        "payment_provider": os.environ.get("PAYMENT_PROVIDER", "paystack" if APP_ENV == "production" else "mock"),
    }

@api_router.post("/subscriptions/checkout")
async def create_checkout(data: CheckoutIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    if data.plan not in ("growth", "pro"):
        raise HTTPException(400, "Only paid plans (growth, pro) can be checked out")
    cfg = await get_plan_config(data.plan)
    if not cfg.get("active", True):
        raise HTTPException(400, "Plan is not currently available")
    amount_ngn = cfg.get("price", 0)
    if not isinstance(amount_ngn, (int, float)) or amount_ngn < 100 or round(amount_ngn * 100) != amount_ngn * 100:
        raise HTTPException(503, "Plan price is not configured correctly")
    payment_provider = os.environ.get("PAYMENT_PROVIDER", "paystack" if APP_ENV == "production" else "mock")
    if payment_provider not in ("paystack", "mock") or (APP_ENV == "production" and payment_provider != "paystack"):
        raise HTTPException(503, "A real payment provider must be configured before checkout")
    if payment_provider == "paystack":
        _paystack_key()
    reference = ("fmc_" if payment_provider == "paystack" else "mock_") + new_id().replace("-", "")
    session = {
        "id": new_id(), "reference": reference, "owner_id": user["id"],
        "plan": data.plan, "amount": amount_ngn,
        "amount_kobo": int(round(amount_ngn * 100)), "currency": "NGN",
        "status": "pending", "provider": payment_provider, "created_at": now_iso(),
    }
    await db.payment_sessions.insert_one(session)
    if payment_provider == "paystack":
        try:
            provider_data = await asyncio.to_thread(_paystack_request_sync, "POST", "/transaction/initialize", {
                "email": user["email"], "amount": session["amount_kobo"], "currency": "NGN",
                "reference": reference,
                "callback_url": f"{FRONTEND_URL.rstrip('/')}/dashboard/billing?reference={reference}",
                "metadata": {"app": "fixmycribs", "plan": data.plan},
            })
            checkout_url = provider_data["authorization_url"]
        except Exception:
            await db.payment_sessions.update_one({"id": session["id"]}, {"$set": {"status": "failed"}})
            raise
    else:
        checkout_url = f"{FRONTEND_URL}/mock-checkout?ref={reference}"
    return {"checkout_url": checkout_url, "reference": reference,
            "provider": payment_provider, "plan": data.plan, "amount": amount_ngn}

@api_router.get("/subscriptions/checkout/{reference}")
async def get_checkout(reference: str, user=Depends(get_current_user)):
    session = await db.payment_sessions.find_one({"reference": reference, "owner_id": user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Checkout not found")
    return session

@api_router.post("/subscriptions/mock-confirm")
async def mock_confirm(data: MockPaymentConfirmIn, user=Depends(get_current_user)):
    """Mock payment confirmation. Disabled in production regardless of client state."""
    if APP_ENV == "production" or os.environ.get("PAYMENT_PROVIDER", "mock") != "mock":
        raise HTTPException(403, "Simulated payments are disabled")
    session = await db.payment_sessions.find_one({"reference": data.reference, "owner_id": user["id"]})
    if not session:
        raise HTTPException(404, "Checkout session not found")
    if session.get("status") == "paid":
        return {"ok": True, "status": "already_paid"}
    plan = session["plan"]
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)
    await db.payment_sessions.update_one({"id": session["id"]}, {"$set": {"status": "paid", "paid_at": now_iso()}})
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "plan": plan,
        "plan_status": "active",
        "plan_started_at": now.isoformat(),
        "plan_expires_at": expires.isoformat(),
        "updated_at": now_iso(),
    }})
    sub_doc = {
        "id": new_id(),
        "owner_id": user["id"],
        "plan": plan,
        "status": "active",
        "payment_provider": session.get("provider", "mock"),
        "provider_customer_id": "",
        "provider_subscription_id": data.reference,
        "current_period_start": now.isoformat(),
        "current_period_end": expires.isoformat(),
        "cancelled_at": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.subscriptions.update_one(
        {"owner_id": user["id"]},
        {"$set": sub_doc},
        upsert=True,
    )
    return {"ok": True, "status": "paid", "plan": plan, "expires_at": expires.isoformat()}


# ---------------- PROPERTIES ----------------
@api_router.get("/properties")
async def list_properties(user=Depends(get_current_user)):
    require_roles(user, ["owner", "facility_manager"])
    owner_id = await resolve_owner_id(user)
    items = await db.properties.find({"user_id": owner_id}, {"_id": 0}).to_list(5000000)
    for p in items:
        p["tenant_count"] = await db.tenants.count_documents({"property_id": p["id"], "status": {"$ne": "archived"}})
        p["active_tenant_count"] = await db.tenants.count_documents({"property_id": p["id"], "status": "active"})
        p["unit_count"] = await db.units.count_documents({"property_id": p["id"]})
        cap = p.get("capacity") or 0
        p.setdefault("capacity_type", "occupants")
        p["occupancy_pct"] = round(min(100.0, (p["active_tenant_count"] / cap) * 100), 1) if cap > 0 else None
    return items

@api_router.post("/properties")
async def create_property(data: PropertyIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    count = await db.properties.count_documents({"user_id": user["id"]})
    if not await check_plan_limit(user, "properties", count):
        cfg = await get_effective_plan(user)
        raise HTTPException(403, f"Plan limit reached ({cfg['limits']['properties']} properties). Upgrade to add more.")
    doc = {"id": new_id(), "user_id": user["id"], **data.model_dump(), "created_at": now_iso()}
    await db.properties.insert_one(doc)
    return strip_private(doc)

@api_router.get("/properties/{pid}")
async def get_property(pid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    p = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    p["units"] = await db.units.find({"property_id": pid}, {"_id": 0}).to_list(5000000)
    p["tenants"] = await db.tenants.find({"property_id": pid}, {"_id": 0}).to_list(5000000)
    active = len([t for t in p["tenants"] if t.get("status") == "active"])
    cap = p.get("capacity") or 0
    p.setdefault("capacity_type", "occupants")
    p["active_tenant_count"] = active
    p["occupancy_pct"] = round(min(100.0, (active / cap) * 100), 1) if cap > 0 else None
    return p

@api_router.patch("/properties/{pid}")
async def update_property(pid: str, data: PropertyIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    r = await db.properties.update_one({"id": pid, "user_id": user["id"]}, {"$set": data.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

@api_router.delete("/properties/{pid}")
async def delete_property(pid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await db.properties.delete_one({"id": pid, "user_id": user["id"]})
    await db.units.delete_many({"property_id": pid})
    return {"ok": True}


# ---------------- UNITS ----------------
@api_router.post("/properties/{pid}/units")
async def create_unit(pid: str, data: UnitIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    p = await db.properties.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(404, "Property not found")
    doc = {"id": new_id(), "property_id": pid, **data.model_dump(), "created_at": now_iso()}
    await db.units.insert_one(doc)
    return strip_private(doc)

@api_router.get("/properties/{pid}/units")
async def list_units(pid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    return await db.units.find({"property_id": pid}, {"_id": 0}).to_list(5000000)

@api_router.delete("/units/{uid}")
async def delete_unit(uid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await db.units.delete_one({"id": uid})
    return {"ok": True}


# ---------------- TENANTS ----------------
async def _generate_rent_record(tenant: dict):
    rec = {
        "id": new_id(),
        "user_id": tenant["user_id"],
        "tenant_id": tenant["id"],
        "property_id": tenant["property_id"],
        "unit_id": tenant.get("unit_id"),
        "amount_due": tenant["rent_amount"],
        "amount_paid": 0.0,
        "balance": tenant["rent_amount"],
        "due_date": tenant["due_date"],
        "paid_date": None,
        "status": compute_status(tenant["due_date"], tenant["rent_amount"], 0),
        "rent_period_start": tenant.get("lease_start"),
        "rent_period_end": tenant.get("lease_end"),
        "frequency": tenant.get("rent_frequency", "monthly"),
        "created_at": now_iso(),
    }
    await db.rent_records.insert_one(rec)
    return rec


import re as _re

_last_renew_at = None  # throttle for lazy renewal


async def renew_recurring_charges() -> dict:
    """Automatically generate the next rent record / recurring bill once a cycle
    has elapsed, so landlords are reminded (via notifications) when the next
    rent or service charge becomes due. Idempotent and catch-up safe."""
    today = date.today()
    rent_created = 0
    bill_created = 0

    # ---- Rent renewal (per active tenant) ----
    tenants = await db.tenants.find({"status": "active"}, {"_id": 0}).to_list(5000000)
    tenant_active = {t["id"]: t for t in tenants}
    for t in tenants:
        freq = (t.get("rent_frequency") or "monthly").lower()
        if freq not in RECURRING_FREQS:
            continue
        latest = await db.rent_records.find_one({"tenant_id": t["id"]}, {"_id": 0}, sort=[("due_date", -1)])
        if not latest:
            continue
        try:
            due = parse_date(latest["due_date"])
        except Exception:
            continue
        guard = 0
        while guard < 60:
            nxt = advance_date(due, freq)
            if nxt is None or nxt > today:
                break
            exists = await db.rent_records.find_one({"tenant_id": t["id"], "due_date": nxt.isoformat()})
            if not exists:
                amount = float(t.get("rent_amount") or 0)
                await db.rent_records.insert_one({
                    "id": new_id(),
                    "user_id": t["user_id"],
                    "tenant_id": t["id"],
                    "property_id": t["property_id"],
                    "unit_id": t.get("unit_id"),
                    "amount_due": amount,
                    "amount_paid": 0.0,
                    "balance": amount,
                    "due_date": nxt.isoformat(),
                    "paid_date": None,
                    "status": compute_status(nxt.isoformat(), amount, 0),
                    "rent_period_start": nxt.isoformat(),
                    "rent_period_end": (advance_date(nxt, freq) or nxt).isoformat(),
                    "frequency": freq,
                    "auto_generated": True,
                    "created_at": now_iso(),
                })
                rent_created += 1
            due = nxt
            guard += 1

    # ---- Recurring bill renewal (service charge, diesel, etc. with a frequency) ----
    rec_bills = await db.utility_bills.find({"frequency": {"$in": list(RECURRING_FREQS)}}, {"_id": 0}).to_list(5000000)
    # keep the latest bill per (tenant_id, bill_type)
    groups = {}
    for b in rec_bills:
        key = (b["tenant_id"], b.get("bill_type"))
        cur = groups.get(key)
        if not cur or str(b.get("due_date", "")) > str(cur.get("due_date", "")):
            groups[key] = b
    for (tid, btype), b in groups.items():
        if tid not in tenant_active:  # skip archived/inactive tenants
            continue
        freq = (b.get("frequency") or "").lower()
        if freq not in RECURRING_FREQS:
            continue
        try:
            due = parse_date(b["due_date"])
        except Exception:
            continue
        base_title = _re.sub(r"\s*\(\d+/\d+\)\s*$", "", b.get("title", "") or "").strip() or btype.replace("_", " ").title()
        guard = 0
        while guard < 60:
            nxt = advance_date(due, freq)
            if nxt is None or nxt > today:
                break
            exists = await db.utility_bills.find_one({"tenant_id": tid, "bill_type": btype, "due_date": nxt.isoformat(), "frequency": freq})
            if not exists:
                amount = float(b.get("amount_due") or b.get("fixed_amount") or 0)
                await db.utility_bills.insert_one({
                    "id": new_id(),
                    "owner_id": b.get("owner_id"),
                    "tenant_id": tid,
                    "tenant_user_id": b.get("tenant_user_id"),
                    "property_id": b.get("property_id"),
                    "unit_id": b.get("unit_id"),
                    "apartment_number": b.get("apartment_number", ""),
                    "bill_type": btype,
                    "title": base_title,
                    "description": b.get("description", ""),
                    "billing_period_start": None,
                    "billing_period_end": None,
                    "previous_reading": 0.0,
                    "current_reading": 0.0,
                    "units_consumed": 0.0,
                    "rate": b.get("rate", 0),
                    "fixed_amount": amount,
                    "amount_due": amount,
                    "amount_paid": 0.0,
                    "balance": amount,
                    "status": compute_bill_status(nxt.isoformat(), amount, 0) if "compute_bill_status" in globals() else compute_status(nxt.isoformat(), amount, 0),
                    "due_date": nxt.isoformat(),
                    "frequency": freq,
                    "auto_generated": True,
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                })
                bill_created += 1
            due = nxt
            guard += 1

    if rent_created or bill_created:
        logger.info(f"[renew] Generated {rent_created} rent record(s), {bill_created} recurring bill(s)")
    return {"rent_created": rent_created, "bill_created": bill_created}


async def renew_recurring_charges_throttled(min_interval_seconds: int = 3600):
    """Run renewal at most once per interval (used lazily on notification fetch)."""
    global _last_renew_at
    now = datetime.now(timezone.utc)
    if _last_renew_at and (now - _last_renew_at).total_seconds() < min_interval_seconds:
        return
    _last_renew_at = now
    try:
        await renew_recurring_charges()
    except Exception:
        logger.exception("[renew] throttled renewal failed")


async def _renew_loop():
    """Background task: renew recurring charges every 6 hours."""
    while True:
        try:
            await renew_recurring_charges()
        except Exception:
            logger.exception("[renew] background renewal failed")
        await asyncio.sleep(6 * 3600)


async def _create_tenant_invite(owner: dict, tenant: dict) -> Optional[dict]:
    """Create an invite, mark tenant, log an email in dev."""
    if not tenant.get("email"):
        return None
    # revoke old pending invites for this tenant
    await db.tenant_invites.update_many(
        {"tenant_id": tenant["id"], "status": "pending"},
        {"$set": {"status": "revoked"}},
    )
    raw = create_secure_token()
    invite = {
        "id": new_id(),
        "token_hash": sha256_token(raw),
        "email": tenant["email"].lower(),
        "owner_id": owner["id"],
        "tenant_id": tenant["id"],
        "role": "tenant",
        "status": "pending",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "accepted_at": None,
        "created_at": now_iso(),
    }
    await db.tenant_invites.insert_one(invite)
    await db.tenants.update_one({"id": tenant["id"]}, {"$set": {"invite_status": "sent", "updated_at": now_iso()}})
    prop = await db.properties.find_one({"id": tenant["property_id"]}, {"_id": 0}) or {}
    link = f"{FRONTEND_URL}/invite/{raw}"
    send_email_dev(
        to=tenant["email"],
        subject="You have been invited to access your tenant portal",
        body=(
            f"Hello {tenant['full_name']},\n\n"
            f"{owner['full_name']} has invited you to access your FixMyCribs tenant portal for:\n\n"
            f"Property: {prop.get('name','')}\n"
            f"Apartment/Unit: {tenant.get('apartment_number','')}\n\n"
            f"Use the secure link below to create your password and access your tenant dashboard:\n\n"
            f"{link}\n\n"
            f"This link expires in 7 days.\n\nThank you,\nFixMyCribs"
        ),
        link=link,
    )
    return {"invite_id": invite["id"], "invite_link": link if APP_ENV == "development" else None}


@api_router.get("/tenants")
async def list_tenants(
    page: Optional[int] = None,
    page_size: int = 25,
    q: Optional[str] = None,
    property_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    require_roles(user, ["owner"])
    query: Dict[str, Any] = {"user_id": user["id"], "status": {"$nin": ["archived", "access_revoked"]}}
    if property_id and property_id != "all":
        query["property_id"] = property_id
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}, {"phone": rx}, {"apartment_number": rx}]

    async def enrich(items):
        if not items:
            return items
        tenant_ids = [t["id"] for t in items]
        prop_ids = list({t.get("property_id") for t in items if t.get("property_id")})
        # One query for all property names
        prop_map = {p["id"]: p.get("name", "-") async for p in
                    db.properties.find({"id": {"$in": prop_ids}}, {"_id": 0, "id": 1, "name": 1})}
        # One aggregation for the latest rent record per tenant
        latest_map: Dict[str, Any] = {}
        async for d in db.rent_records.aggregate([
            {"$match": {"tenant_id": {"$in": tenant_ids}}},
            {"$sort": {"due_date": -1}},
            {"$group": {"_id": "$tenant_id", "rec": {"$first": "$$ROOT"}}},
        ]):
            rec = d["rec"]
            rec.pop("_id", None)
            latest_map[d["_id"]] = rec
        for t in items:
            latest = latest_map.get(t["id"])
            if latest:
                latest["status"] = compute_status(latest["due_date"], latest["amount_due"], latest["amount_paid"])
                t["current_rent"] = latest
            t["property_name"] = prop_map.get(t.get("property_id"), "-")
        return items

    # Legacy mode (no pagination) — return a plain array for existing consumers.
    if page is None:
        items = await db.tenants.find(query, {"_id": 0}).to_list(5000000)
        return await enrich(items)

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    total = await db.tenants.count_documents(query)
    items = await db.tenants.find(query, {"_id": 0}).sort([("created_at", -1), ("id", 1)]).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    items = await enrich(items)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


PAST_TENANT_RETENTION_MONTHS = 6


async def purge_expired_past_tenants():
    """Permanently delete archived/access_revoked tenants older than PAST_TENANT_RETENTION_MONTHS.

    Also cleans up related rent_records, payments, utility_bills, bill_payments,
    and maintenance_complaints so old history doesn't linger in DB.
    Users' tenant portal accounts are preserved (already revoked) so they can be
    re-invited later if needed.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=PAST_TENANT_RETENTION_MONTHS * 30)).isoformat()
    # Match tenants that are past + either have an archived_at older than cutoff
    # OR have no archived_at at all but were last updated before cutoff (legacy rows).
    q = {
        "status": {"$in": ["archived", "access_revoked"]},
        "$or": [
            {"archived_at": {"$lt": cutoff}},
            {"archived_at": {"$exists": False}, "updated_at": {"$lt": cutoff}},
        ],
    }
    expired = await db.tenants.find(q, {"_id": 0, "id": 1}).to_list(5000000)
    if not expired:
        return 0
    tenant_ids = [t["id"] for t in expired]
    await db.rent_records.delete_many({"tenant_id": {"$in": tenant_ids}})
    await db.payments.delete_many({"tenant_id": {"$in": tenant_ids}})
    await db.utility_bills.delete_many({"tenant_id": {"$in": tenant_ids}})
    await db.bill_payments.delete_many({"tenant_id": {"$in": tenant_ids}})
    await db.maintenance_complaints.delete_many({"tenant_id": {"$in": tenant_ids}})
    await db.tenants.delete_many({"id": {"$in": tenant_ids}})
    logger.info(f"[retention] Permanently purged {len(tenant_ids)} past tenants older than {PAST_TENANT_RETENTION_MONTHS} months")
    return len(tenant_ids)


@api_router.get("/tenants/archived")
async def list_archived_tenants(user=Depends(get_current_user)):
    """Past tenants (archived or access_revoked). Kept separate from active tenants.

    Runs a lightweight retention sweep so anything older than 6 months is purged.
    """
    require_roles(user, ["owner"])
    await purge_expired_past_tenants()
    items = await db.tenants.find({"user_id": user["id"], "status": {"$in": ["archived", "access_revoked"]}}, {"_id": 0}).to_list(5000000)
    for t in items:
        prop = await db.properties.find_one({"id": t["property_id"]}, {"_id": 0, "name": 1})
        t["property_name"] = prop["name"] if prop else "-"
        # totals
        recs = await db.rent_records.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(5000000)
        t["rent_expected"] = sum(r["amount_due"] for r in recs)
        t["rent_paid"] = sum(r["amount_paid"] for r in recs)
        bills = await db.utility_bills.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(5000000)
        t["bills_expected"] = sum(b["amount_due"] for b in bills)
        t["bills_paid"] = sum(b["amount_paid"] for b in bills)
        t["total_outstanding"] = max(0.0, (t["rent_expected"] - t["rent_paid"]) + (t["bills_expected"] - t["bills_paid"]))
        # Retention: compute the ISO purge date + days remaining
        arch = t.get("archived_at") or t.get("updated_at")
        if arch:
            try:
                arch_dt = datetime.fromisoformat(arch.replace("Z", "+00:00"))
                purge_dt = arch_dt + timedelta(days=PAST_TENANT_RETENTION_MONTHS * 30)
                t["purge_at"] = purge_dt.isoformat()
                t["days_until_purge"] = max(0, (purge_dt - datetime.now(timezone.utc)).days)
            except Exception:
                t["days_until_purge"] = None
        else:
            t["days_until_purge"] = None
    return items


@api_router.get("/tenants/archived/{tid}")
async def get_archived_tenant(tid: str, user=Depends(get_current_user)):
    """Full history of a past tenant — rent records, payments, bills, complaints."""
    require_roles(user, ["owner"])
    t = await db.tenants.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    if t.get("status") not in ("archived", "access_revoked"):
        raise HTTPException(400, "Tenant is still active; use /api/tenants/{id}")
    t["rent_records"] = await db.rent_records.find({"tenant_id": tid}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    for r in t["rent_records"]:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
    t["payments"] = await db.payments.find({"tenant_id": tid}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    t["bills"] = await db.utility_bills.find({"tenant_id": tid}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    t["bill_payments"] = await db.bill_payments.find({"tenant_id": tid}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    t["complaints"] = await db.maintenance_complaints.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(5000000)
    prop = await db.properties.find_one({"id": t["property_id"]}, {"_id": 0})
    t["property"] = prop
    return t

@api_router.post("/tenants")
async def create_tenant(data: TenantIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    count = await db.tenants.count_documents({"user_id": user["id"], "status": {"$ne": "archived"}})
    if not await check_plan_limit(user, "tenants", count):
        cfg = await get_effective_plan(user)
        raise HTTPException(403, f"Plan limit reached ({cfg['limits']['tenants']} tenants). Upgrade to add more.")
    if not (data.apartment_number or "").strip():
        raise HTTPException(400, "apartment_number is required")
    p = await db.properties.find_one({"id": data.property_id, "user_id": user["id"]})
    if not p:
        raise HTTPException(400, "Invalid property")
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "tenant_user_id": None,
        **data.model_dump(),
        "status": "active",
        "invite_status": "not_sent",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if doc.get("email"):
        doc["email"] = doc["email"].lower()
    await db.tenants.insert_one(doc)
    doc = strip_private(doc)
    await _generate_rent_record(doc)
    invite_result = None
    if data.email:
        invite_result = await _create_tenant_invite(user, doc)
    if invite_result:
        doc["invite_link"] = invite_result.get("invite_link")
        doc["invite_status"] = "sent"
    return doc

@api_router.get("/tenants/{tid}")
async def get_tenant(tid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    t = await db.tenants.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    t["rent_records"] = await db.rent_records.find({"tenant_id": tid}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    for r in t["rent_records"]:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
    t["payments"] = await db.payments.find({"tenant_id": tid}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    prop = await db.properties.find_one({"id": t["property_id"]}, {"_id": 0})
    t["property"] = prop
    return t

@api_router.patch("/tenants/{tid}")
async def update_tenant(tid: str, data: TenantUpdateIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    existing = await db.tenants.find_one({"id": tid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(404, "Not found")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in updates and updates["email"]:
        updates["email"] = updates["email"].lower()
    updates["updated_at"] = now_iso()
    await db.tenants.update_one({"id": tid, "user_id": user["id"]}, {"$set": updates})
    return {"ok": True}

@api_router.post("/tenants/{tid}/resend-invite")
async def resend_invite(tid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    tenant = await db.tenants.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Not found")
    if not tenant.get("email"):
        raise HTTPException(400, "Tenant has no email address")
    if tenant.get("tenant_user_id"):
        raise HTTPException(400, "Tenant has already accepted the invite")
    result = await _create_tenant_invite(user, tenant)
    return {"ok": True, "invite_link": result.get("invite_link") if result else None}

@api_router.post("/tenants/{tid}/revoke-access")
async def revoke_tenant_access(tid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    tenant = await db.tenants.find_one({"id": tid, "user_id": user["id"]})
    if not tenant:
        raise HTTPException(404, "Not found")
    await db.tenants.update_one({"id": tid}, {"$set": {
        "status": "access_revoked",
        "invite_status": "revoked",
        "archived_at": now_iso(),
        "updated_at": now_iso(),
    }})
    await db.tenant_invites.update_many({"tenant_id": tid, "status": "pending"}, {"$set": {"status": "revoked"}})
    if tenant.get("tenant_user_id"):
        await db.users.update_one({"id": tenant["tenant_user_id"]}, {"$set": {"account_status": "revoked", "updated_at": now_iso()}})
    await log_action(user, "revoke_tenant_access", "tenant", tid)
    return {"ok": True}

@api_router.delete("/tenants/{tid}")
async def delete_tenant(tid: str, user=Depends(get_current_user)):
    """Soft-delete: archive tenant and revoke access. Preserves history."""
    require_roles(user, ["owner"])
    tenant = await db.tenants.find_one({"id": tid, "user_id": user["id"]})
    if not tenant:
        raise HTTPException(404, "Not found")
    await db.tenants.update_one({"id": tid}, {"$set": {
        "status": "archived",
        "invite_status": "revoked",
        "archived_at": now_iso(),
        "updated_at": now_iso(),
    }})
    await db.tenant_invites.update_many({"tenant_id": tid, "status": "pending"}, {"$set": {"status": "revoked"}})
    if tenant.get("tenant_user_id"):
        await db.users.update_one({"id": tenant["tenant_user_id"]}, {"$set": {"account_status": "revoked", "updated_at": now_iso()}})
    await log_action(user, "archive_tenant", "tenant", tid)
    return {"ok": True}


# ---------------- INVITE ACCEPT (PUBLIC) ----------------
@api_router.get("/invites/{token}")
async def get_invite(token: str):
    token_hash = sha256_token(token)
    invite = await db.tenant_invites.find_one({"token_hash": token_hash}, {"_id": 0})
    if not invite:
        raise HTTPException(404, "Invite not found or invalid")
    if invite["status"] != "pending":
        raise HTTPException(400, f"This invite is {invite['status']}")
    try:
        exp = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.tenant_invites.update_one({"id": invite["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Invite has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    tenant = await db.tenants.find_one({"id": invite["tenant_id"]}, {"_id": 0}) or {}
    landlord = await db.users.find_one({"id": invite["owner_id"]}, {"_id": 0}) or {}
    prop = await db.properties.find_one({"id": tenant.get("property_id")}, {"_id": 0}) or {}
    return {
        "email": invite["email"],
        "tenant_name": tenant.get("full_name"),
        "landlord_name": landlord.get("full_name"),
        "property_name": prop.get("name"),
        "apartment_number": tenant.get("apartment_number"),
        "expires_at": invite["expires_at"],
    }

@api_router.post("/invites/{token}/accept")
async def accept_invite(token: str, data: AcceptInviteIn):
    validate_password_strength(data.password)
    token_hash = sha256_token(token)
    invite = await db.tenant_invites.find_one({"token_hash": token_hash})
    if not invite or invite["status"] != "pending":
        raise HTTPException(400, "Invite not valid")
    try:
        exp = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.tenant_invites.update_one({"id": invite["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Invite has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    tenant = await db.tenants.find_one({"id": invite["tenant_id"]})
    if not tenant:
        raise HTTPException(400, "Tenant record not found")
    # If user already exists with this email, reuse if same tenant_id, else block
    existing_user = await db.users.find_one({"email": invite["email"]})
    if existing_user:
        if existing_user.get("tenant_id") == tenant["id"]:
            user_id = existing_user["id"]
            await db.users.update_one({"id": user_id}, {"$set": {
                "password_hash": hash_password(data.password),
                "account_status": "active",
                "email_verified": True,
                "updated_at": now_iso(),
            }})
        else:
            raise HTTPException(400, "An account with this email already exists")
    else:
        user_id = new_id()
        await db.users.insert_one({
            "id": user_id,
            "full_name": data.full_name or tenant.get("full_name") or invite["email"],
            "email": invite["email"],
            "phone": data.phone or tenant.get("phone", ""),
            "password_hash": hash_password(data.password),
            "role": "tenant",
            "account_status": "active",
            "email_verified": True,
            "plan": "starter",
            "plan_status": "free",
            "owner_id": invite["owner_id"],
            "tenant_id": tenant["id"],
            "must_change_password": False,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    await db.tenants.update_one({"id": tenant["id"]}, {"$set": {
        "tenant_user_id": user_id,
        "invite_status": "accepted",
        "updated_at": now_iso(),
    }})
    await db.tenant_invites.update_one({"id": invite["id"]}, {"$set": {"status": "accepted", "accepted_at": now_iso()}})
    user = await db.users.find_one({"id": user_id})
    token_out = create_token(user_id)
    return {"token": token_out, "user": strip_private(user)}


# ---------------- TENANT DASHBOARD ----------------
async def _get_tenant_context(user: dict) -> tuple[dict, dict]:
    """Return (tenant_record, owner_user) or raise 403."""
    require_roles(user, ["tenant"])
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    if not tenant or tenant.get("status") not in ("active",):
        raise HTTPException(403, "Your tenant access is not active")
    owner = await db.users.find_one({"id": tenant.get("user_id")}, {"_id": 0}) or {}
    return tenant, owner

@api_router.get("/tenant/me")
async def tenant_me(user=Depends(get_current_user)):
    tenant, owner = await _get_tenant_context(user)
    prop = await db.properties.find_one({"id": tenant.get("property_id")}, {"_id": 0}) or {}
    return {
        "tenant": tenant,
        "property": prop,
        "landlord": {"id": owner.get("id"), "full_name": owner.get("full_name"), "email": owner.get("email"), "phone": owner.get("phone")},
    }

@api_router.get("/tenant/dashboard")
async def tenant_dashboard(user=Depends(get_current_user)):
    tenant, owner = await _get_tenant_context(user)
    prop = await db.properties.find_one({"id": tenant.get("property_id")}, {"_id": 0}) or {}
    records = await db.rent_records.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    for r in records:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
    payments = await db.payments.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    outstanding = sum(max(0, (r["amount_due"] - r["amount_paid"])) for r in records)
    total_paid = sum(p["amount"] for p in payments)
    current = records[0] if records else None
    # unread messages
    conv = await db.conversations.find_one({"tenant_id": tenant["id"]})
    unread = 0
    if conv:
        unread = await db.messages.count_documents({"conversation_id": conv["id"], "read_by_tenant": False, "sender_role": "owner"})
    return {
        "tenant": tenant,
        "property": prop,
        "landlord": {"full_name": owner.get("full_name"), "email": owner.get("email"), "phone": owner.get("phone")},
        "current_rent": current,
        "rent_records": records,
        "payments": payments,
        "outstanding_rent": outstanding,
        "total_paid": total_paid,
        "unread_messages": unread,
    }


async def _active_tenant_ids(user_id: str) -> list:
    """Return list of tenant ids that are still active (excludes archived + access_revoked)."""
    cursor = db.tenants.find(
        {"user_id": user_id, "status": {"$nin": ["archived", "access_revoked"]}},
        {"_id": 0, "id": 1},
    )
    return [t["id"] async for t in cursor]


# ---------------- MESSAGING ----------------
async def _get_or_create_conversation(owner_id: str, tenant_record: dict):
    conv = await db.conversations.find_one({"owner_id": owner_id, "tenant_id": tenant_record["id"]})
    if conv:
        return conv
    doc = {
        "id": new_id(),
        "owner_id": owner_id,
        "tenant_id": tenant_record["id"],
        "tenant_user_id": tenant_record.get("tenant_user_id"),
        "property_id": tenant_record.get("property_id"),
        "apartment_number": tenant_record.get("apartment_number", ""),
        "status": "active",
        "last_message": "",
        "last_message_at": now_iso(),
        "created_at": now_iso(),
    }
    await db.conversations.insert_one(doc)
    return doc

@api_router.get("/messages/conversations")
async def list_conversations(user=Depends(get_current_user)):
    if user["role"] == "owner":
        convs = await db.conversations.find({"owner_id": user["id"]}, {"_id": 0}).sort("last_message_at", -1).to_list(5000000)
        # attach tenant info + unread count
        for c in convs:
            t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
            c["tenant_name"] = t.get("full_name", "")
            c["tenant_email"] = t.get("email", "")
            c["apartment_number"] = t.get("apartment_number", c.get("apartment_number", ""))
            c["unread_count"] = await db.messages.count_documents({"conversation_id": c["id"], "read_by_owner": False, "sender_role": "tenant"})
        return convs
    elif user["role"] == "tenant":
        tenant, _ = await _get_tenant_context(user)
        conv = await db.conversations.find_one({"tenant_id": tenant["id"]}, {"_id": 0})
        if not conv:
            return []
        owner = await db.users.find_one({"id": conv["owner_id"]}, {"_id": 0}) or {}
        conv["landlord_name"] = owner.get("full_name", "")
        conv["unread_count"] = await db.messages.count_documents({"conversation_id": conv["id"], "read_by_tenant": False, "sender_role": "owner"})
        return [conv]
    else:
        raise HTTPException(403, "Forbidden")

@api_router.post("/messages/start-with-tenant/{tenant_id}")
async def start_conversation(tenant_id: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    tenant = await db.tenants.find_one({"id": tenant_id, "user_id": user["id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    conv = await _get_or_create_conversation(user["id"], tenant)
    return strip_private(conv)

@api_router.get("/messages/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Not found")
    # Access check
    if user["role"] == "owner" and conv["owner_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] == "tenant":
        tenant, _ = await _get_tenant_context(user)
        if conv["tenant_id"] != tenant["id"]:
            raise HTTPException(403, "Forbidden")
    elif user["role"] != "owner":
        raise HTTPException(403, "Forbidden")
    msgs = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(5000000)
    # Mark as read for the current viewer
    if user["role"] == "owner":
        await db.messages.update_many({"conversation_id": conversation_id, "sender_role": "tenant", "read_by_owner": False}, {"$set": {"read_by_owner": True}})
    if user["role"] == "tenant":
        await db.messages.update_many({"conversation_id": conversation_id, "sender_role": "owner", "read_by_tenant": False}, {"$set": {"read_by_tenant": True}})
    return {"conversation": conv, "messages": msgs}

@api_router.post("/messages/conversations/{conversation_id}")
async def post_message(conversation_id: str, data: MessageIn, user=Depends(get_current_user)):
    if not data.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    conv = await db.conversations.find_one({"id": conversation_id})
    if not conv:
        raise HTTPException(404, "Not found")
    if user["role"] == "owner":
        if conv["owner_id"] != user["id"]:
            raise HTTPException(403, "Forbidden")
        sender_role = "owner"
    elif user["role"] == "tenant":
        tenant, _ = await _get_tenant_context(user)
        if conv["tenant_id"] != tenant["id"]:
            raise HTTPException(403, "Forbidden")
        sender_role = "tenant"
    else:
        raise HTTPException(403, "Forbidden")
    msg = {
        "id": new_id(),
        "conversation_id": conversation_id,
        "owner_id": conv["owner_id"],
        "tenant_id": conv["tenant_id"],
        "sender_user_id": user["id"],
        "sender_role": sender_role,
        "message": data.message.strip(),
        "attachments": [],
        "read_by_owner": sender_role == "owner",
        "read_by_tenant": sender_role == "tenant",
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    await db.conversations.update_one({"id": conversation_id}, {"$set": {
        "last_message": data.message[:200],
        "last_message_at": now_iso(),
    }})
    return strip_private(msg)

@api_router.post("/messages/start-with-landlord")
async def tenant_start_conversation(user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    conv = await _get_or_create_conversation(tenant["user_id"], tenant)
    return strip_private(conv)


# ---------------- RENT RECORDS ----------------
@api_router.get("/rent-records")
async def list_rent_records(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    items = await db.rent_records.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    for r in items:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
        t = await db.tenants.find_one({"id": r["tenant_id"]}, {"_id": 0})
        r["tenant_name"] = t["full_name"] if t else "-"
        r["apartment_number"] = t.get("apartment_number", "") if t else ""
        p = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["property_name"] = p["name"] if p else "-"
    return items

@api_router.get("/rent-records/overdue")
async def overdue_records(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    items = await db.rent_records.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).to_list(5000000)
    result = []
    for r in items:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
        if r["status"] == "overdue":
            r["days_overdue"] = days_diff(r["due_date"])
            t = await db.tenants.find_one({"id": r["tenant_id"]}, {"_id": 0})
            r["tenant"] = t
            p = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
            r["property_name"] = p["name"] if p else "-"
            result.append(r)
    result.sort(key=lambda x: x["days_overdue"], reverse=True)
    return result


# ---------------- PAYMENTS ----------------
@api_router.get("/payments")
async def list_payments(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    items = await db.payments.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    for p in items:
        t = await db.tenants.find_one({"id": p["tenant_id"]}, {"_id": 0})
        p["tenant_name"] = t["full_name"] if t else "-"
        prop_id = p.get("property_id") or (t["property_id"] if t else None)
        prop = await db.properties.find_one({"id": prop_id}, {"_id": 0}) if prop_id else None
        p["property_name"] = prop["name"] if prop else "-"
    return items

@api_router.post("/payments")
async def create_payment(data: PaymentIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    rec = await db.rent_records.find_one({"id": data.rent_record_id, "user_id": user["id"]})
    if not rec:
        raise HTTPException(400, "Invalid rent record")
    payment_date = data.payment_date or date.today().isoformat()
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "rent_record_id": data.rent_record_id,
        "tenant_id": data.tenant_id,
        "property_id": rec["property_id"],
        "amount": data.amount,
        "method": data.method,
        "reference": data.reference,
        "payment_date": payment_date,
        "notes": data.notes,
        "receipt_number": f"RCP-{new_id()[:8].upper()}",
        "created_at": now_iso(),
    }
    await db.payments.insert_one(doc)
    new_paid = rec["amount_paid"] + data.amount
    new_balance = max(0, rec["amount_due"] - new_paid)
    new_status = compute_status(rec["due_date"], rec["amount_due"], new_paid)
    await db.rent_records.update_one(
        {"id": rec["id"]},
        {"$set": {"amount_paid": new_paid, "balance": new_balance, "status": new_status,
                  "paid_date": payment_date if new_balance == 0 else rec.get("paid_date")}}
    )
    return strip_private(doc)

@api_router.delete("/payments/{pid}")
async def delete_payment(pid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    p = await db.payments.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(404, "Not found")
    rec = await db.rent_records.find_one({"id": p["rent_record_id"]})
    if rec:
        new_paid = max(0, rec["amount_paid"] - p["amount"])
        new_balance = rec["amount_due"] - new_paid
        new_status = compute_status(rec["due_date"], rec["amount_due"], new_paid)
        await db.rent_records.update_one({"id": rec["id"]}, {"$set": {"amount_paid": new_paid, "balance": new_balance, "status": new_status}})
    await db.payments.delete_one({"id": pid})
    return {"ok": True}


@api_router.post("/rent-records/{rid}/mark-fully-paid")
async def mark_rent_fully_paid(rid: str, user=Depends(get_current_user)):
    """One-click: settle the record with a single system-generated payment for the remaining balance."""
    require_roles(user, ["owner"])
    rec = await db.rent_records.find_one({"id": rid, "user_id": user["id"]})
    if not rec:
        raise HTTPException(404, "Not found")
    remaining = rec["amount_due"] - rec["amount_paid"]
    if remaining <= 0:
        # Already settled — just normalize status
        await db.rent_records.update_one({"id": rid}, {"$set": {"amount_paid": rec["amount_due"], "balance": 0, "status": "paid"}})
        return {"ok": True, "already_paid": True}
    payment_date = date.today().isoformat()
    receipt_no = f"RC-{new_id()[:8].upper()}"
    pay = {
        "id": new_id(),
        "user_id": user["id"],
        "tenant_id": rec["tenant_id"],
        "rent_record_id": rid,
        "property_id": rec.get("property_id"),
        "amount": remaining,
        "method": "manual_mark_paid",
        "reference": "Marked as paid",
        "notes": "One-click mark as fully paid",
        "receipt_number": receipt_no,
        "payment_date": payment_date,
        "created_at": now_iso(),
    }
    await db.payments.insert_one(pay)
    await db.rent_records.update_one({"id": rid}, {"$set": {
        "amount_paid": rec["amount_due"], "balance": 0, "status": "paid"
    }})
    return {"ok": True}


@api_router.post("/rent-records/{rid}/mark-unpaid")
async def mark_rent_unpaid(rid: str, user=Depends(get_current_user)):
    """Wipe ALL payments on this rent record and reset amount_paid to 0."""
    require_roles(user, ["owner"])
    rec = await db.rent_records.find_one({"id": rid, "user_id": user["id"]})
    if not rec:
        raise HTTPException(404, "Not found")
    del_res = await db.payments.delete_many({"rent_record_id": rid, "user_id": user["id"]})
    new_status = compute_status(rec["due_date"], rec["amount_due"], 0)
    await db.rent_records.update_one({"id": rid}, {"$set": {
        "amount_paid": 0, "balance": rec["amount_due"], "status": new_status
    }})
    return {"ok": True, "deleted_payments": del_res.deleted_count}


# ---------------- REMINDERS ----------------
@api_router.get("/reminders")
async def list_reminders(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    items = await db.reminders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000000)
    for r in items:
        t = await db.tenants.find_one({"id": r["tenant_id"]}, {"_id": 0})
        r["tenant_name"] = t["full_name"] if t else "-"
    return items

TONE_MAP = {
    "polite": "polite, warm and respectful",
    "friendly": "friendly and casual, like a neighbor",
    "professional": "professional and businesslike",
    "firm": "firm but respectful — clear that payment is expected",
    "urgent": "urgent and direct, conveying that immediate action is needed",
    "final": "a final formal notice, still respectful but making clear this is the last notice before further action",
}

REMINDER_SYSTEM_MSG = (
    "You are an assistant that writes short, professional rent reminder messages "
    "for Nigerian landlords to send to their tenants via WhatsApp or SMS. "
    "Never use threatening language. Always be respectful. Never mention that you are an AI. "
    "Keep messages under 90 words. Sign off simply (e.g., 'Property Management' or 'Thank you'). "
    "Use ₦ for Naira amounts. Do not include salutation placeholders — always fill in the tenant's real name."
)

def _build_reminder_prompt(tenant: dict, rec: dict, prop_name: str, tone: str) -> str:
    days = days_diff(rec["due_date"])
    balance = rec["amount_due"] - rec["amount_paid"]
    tone_desc = TONE_MAP.get(tone, TONE_MAP["polite"])
    return (
        f"Write ONE {tone_desc} rent reminder message for the following tenant. "
        f"Do not include any preamble like 'Sure, here is...'. Return only the message body.\n\n"
        f"Tenant name: {tenant['full_name']}\n"
        f"Property: {prop_name}\n"
        f"Rent amount: ₦{rec['amount_due']:,.0f}\n"
        f"Balance outstanding: ₦{balance:,.0f}\n"
        f"Due date: {rec['due_date']}\n"
        f"Days overdue: {max(0, days)}\n"
        f"Days until due: {-days if days < 0 else 0}\n"
    )

def _fallback_reminder(tenant: dict, rec: dict, prop_name: str) -> str:
    days = days_diff(rec["due_date"])
    balance = rec["amount_due"] - rec["amount_paid"]
    if days > 0:
        return (
            f"Hello {tenant['full_name']}, this is a reminder that your rent of ₦{balance:,.0f} for "
            f"{prop_name} is now {days} day(s) overdue (due {rec['due_date']}). "
            f"Kindly make payment as soon as possible. Thank you."
        )
    return (
        f"Hello {tenant['full_name']}, this is a friendly reminder that your rent of ₦{rec['amount_due']:,.0f} "
        f"for {prop_name} is due on {rec['due_date']}. Kindly make payment on or before the due date. Thank you."
    )

@api_router.post("/reminders/generate-ai")
async def generate_ai_reminder(data: ReminderGenIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await enforce_ai_reminder_quota(user)
    from ai_provider import completion
    tenant = await db.tenants.find_one({"id": data.tenant_id, "user_id": user["id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if data.rent_record_id:
        rec = await db.rent_records.find_one({"id": data.rent_record_id}, {"_id": 0})
    else:
        rec = await db.rent_records.find_one({"tenant_id": tenant["id"]}, {"_id": 0}, sort=[("due_date", -1)])
    if not rec:
        raise HTTPException(400, "No rent record found for tenant")
    prop = await db.properties.find_one({"id": tenant["property_id"]}, {"_id": 0})
    prop_name = prop["name"] if prop else "your unit"
    prompt = _build_reminder_prompt(tenant, rec, prop_name, data.tone)
    try:
        response = await completion(REMINDER_SYSTEM_MSG, prompt)
        message = response.strip() if isinstance(response, str) else str(response).strip()
    except Exception:
        logger.exception("AI reminder generation failed")
        message = _fallback_reminder(tenant, rec, prop_name)
    await db.ai_usage.insert_one({
        "id": new_id(), "user_id": user["id"], "type": "reminder",
        "month": date.today().isoformat()[:7], "created_at": now_iso(),
    })
    return {"message": message, "tone": data.tone}

@api_router.post("/reminders")
async def log_reminder(data: ReminderLogIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        **data.model_dump(),
        "status": "sent",
        "sent_at": now_iso(),
        "created_at": now_iso(),
    }
    await db.reminders.insert_one(doc)
    return strip_private(doc)


# ---------------- DASHBOARD ----------------
@api_router.get("/dashboard/summary")
async def dashboard_summary(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    prop_count = await db.properties.count_documents({"user_id": user["id"]})
    tenant_count = await db.tenants.count_documents({"user_id": user["id"], "status": {"$nin": ["archived", "access_revoked"]}})
    active_ids = await _active_tenant_ids(user["id"])
    records = await db.rent_records.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).to_list(5000000)
    total_expected = 0.0
    total_collected = 0.0
    pending = 0.0
    overdue = 0.0
    overdue_tenants = set()
    this_month_start = date.today().replace(day=1)
    for r in records:
        r["status"] = compute_status(r["due_date"], r["amount_due"], r["amount_paid"])
        due = parse_date(r["due_date"])
        if due >= this_month_start and due.month == date.today().month and due.year == date.today().year:
            total_expected += r["amount_due"]
        total_collected += r["amount_paid"]
        bal = r["amount_due"] - r["amount_paid"]
        if r["status"] == "overdue":
            overdue += bal
            overdue_tenants.add(r["tenant_id"])
        elif r["status"] in ("upcoming", "due_today", "partially_paid"):
            pending += bal
    reminder_count = await db.reminders.count_documents({"user_id": user["id"]})
    # unread messages across conversations
    convs = await db.conversations.find({"owner_id": user["id"]}, {"_id": 0, "id": 1}).to_list(5000000)
    conv_ids = [c["id"] for c in convs]
    unread = await db.messages.count_documents({"conversation_id": {"$in": conv_ids}, "sender_role": "tenant", "read_by_owner": False}) if conv_ids else 0
    return {
        "total_properties": prop_count,
        "total_tenants": tenant_count,
        "rent_due_this_month": total_expected,
        "rent_collected": total_collected,
        "pending_rent": pending,
        "overdue_rent": overdue,
        "overdue_tenants": len(overdue_tenants),
        "reminders_sent": reminder_count,
        "unread_messages": unread,
        "plan": user.get("plan", "starter"),
        "plan_status": user.get("plan_status", "free"),
        "plan_expires_at": user.get("plan_expires_at"),
    }

@api_router.get("/dashboard/chart")
async def dashboard_chart(months: int = 6, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    months = max(1, min(24, months))
    active_ids = await _active_tenant_ids(user["id"])
    today = date.today()
    month_list = []
    for i in range(months - 1, -1, -1):
        y = today.year
        m = today.month - i
        while m <= 0:
            m += 12
            y -= 1
        month_list.append((y, m))
    payments = await db.payments.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).to_list(5000000)
    records = await db.rent_records.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).to_list(5000000)
    expenses = await db.expenses.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000000)
    out = []
    for (y, m) in month_list:
        collected = sum(p["amount"] for p in payments if parse_date(p["payment_date"]).year == y and parse_date(p["payment_date"]).month == m)
        expected = sum(r["amount_due"] for r in records if parse_date(r["due_date"]).year == y and parse_date(r["due_date"]).month == m)
        spent = sum(e["amount"] for e in expenses if parse_date(e["incurred_at"]).year == y and parse_date(e["incurred_at"]).month == m)
        out.append({
            "month": date(y, m, 1).strftime("%b %Y"),
            "collected": collected,
            "expected": expected,
            "expenses": spent,
        })
    return out

@api_router.get("/dashboard/recent-payments")
async def recent_payments(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    items = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for p in items:
        t = await db.tenants.find_one({"id": p["tenant_id"]}, {"_id": 0})
        p["tenant_name"] = t["full_name"] if t else "-"
    return items


# ==================== Notifications ====================

def _notif(kind: str, title: str, body: str, link: str, severity: str, created_at: str, key: Optional[str] = None):
    return {
        "id": new_id(),
        "key": key or f"{kind}:{title}",
        "kind": kind,
        "title": title,
        "body": body,
        "link": link,
        "severity": severity,  # "info" | "warning" | "danger"
        "created_at": created_at,
    }


async def _owner_notifications(user):
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=7)).date().isoformat()
    today = now.date().isoformat()
    active = await db.tenants.find({"user_id": user["id"], "status": "active"}, {"_id": 0}).to_list(5000000)
    tenant_map = {t["id"]: t for t in active}
    active_ids = list(tenant_map.keys())
    items = []
    # Overdue + upcoming rent
    if active_ids:
        recs = await db.rent_records.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}, "status": {"$ne": "paid"}}, {"_id": 0}).to_list(5000000)
        for r in recs:
            t = tenant_map.get(r["tenant_id"])
            name = t["full_name"] if t else "Tenant"
            if r["due_date"] < today:
                items.append(_notif("rent_overdue", f"Rent overdue — {name}", f"₦{r['balance']:,.0f} outstanding, due {r['due_date']}", f"/dashboard/tenants/{r['tenant_id']}", "danger", r["due_date"], key=f"rent_overdue:{r['id']}"))
            elif r["due_date"] <= soon:
                items.append(_notif("rent_upcoming", f"Rent due soon — {name}", f"₦{r['balance']:,.0f} due on {r['due_date']}", f"/dashboard/tenants/{r['tenant_id']}", "warning", r["due_date"], key=f"rent_upcoming:{r['id']}"))
        # Bills
        bills = await db.utility_bills.find({"user_id": user["id"], "tenant_id": {"$in": active_ids}, "status": {"$ne": "paid"}}, {"_id": 0}).to_list(5000000)
        for b in bills:
            t = tenant_map.get(b["tenant_id"])
            name = t["full_name"] if t else "Tenant"
            if b["due_date"] < today:
                items.append(_notif("bill_overdue", f"Bill overdue — {name}", f"{b['title']} · ₦{b['balance']:,.0f} outstanding", "/dashboard/bills", "danger", b["due_date"], key=f"bill_overdue:{b['id']}"))
            elif b["due_date"] <= soon:
                items.append(_notif("bill_upcoming", f"Bill due soon — {name}", f"{b['title']} · ₦{b['balance']:,.0f} on {b['due_date']}", "/dashboard/bills", "warning", b["due_date"], key=f"bill_upcoming:{b['id']}"))
    # New maintenance complaints (open / not assigned)
    complaints = await db.maintenance_complaints.find({"owner_id": user["id"], "status": {"$in": ["open", "in_progress"]}}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for c in complaints:
        items.append(_notif("maintenance", f"Maintenance: {c.get('category', 'issue')}", c.get("description", "")[:120], "/dashboard/maintenance", "warning" if c.get("status") == "open" else "info", c.get("created_at", now.isoformat()), key=f"maintenance:{c['id']}"))
    # Unread messages (from tenant to owner)
    tenant_convos = await db.tenants.find({"user_id": user["id"], "tenant_user_id": {"$ne": None}}, {"_id": 0, "id": 1, "tenant_user_id": 1, "full_name": 1}).to_list(5000000)
    for t in tenant_convos:
        unread = await db.messages.count_documents({"tenant_id": t["id"], "sender_role": "tenant", "read_by_owner": False})
        if unread > 0:
            items.append(_notif("message", f"{unread} new message{'s' if unread > 1 else ''} from {t['full_name']}", "Tap to reply", f"/dashboard/tenants/{t['id']}", "info", now.isoformat(), key=f"message:{t['id']}"))
    # Loss alert: any property running in a loss
    props = await db.properties.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000000)
    for p in props:
        recs2 = await db.rent_records.find({"property_id": p["id"]}, {"_id": 0}).to_list(5000000)
        rent_income = sum(r["amount_paid"] for r in recs2)
        bill_pays = await db.utility_bills.find({"property_id": p["id"]}, {"_id": 0}).to_list(5000000)
        bill_income = sum(b.get("amount_paid", 0) for b in bill_pays)
        exps = await db.expenses.find({"user_id": user["id"], "property_id": p["id"]}, {"_id": 0}).to_list(5000000)
        total_exp = sum(e["amount"] for e in exps)
        if total_exp > 0 and (rent_income + bill_income) < total_exp:
            deficit = total_exp - (rent_income + bill_income)
            items.append(_notif("loss_alert", f"{p['name']} is running at a loss", f"Expenses exceed income by ₦{deficit:,.0f}", "/dashboard/expenses", "danger", now.isoformat(), key=f"loss_alert:{p['id']}"))
    return items


async def _tenant_notifications(user):
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=7)).date().isoformat()
    today = now.date().isoformat()
    tenant = await db.tenants.find_one({"tenant_user_id": user["id"], "status": "active"}, {"_id": 0})
    items = []
    if not tenant:
        return items
    # Rent status
    recs = await db.rent_records.find({"tenant_id": tenant["id"], "status": {"$ne": "paid"}}, {"_id": 0}).to_list(5000000)
    for r in recs:
        if r["due_date"] < today:
            items.append(_notif("rent_overdue", "Your rent is overdue", f"₦{r['balance']:,.0f} outstanding, was due {r['due_date']}", "/tenant", "danger", r["due_date"], key=f"rent_overdue:{r['id']}"))
        elif r["due_date"] <= soon:
            items.append(_notif("rent_upcoming", "Rent due soon", f"₦{r['balance']:,.0f} due on {r['due_date']}", "/tenant", "warning", r["due_date"], key=f"rent_upcoming:{r['id']}"))
    # Bills
    bills = await db.utility_bills.find({"tenant_id": tenant["id"], "status": {"$ne": "paid"}}, {"_id": 0}).to_list(5000000)
    for b in bills:
        if b["due_date"] < today:
            items.append(_notif("bill_overdue", f"Bill overdue: {b['title']}", f"₦{b['balance']:,.0f} outstanding", "/tenant/bills", "danger", b["due_date"], key=f"bill_overdue:{b['id']}"))
        elif b["due_date"] <= soon:
            items.append(_notif("bill_upcoming", f"Bill due soon: {b['title']}", f"₦{b['balance']:,.0f} on {b['due_date']}", "/tenant/bills", "warning", b["due_date"], key=f"bill_upcoming:{b['id']}"))
    # Maintenance updates on their own complaints
    complaints = await db.maintenance_complaints.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(20)
    for c in complaints:
        if c.get("status") in ("resolved", "in_progress", "assigned"):
            items.append(_notif("maintenance", f"Maintenance update: {c.get('status', '').replace('_', ' ')}", c.get("category", "") + " · " + (c.get("description", "")[:80]), "/tenant/complaints", "info", c.get("updated_at", now.isoformat()), key=f"maintenance:{c['id']}:{c.get('status')}"))
    # Unread messages (from owner to tenant)
    unread = await db.messages.count_documents({"tenant_id": tenant["id"], "sender_role": "owner", "read_by_tenant": False})
    if unread > 0:
        items.append(_notif("message", f"{unread} new message{'s' if unread > 1 else ''} from your landlord", "Tap to reply", "/tenant/messages", "info", now.isoformat(), key=f"message:{tenant['id']}"))
    return items


async def _facility_notifications(user):
    now = datetime.now(timezone.utc)
    items = []
    fm = await db.facility_managers.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0})
    if not fm:
        return items
    # Assigned open complaints
    complaints = await db.maintenance_complaints.find({"assigned_to_facility_manager_id": fm["id"], "status": {"$in": ["assigned", "in_progress"]}}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for c in complaints:
        items.append(_notif("maintenance", f"Assigned task: {c.get('category', '')}", c.get("description", "")[:120], "/facility-manager/complaints", "warning" if c.get("status") == "assigned" else "info", c.get("created_at", now.isoformat()), key=f"fm_task:{c['id']}"))
    return items


async def _admin_notifications(user):
    now = datetime.now(timezone.utc)
    items = []
    # Open support tickets
    tickets = await db.support_tickets.find({"status": {"$in": ["open", "pending"]}}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for t in tickets:
        items.append(_notif("support", f"Support: {t.get('subject', 'ticket')}", (t.get("status") or "open").upper(), "/admin/support-tickets", "warning" if t.get("status") == "open" else "info", t.get("created_at", now.isoformat()), key=f"support:{t['id']}"))
    return items


async def _support_notifications(user):
    now = datetime.now(timezone.utc)
    items = []
    tickets = await db.support_tickets.find({"status": "open"}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for t in tickets:
        items.append(_notif("support", f"Open ticket: {t.get('subject', '')}", "Awaiting response", "/support", "warning", t.get("created_at", now.isoformat()), key=f"support:{t['id']}"))
    return items


@api_router.post("/charges/renew")
async def renew_charges_now(user=Depends(get_current_user)):
    """Owner-triggered renewal of due rent cycles & recurring bills (also runs automatically)."""
    require_roles(user, ["owner"])
    result = await renew_recurring_charges()
    return {"ok": True, **result}


@api_router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    """Aggregated notifications for the current user, sorted newest first, capped at 50."""
    role = user.get("role")
    if role == "owner":
        await renew_recurring_charges_throttled()
        items = await _owner_notifications(user)
    elif role == "tenant":
        items = await _tenant_notifications(user)
    elif role == "facility_manager":
        items = await _facility_notifications(user)
    elif role == "admin":
        items = await _admin_notifications(user)
    elif role == "support":
        items = await _support_notifications(user)
    else:
        items = []
    # Filter out dismissed notifications
    dismissed = await db.notification_dismissals.find({"user_id": user["id"]}, {"_id": 0, "key": 1}).to_list(5000000)
    dismissed_keys = {d["key"] for d in dismissed}
    items = [n for n in items if n["key"] not in dismissed_keys]
    items.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    return {"items": items[:50], "count": len(items)}


class NotificationDismissIn(BaseModel):
    key: str


@api_router.post("/notifications/dismiss")
async def dismiss_notification(data: NotificationDismissIn, user=Depends(get_current_user)):
    """Mark a notification key as dismissed (read). Idempotent."""
    await db.notification_dismissals.update_one(
        {"user_id": user["id"], "key": data.key},
        {"$set": {"user_id": user["id"], "key": data.key, "dismissed_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/notifications/dismiss-all")
async def dismiss_all_notifications(user=Depends(get_current_user)):
    """Mark every current notification as read for this user."""
    role = user.get("role")
    if role == "owner":
        items = await _owner_notifications(user)
    elif role == "tenant":
        items = await _tenant_notifications(user)
    elif role == "facility_manager":
        items = await _facility_notifications(user)
    elif role == "admin":
        items = await _admin_notifications(user)
    elif role == "support":
        items = await _support_notifications(user)
    else:
        items = []
    now = now_iso()
    for n in items:
        await db.notification_dismissals.update_one(
            {"user_id": user["id"], "key": n["key"]},
            {"$set": {"user_id": user["id"], "key": n["key"], "dismissed_at": now}},
            upsert=True,
        )
    return {"ok": True, "count": len(items)}



# ---------------- REPORTS ----------------
@api_router.get("/reports/summary")
async def reports_summary(month: Optional[str] = "all", include_rent: bool = True, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "reports", "Reports & exports")
    uid = user["id"]
    has_month = month not in (None, "", "all")
    mre = {"$regex": f"^{month}"} if has_month else None

    props = await db.properties.find({"user_id": uid}, {"_id": 0, "id": 1, "name": 1}).to_list(5000000)

    # Rent collected (payments) grouped by property, optional month by payment_date
    pay_match = {"user_id": uid}
    if has_month:
        pay_match["payment_date"] = mre
    rent_col = {d["_id"]: d["total"] async for d in db.payments.aggregate([
        {"$match": pay_match},
        {"$group": {"_id": "$property_id", "total": {"$sum": "$amount"}}},
    ])}

    # Bills collected (bill_payments -> lookup bill.property_id), optional month by payment_date
    bp_pipeline = [{"$match": {"owner_id": uid}}]
    if has_month:
        bp_pipeline.append({"$match": {"payment_date": mre}})
    bp_pipeline += [
        {"$lookup": {"from": "utility_bills", "localField": "bill_id", "foreignField": "id", "as": "bill"}},
        {"$unwind": "$bill"},
        {"$group": {"_id": "$bill.property_id", "total": {"$sum": "$amount"}}},
    ]
    bills_col = {d["_id"]: d["total"] async for d in db.bill_payments.aggregate(bp_pipeline)}

    # Expenses grouped by property, optional month by incurred_at
    exp_match = {"user_id": uid}
    if has_month:
        exp_match["incurred_at"] = mre
    exp_tot = {d["_id"]: d["total"] async for d in db.expenses.aggregate([
        {"$match": exp_match},
        {"$group": {"_id": "$property_id", "total": {"$sum": "$amount"}}},
    ])}

    # All-time rent expected/paid grouped by property (rent_records)
    rent_agg = {d["_id"]: d async for d in db.rent_records.aggregate([
        {"$match": {"user_id": uid}},
        {"$group": {"_id": "$property_id", "expected": {"$sum": "$amount_due"}, "paid": {"$sum": "$amount_paid"}}},
    ])}

    # Active tenant counts grouped by property
    tcount = {d["_id"]: d["n"] async for d in db.tenants.aggregate([
        {"$match": {"user_id": uid, "status": {"$ne": "archived"}}},
        {"$group": {"_id": "$property_id", "n": {"$sum": 1}}},
    ])}

    result = []
    for p in props:
        pid = p["id"]
        rent_collected = rent_col.get(pid, 0) or 0
        bills_collected = bills_col.get(pid, 0) or 0
        expenses_total = exp_tot.get(pid, 0) or 0
        ra = rent_agg.get(pid, {})
        expected = ra.get("expected", 0) or 0
        rent_paid_all = ra.get("paid", 0) or 0
        income = (rent_collected if include_rent else 0) + bills_collected
        net = income - expenses_total
        result.append({
            "property_id": pid,
            "property_name": p["name"],
            "tenant_count": tcount.get(pid, 0),
            "expected": expected,
            "collected": rent_collected,
            "outstanding": max(0, expected - rent_paid_all),
            "bills_collected": bills_collected,
            "expenses_total": expenses_total,
            "income": income,
            "net": net,
            "is_loss": net < 0,
        })
    return result


# ---------------- EXPENSES ----------------
class ExpenseIn(BaseModel):
    property_id: str
    category: str  # maintenance, utilities, staff, security, cleaning, taxes, insurance, other
    amount: float
    description: Optional[str] = ""
    incurred_at: Optional[str] = None
    vendor: Optional[str] = ""


@api_router.get("/expenses")
async def list_expenses(property_id: Optional[str] = None, user=Depends(get_current_user)):
    require_roles(user, ["owner", "facility_manager"])
    owner_id = await resolve_owner_id(user)
    q = {"user_id": owner_id}
    if property_id:
        q["property_id"] = property_id
    items = await db.expenses.find(q, {"_id": 0}).sort("incurred_at", -1).to_list(5000000)
    # Enrich with property name
    prop_ids = list({e["property_id"] for e in items if e.get("property_id")})
    if prop_ids:
        prop_map = {p["id"]: p async for p in db.properties.find({"id": {"$in": prop_ids}}, {"_id": 0})}
        for e in items:
            p = prop_map.get(e.get("property_id"))
            e["property_name"] = p["name"] if p else "-"
            e["logged_by"] = e.get("created_by_role", "owner")
    return items


@api_router.post("/expenses")
async def create_expense(data: ExpenseIn, user=Depends(get_current_user)):
    require_roles(user, ["owner", "facility_manager"])
    owner_id = await resolve_owner_id(user)
    prop = await db.properties.find_one({"id": data.property_id, "user_id": owner_id})
    if not prop:
        raise HTTPException(404, "Property not found")
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    now = now_iso()
    doc = {
        "id": new_id(),
        "user_id": owner_id,
        "property_id": data.property_id,
        "category": data.category,
        "amount": data.amount,
        "description": data.description or "",
        "vendor": data.vendor or "",
        "incurred_at": data.incurred_at or date.today().isoformat(),
        "created_at": now,
        "updated_at": now,
        "created_by_id": user["id"],
        "created_by_role": user.get("role", "owner"),
        "created_by_name": user.get("full_name", ""),
    }
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/expenses/{eid}")
async def update_expense(eid: str, data: ExpenseIn, user=Depends(get_current_user)):
    require_roles(user, ["owner", "facility_manager"])
    owner_id = await resolve_owner_id(user)
    exp = await db.expenses.find_one({"id": eid, "user_id": owner_id})
    if not exp:
        raise HTTPException(404, "Not found")
    upd = {
        "property_id": data.property_id,
        "category": data.category,
        "amount": data.amount,
        "description": data.description or "",
        "vendor": data.vendor or "",
        "incurred_at": data.incurred_at or exp.get("incurred_at"),
        "updated_at": now_iso(),
    }
    await db.expenses.update_one({"id": eid}, {"$set": upd})
    return {"ok": True}


@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner", "facility_manager"])
    owner_id = await resolve_owner_id(user)
    r = await db.expenses.delete_one({"id": eid, "user_id": owner_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api_router.get("/expenses/summary")
async def expenses_summary(
    property_id: Optional[str] = None,
    include_rent: bool = True,
    month: Optional[str] = "all",
    user=Depends(get_current_user),
):
    """Grand totals + per-category breakdown for the owner.

    Args:
        property_id: filter income + expenses to a single property
        include_rent: if False, income only counts utility bills + service charge (not rent)
        month: 'YYYY-MM' to scope to a single month, or 'all' for everything.
    """
    require_roles(user, ["owner"])

    def in_month(iso):
        if month in (None, "", "all"):
            return True
        return bool(iso) and str(iso)[:7] == month

    q_exp: Dict[str, Any] = {"user_id": user["id"]}
    if property_id and property_id != "all":
        q_exp["property_id"] = property_id
    items = [e for e in await db.expenses.find(q_exp, {"_id": 0}).to_list(5000000) if in_month(e.get("incurred_at"))]
    total = sum(e["amount"] for e in items)
    by_cat = {}
    for e in items:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + e["amount"]

    # Income
    active_ids = await _active_tenant_ids(user["id"])
    tenant_q = {"user_id": user["id"], "status": "active"}
    if property_id and property_id != "all":
        tenant_q["property_id"] = property_id
        active_ids = [t["id"] async for t in db.tenants.find(tenant_q, {"_id": 0, "id": 1})]
    pay_q = {"user_id": user["id"], "tenant_id": {"$in": active_ids}}
    payments = await db.payments.find(pay_q, {"_id": 0}).to_list(5000000) if include_rent else []
    bp_q = {"owner_id": user["id"], "tenant_id": {"$in": active_ids}}
    bill_pays = await db.bill_payments.find(bp_q, {"_id": 0}).to_list(5000000)
    rent_collected = sum(p["amount"] for p in payments if in_month(p.get("payment_date"))) if include_rent else 0
    bill_collected = sum(b["amount"] for b in bill_pays if in_month(b.get("payment_date")))
    income = rent_collected + bill_collected
    return {
        "property_id": property_id or "all",
        "include_rent": include_rent,
        "month": month or "all",
        "total_expenses": total,
        "by_category": [{"category": k, "amount": v} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
        "rent_collected": rent_collected,
        "bill_collected": bill_collected,
        "income": income,
        "net": income - total,
        "is_loss": (income - total) < 0,
    }


# ---------------- ADMIN ROUTES ----------------
@api_router.get("/admin/summary")
async def admin_summary(user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    total_users = await db.users.count_documents({})
    owners = await db.users.count_documents({"role": "owner"})
    tenants_u = await db.users.count_documents({"role": "tenant"})
    properties = await db.properties.count_documents({})
    tenants = await db.tenants.count_documents({})
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    gifted_subs = await db.subscriptions.count_documents({"status": "gifted"})
    return {
        "total_users": total_users,
        "owners": owners,
        "tenant_users": tenants_u,
        "properties": properties,
        "tenants": tenants,
        "active_subscriptions": active_subs,
        "gifted_subscriptions": gifted_subs,
    }

@api_router.get("/admin/users")
async def admin_list_users(role: Optional[str] = None, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    q = {}
    if role:
        q["role"] = role
    items = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(5000000)
    return items

@api_router.get("/admin/users/{uid}")
async def admin_get_user(uid: str, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Not found")
    sub = await db.subscriptions.find_one({"owner_id": uid}, {"_id": 0})
    u["subscription"] = sub
    return u

@api_router.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, data: AdminUpdateUserIn, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return {"ok": True}
    if "email" in updates:
        updates["email"] = updates["email"].lower()
    updates["updated_at"] = now_iso()
    r = await db.users.update_one({"id": uid}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_action(user, "admin_update_user", "user", uid, after=updates)
    return {"ok": True}

@api_router.post("/admin/users/{uid}/suspend")
async def admin_suspend(uid: str, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    if uid == user["id"]:
        raise HTTPException(400, "You cannot suspend yourself")
    r = await db.users.update_one({"id": uid}, {"$set": {"account_status": "suspended", "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_action(user, "suspend_user", "user", uid)
    return {"ok": True}

@api_router.post("/admin/users/{uid}/restore")
async def admin_restore(uid: str, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    r = await db.users.update_one({"id": uid}, {"$set": {"account_status": "active", "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_action(user, "restore_user", "user", uid)
    return {"ok": True}

@api_router.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    if uid == user["id"]:
        raise HTTPException(400, "You cannot delete yourself")
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "Not found")
    if target.get("role") == "admin":
        remaining_admins = await db.users.count_documents({"role": "admin", "id": {"$ne": uid}})
        if remaining_admins == 0:
            raise HTTPException(400, "Cannot delete the last remaining admin")
    # Hard delete the user record; cascade lightweight cleanup of directly-owned records
    await db.users.delete_one({"id": uid})
    await db.subscriptions.delete_many({"owner_id": uid})
    await db.tenant_invites.delete_many({"invited_by": uid})
    # For tenants: revoke access records rather than orphaning owner-side data
    await db.tenants.update_many({"tenant_user_id": uid}, {"$set": {"status": "access_revoked", "tenant_user_id": None, "updated_at": now_iso()}})
    await log_action(user, "delete_user", "user", uid, before={"email": target.get("email"), "role": target.get("role")})
    return {"ok": True}

class AdminResetPasswordIn(BaseModel):
    new_password: str

@api_router.post("/admin/users/{uid}/reset-password")
async def admin_reset_password(uid: str, data: AdminResetPasswordIn, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    validate_password_strength(data.new_password)
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "Not found")
    await db.users.update_one({"id": uid}, {"$set": {
        "password_hash": hash_password(data.new_password),
        "must_change_password": False,
        "updated_at": now_iso(),
    }})
    await log_action(user, "admin_reset_password", "user", uid)
    return {"ok": True}

@api_router.get("/admin/subscriptions")
async def admin_list_subscriptions(user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    subs = await db.subscriptions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(5000000)
    for s in subs:
        o = await db.users.find_one({"id": s["owner_id"]}, {"_id": 0, "password_hash": 0})
        if o:
            s["owner_name"] = o.get("full_name")
            s["owner_email"] = o.get("email")
    return subs

@api_router.post("/admin/subscriptions/{owner_id}/gift")
async def admin_gift_plan(owner_id: str, data: AdminGiftIn, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    target = await db.users.find_one({"id": owner_id})
    if not target or target.get("role") != "owner":
        raise HTTPException(404, "Owner not found")
    months = max(1, min(data.months, 60))
    plan = data.plan or "growth"
    now = datetime.now(timezone.utc)
    # Extend existing expiry if in future
    existing_expiry_str = target.get("plan_expires_at")
    base = now
    if existing_expiry_str:
        try:
            existing_expiry = datetime.fromisoformat(existing_expiry_str.replace("Z", "+00:00"))
            if existing_expiry > now:
                base = existing_expiry
        except Exception:
            pass
    new_expiry = base + timedelta(days=30 * months)
    await db.users.update_one({"id": owner_id}, {"$set": {
        "plan": plan,
        "plan_status": "gifted",
        "plan_started_at": now.isoformat(),
        "plan_expires_at": new_expiry.isoformat(),
        "gifted_until": new_expiry.isoformat(),
        "updated_at": now_iso(),
    }})
    sub_doc = {
        "id": new_id(),
        "owner_id": owner_id,
        "plan": plan,
        "status": "gifted",
        "payment_provider": "manual",
        "provider_customer_id": "",
        "provider_subscription_id": f"gift_{new_id()[:8]}",
        "current_period_start": now.isoformat(),
        "current_period_end": new_expiry.isoformat(),
        "gifted_by_admin_id": user["id"],
        "gift_reason": data.reason or "",
        "cancelled_at": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.subscriptions.update_one({"owner_id": owner_id}, {"$set": sub_doc}, upsert=True)
    await log_action(user, "gift_plan", "subscription", owner_id, after={"plan": plan, "months": months, "reason": data.reason})
    return {"ok": True, "plan": plan, "expires_at": new_expiry.isoformat()}

@api_router.post("/admin/subscriptions/{owner_id}/cancel")
async def admin_cancel_plan(owner_id: str, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    target = await db.users.find_one({"id": owner_id})
    if not target:
        raise HTTPException(404, "Owner not found")
    await db.users.update_one({"id": owner_id}, {"$set": {
        "plan_status": "cancelled",
        "updated_at": now_iso(),
    }})
    await db.subscriptions.update_one({"owner_id": owner_id}, {"$set": {
        "status": "cancelled",
        "cancelled_at": now_iso(),
        "updated_at": now_iso(),
    }})
    await log_action(user, "cancel_plan", "subscription", owner_id)
    return {"ok": True}

@api_router.post("/admin/subscriptions/{owner_id}/manual-upgrade")
async def admin_manual_upgrade(owner_id: str, data: AdminManualUpgradeIn, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    if data.plan not in ("starter", "growth", "pro"):
        raise HTTPException(400, "Invalid plan")
    target = await db.users.find_one({"id": owner_id})
    if not target:
        raise HTTPException(404, "Owner not found")
    now = datetime.now(timezone.utc)
    if data.plan == "starter":
        expiry = None
        status = "free"
    else:
        expiry = (now + timedelta(days=30 * max(1, data.months))).isoformat()
        status = "active"
    updates = {
        "plan": data.plan,
        "plan_status": status,
        "plan_started_at": now.isoformat(),
        "plan_expires_at": expiry,
        "updated_at": now_iso(),
    }
    await db.users.update_one({"id": owner_id}, {"$set": updates})
    if data.plan != "starter":
        sub_doc = {
            "id": new_id(),
            "owner_id": owner_id,
            "plan": data.plan,
            "status": status,
            "payment_provider": "manual",
            "provider_customer_id": "",
            "provider_subscription_id": f"manual_{new_id()[:8]}",
            "current_period_start": now.isoformat(),
            "current_period_end": expiry,
            "cancelled_at": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.subscriptions.update_one({"owner_id": owner_id}, {"$set": sub_doc}, upsert=True)
    await log_action(user, "manual_upgrade", "user", owner_id, after=updates, reason=data.reason or "")
    return {"ok": True, "plan": data.plan, "expires_at": expiry}

@api_router.get("/admin/plans")
async def admin_list_plans(user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    return await db.plan_configs.find({}, {"_id": 0}).sort("price", 1).to_list(5000000)

@api_router.patch("/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, data: dict, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    existing = await db.plan_configs.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(404, "Plan not found")
    allowed = {"price", "features", "limits", "active"}
    if not data or set(data) - allowed:
        raise HTTPException(400, "Only price, features, limits, and active status can be edited")
    updates = {}
    if "price" in data:
        price = data["price"]
        if isinstance(price, bool) or not isinstance(price, (int, float)) or price < 0 or price > 10000000 or price * 100 != round(price * 100):
            raise HTTPException(400, "Invalid plan price")
        if (plan_id == "starter" and price != 0) or (plan_id != "starter" and price < 100):
            raise HTTPException(400, "Starter must be free and paid plans at least NGN 100")
        updates["price"] = price
    if "active" in data:
        if not isinstance(data["active"], bool) or (plan_id == "starter" and data["active"] is False):
            raise HTTPException(400, "Invalid plan active status")
        updates["active"] = data["active"]
    if "features" in data:
        features = data["features"]
        if not isinstance(features, list) or len(features) > 30 or any(not isinstance(f, str) or not 1 <= len(f.strip()) <= 120 for f in features):
            raise HTTPException(400, "Features must be a list of short descriptions")
        updates["features"] = [f.strip() for f in features]
    if "limits" in data:
        limits = data["limits"]
        known = existing.get("limits", {})
        if not isinstance(limits, dict) or set(limits) - set(known):
            raise HTTPException(400, "Invalid plan limit fields")
        for key, value in limits.items():
            if isinstance(known[key], bool):
                if not isinstance(value, bool):
                    raise HTTPException(400, "Expected a boolean flag: " + key)
            elif isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 10000000:
                raise HTTPException(400, "Invalid numeric limit: " + key)
            updates[f"limits.{key}"] = value
    updates["updated_at"] = now_iso()
    await db.plan_configs.update_one({"id": plan_id}, {"$set": updates})
    await log_action(user, "edit_plan", "plan", plan_id, after=updates)
    return {"ok": True}

@api_router.get("/admin/audit-logs")
async def admin_audit_logs(limit: int = 200, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    return logs


# ---------------- ROOT ----------------
@api_router.get("/")
async def root():
    return {"message": "FixMyCribs API", "status": "ok"}


# ================== PHASE 2 ==================

# ---------------- MODELS (PHASE 2) ----------------
class BillIn(BaseModel):
    tenant_id: str
    bill_type: str  # diesel_deposit | electricity_postpaid | other
    title: str
    description: Optional[str] = ""
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    previous_reading: float = 0
    current_reading: float = 0
    rate: float = 0
    fixed_amount: float = 0
    diesel_amount: float = 0  # Optional diesel on the same electricity invoice
    due_date: str

class BulkDieselIn(BaseModel):
    property_id: str
    tenant_ids: Optional[List[str]] = None
    title: str
    amount_per_tenant: float
    due_date: str
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None

class MeterReadingIn(BaseModel):
    tenant_id: str
    previous_reading: float = 0
    current_reading: float = 0
    include_electricity: bool = True
    diesel_amount: float = 0

class BulkElectricityIn(BaseModel):
    property_id: str
    rate: float
    due_date: str
    title: Optional[str] = ""
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    readings: List[MeterReadingIn]

class ServiceChargeIn(BaseModel):
    tenant_id: str
    title: str = "Service charge"
    description: Optional[str] = ""
    amount: float
    due_date: str
    frequency: str = "one_time"  # one_time | weekly | monthly | quarterly | yearly
    occurrences: int = 1  # how many bills to generate

class BillPaymentIn(BaseModel):
    amount: float
    method: str = "cash"
    reference: Optional[str] = ""
    payment_date: Optional[str] = None
    notes: Optional[str] = ""

class ComplaintIn(BaseModel):
    title: str
    category: str = "other"
    priority: str = "normal"
    description: str

class ComplaintUpdateIn(BaseModel):
    landlord_remark: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None

class ComplaintAssignIn(BaseModel):
    facility_manager_id: str

class ComplaintRemarkIn(BaseModel):
    message: str

class ComplaintStatusIn(BaseModel):
    status: str  # pending | in_progress | completed | cannot_complete
    remark: Optional[str] = ""
    pending_reason: Optional[str] = ""
    completion_note: Optional[str] = ""

class FacilityManagerIn(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = ""
    permissions: Optional[Dict[str, bool]] = None

class FacilityManagerUpdateIn(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None
    status: Optional[str] = None

class SupportTicketIn(BaseModel):
    subject: str
    category: str = "other"
    priority: str = "normal"
    message: str

class SupportTicketMessageIn(BaseModel):
    message: str
    internal: bool = False

class SupportTicketPatchIn(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_support_id: Optional[str] = None

class AdminCreateUserIn(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = ""
    password: str = Field(..., min_length=8)
    role: str  # support | admin


DEFAULT_FM_PERMISSIONS = {
    "view_payments": True,
    "view_bills": True,
    "view_complaints": True,
    "update_complaints": True,
    "view_tenant_contact": False,
}


def compute_bill_status(due_date_str: str, amount_due: float, amount_paid: float) -> str:
    today = date.today()
    try:
        due = parse_date(due_date_str)
    except Exception:
        return "issued"
    if amount_due <= 0:
        return "draft"
    if amount_paid >= amount_due:
        return "paid"
    if amount_paid > 0:
        return "partially_paid" if today <= due else "overdue"
    if today > due:
        return "overdue"
    return "issued"


async def _tenant_scope_from_id(owner_id: str, tenant_id: str) -> dict:
    t = await db.tenants.find_one({"id": tenant_id, "user_id": owner_id})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


# ---------------- BILLS (OWNER) ----------------
def _build_bill_doc(owner_id: str, tenant: dict, data: BillIn) -> dict:
    units_consumed = 0.0
    if data.bill_type == "electricity_postpaid":
        units_consumed = max(0.0, data.current_reading - data.previous_reading)
        amount_due = round(units_consumed * data.rate + data.diesel_amount, 2)
    elif data.bill_type == "diesel_deposit":
        amount_due = data.fixed_amount
    else:
        amount_due = data.fixed_amount
    return {
        "id": new_id(),
        "owner_id": owner_id,
        "tenant_id": tenant["id"],
        "tenant_user_id": tenant.get("tenant_user_id"),
        "property_id": tenant["property_id"],
        "unit_id": tenant.get("unit_id"),
        "apartment_number": tenant.get("apartment_number", ""),
        "bill_type": data.bill_type,
        "title": data.title,
        "description": data.description,
        "billing_period_start": data.billing_period_start,
        "billing_period_end": data.billing_period_end,
        "previous_reading": data.previous_reading,
        "current_reading": data.current_reading,
        "units_consumed": units_consumed,
        "electricity_amount": round(units_consumed * data.rate, 2) if data.bill_type == "electricity_postpaid" else 0,
        "diesel_amount": data.diesel_amount if data.bill_type == "electricity_postpaid" else (data.fixed_amount if data.bill_type == "diesel_deposit" else 0),
        "rate": data.rate,
        "fixed_amount": data.fixed_amount,
        "amount_due": amount_due,
        "amount_paid": 0.0,
        "balance": amount_due,
        "status": compute_bill_status(data.due_date, amount_due, 0),
        "due_date": data.due_date,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


@api_router.post("/bills")
async def create_bill(data: BillIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "bills", "Utility bills")
    if data.bill_type == "electricity_postpaid":
        await require_feature(user, "postpaid_billing", "Postpaid electricity billing")
    if data.diesel_amount < 0 or data.fixed_amount < 0 or data.rate < 0:
        raise HTTPException(400, "Amounts must be nonnegative")
    t = await _tenant_scope_from_id(user["id"], data.tenant_id)
    doc = _build_bill_doc(user["id"], t, data)
    await db.utility_bills.insert_one(doc)
    return strip_private(doc)


@api_router.post("/bills/bulk/diesel-deposit")
async def bulk_diesel(data: BulkDieselIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "bills", "Utility bills")
    q = {"user_id": user["id"], "property_id": data.property_id, "status": {"$ne": "archived"}}
    if data.tenant_ids:
        q["id"] = {"$in": data.tenant_ids}
    tenants = await db.tenants.find(q, {"_id": 0}).to_list(5000000)
    if not tenants:
        raise HTTPException(400, "No matching tenants in this property")
    created = []
    for t in tenants:
        doc = _build_bill_doc(user["id"], t, BillIn(
            tenant_id=t["id"],
            bill_type="diesel_deposit",
            title=data.title,
            billing_period_start=data.billing_period_start,
            billing_period_end=data.billing_period_end,
            fixed_amount=data.amount_per_tenant,
            due_date=data.due_date,
        ))
        await db.utility_bills.insert_one(doc)
        created.append(strip_private(doc))
    return {"created_count": len(created), "bills": created}


@api_router.post("/bills/bulk/electricity-postpaid")
async def bulk_electricity(data: BulkElectricityIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "postpaid_billing", "Postpaid electricity billing")
    created = []
    if len({r.tenant_id for r in data.readings}) != len(data.readings):
        raise HTTPException(400, "Duplicate tenants in this batch")
    for r in data.readings:
        if r.diesel_amount < 0 or r.previous_reading < 0 or r.current_reading < 0:
            raise HTTPException(400, "Readings and diesel amounts must be nonnegative")
        if not r.include_electricity and r.diesel_amount <= 0:
            raise HTTPException(400, "Choose electricity or enter a diesel amount")
        if r.include_electricity and r.current_reading < r.previous_reading:
            raise HTTPException(400, f"Current reading must be >= previous reading for tenant {r.tenant_id}")
        t = await _tenant_scope_from_id(user["id"], r.tenant_id)
        if t["property_id"] != data.property_id:
            raise HTTPException(400, "Tenant does not belong to specified property")
        title = data.title or f"Electricity postpaid ({data.billing_period_start or 'period'})"
        doc = _build_bill_doc(user["id"], t, BillIn(
            tenant_id=t["id"],
            bill_type="electricity_postpaid" if r.include_electricity else "diesel_deposit",
            title=title if r.include_electricity else "Diesel deposit",
            billing_period_start=data.billing_period_start,
            billing_period_end=data.billing_period_end,
            previous_reading=r.previous_reading,
            current_reading=r.current_reading,
            rate=data.rate if r.include_electricity else 0,
            fixed_amount=r.diesel_amount if not r.include_electricity else 0,
            diesel_amount=r.diesel_amount if r.include_electricity else 0,
            due_date=data.due_date,
        ))
        await db.utility_bills.insert_one(doc)
        created.append(strip_private(doc))
    return {"created_count": len(created), "bills": created}


@api_router.post("/bills/service-charge")
async def create_service_charge(data: ServiceChargeIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "bills", "Utility bills")
    t = await _tenant_scope_from_id(user["id"], data.tenant_id)
    step_days = {"one_time": 0, "weekly": 7, "monthly": 30, "quarterly": 91, "yearly": 365}
    if data.frequency not in step_days:
        raise HTTPException(400, "Invalid frequency")
    occ = 1 if data.frequency == "one_time" else max(1, min(24, data.occurrences))
    step = step_days[data.frequency]
    try:
        base_due = parse_date(data.due_date)
    except Exception:
        raise HTTPException(400, "Invalid due date")
    created = []
    for i in range(occ):
        due = base_due if i == 0 else (base_due + timedelta(days=step * i))
        suffix = "" if data.frequency == "one_time" or occ == 1 else f" ({i+1}/{occ})"
        doc = _build_bill_doc(user["id"], t, BillIn(
            tenant_id=t["id"],
            bill_type="service_charge",
            title=(data.title or "Service charge") + suffix,
            description=data.description or "",
            fixed_amount=data.amount,
            due_date=due.isoformat(),
        ))
        doc["frequency"] = data.frequency
        await db.utility_bills.insert_one(doc)
        created.append(strip_private(doc))
    return {"created_count": len(created), "bills": created, "frequency": data.frequency}




class BillUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount_due: Optional[float] = None
    due_date: Optional[str] = None
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    previous_reading: Optional[float] = None
    current_reading: Optional[float] = None
    rate: Optional[float] = None


@api_router.get("/bills")
async def list_bills(
    bill_type: Optional[str] = None,
    tenant_id: Optional[str] = None,
    property_id: Optional[str] = None,
    month: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 50,
    user=Depends(get_current_user),
):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    q: Dict[str, Any] = {"owner_id": user["id"], "tenant_id": {"$in": active_ids}}
    if bill_type and bill_type != "all":
        q["bill_type"] = bill_type
    if tenant_id and tenant_id != "all":
        q["tenant_id"] = tenant_id
    if property_id and property_id != "all":
        q["property_id"] = property_id
    if month and month != "all":
        q["due_date"] = {"$regex": f"^{month}"}

    async def enrich(items):
        if not items:
            return items
        tids = list({b["tenant_id"] for b in items})
        pids = list({b.get("property_id") for b in items if b.get("property_id")})
        tname = {t["id"]: t.get("full_name", "-") async for t in
                 db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "full_name": 1})}
        pname = {p["id"]: p.get("name", "-") async for p in
                 db.properties.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "name": 1})}
        for b in items:
            b["tenant_name"] = tname.get(b["tenant_id"], "-")
            b["property_name"] = pname.get(b.get("property_id"), "-")
        return items

    if page is None:
        items = await db.utility_bills.find(q, {"_id": 0}).sort([("created_at", -1), ("id", 1)]).to_list(5000000)
        return await enrich(items)

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    total = await db.utility_bills.count_documents(q)
    items = await db.utility_bills.find(q, {"_id": 0}).sort([("due_date", -1), ("id", 1)]).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    items = await enrich(items)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@api_router.get("/bills/property/{pid}/summary")
async def property_bills_summary(pid: str, month: Optional[str] = "all", user=Depends(get_current_user)):
    """Month list + month-scoped totals & per-type counts for the PropertyBills drill-down.
    Computed server-side so the page never downloads every bill."""
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    base = {"owner_id": user["id"], "property_id": pid, "tenant_id": {"$in": active_ids}}
    has_month = month not in (None, "", "all")
    match = dict(base)
    if has_month:
        match["due_date"] = {"$regex": f"^{month}"}

    months = sorted({d["_id"] async for d in db.utility_bills.aggregate([
        {"$match": base},
        {"$group": {"_id": {"$substrBytes": ["$due_date", 0, 7]}}},
    ]) if d["_id"]}, reverse=True)

    totals = {"expected": 0.0, "collected": 0.0, "outstanding": 0.0,
              "diesel": 0.0, "elec": 0.0, "svc": 0.0, "other": 0.0}
    counts = {"all": 0, "diesel_deposit": 0, "electricity_postpaid": 0, "service_charge": 0, "other": 0}
    async for d in db.utility_bills.aggregate([
        {"$match": match},
        {"$group": {"_id": "$bill_type", "expected": {"$sum": "$amount_due"},
                    "collected": {"$sum": "$amount_paid"}, "outstanding": {"$sum": "$balance"},
                    "n": {"$sum": 1}}},
    ]):
        bt = d["_id"]
        totals["expected"] += d["expected"] or 0
        totals["collected"] += d["collected"] or 0
        totals["outstanding"] += max(0, d["outstanding"] or 0)
        counts["all"] += d["n"]
        if bt == "diesel_deposit":
            totals["diesel"] += max(0, d["outstanding"] or 0); counts["diesel_deposit"] += d["n"]
        elif bt == "electricity_postpaid":
            totals["elec"] += max(0, d["outstanding"] or 0); counts["electricity_postpaid"] += d["n"]
        elif bt == "service_charge":
            totals["svc"] += max(0, d["outstanding"] or 0); counts["service_charge"] += d["n"]
        else:
            totals["other"] += max(0, d["outstanding"] or 0); counts["other"] += d["n"]

    prop = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1, "address": 1, "city": 1})
    return {"property": prop, "months": months, "totals": totals, "counts": counts}


@api_router.get("/bills/summary")
async def bills_summary(
    bill_type: Optional[str] = None,
    tenant_id: Optional[str] = None,
    property_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    q: Dict[str, Any] = {"owner_id": user["id"], "tenant_id": {"$in": active_ids}}
    if bill_type and bill_type != "all":
        q["bill_type"] = bill_type
    if tenant_id and tenant_id != "all":
        q["tenant_id"] = tenant_id
    if property_id and property_id != "all":
        q["property_id"] = property_id
    bills = await db.utility_bills.find(q, {"_id": 0}).to_list(5000000)
    diesel_exp = diesel_col = elec_exp = elec_col = svc_exp = svc_col = other_exp = other_col = 0.0
    by_apartment: Dict[str, Dict[str, Any]] = {}
    for b in bills:
        exp = b["amount_due"]
        col = b["amount_paid"]
        bt = b.get("bill_type", "other")
        if bt == "diesel_deposit":
            diesel_exp += exp; diesel_col += col
        elif bt == "electricity_postpaid":
            elec_exp += exp; elec_col += col
        elif bt == "service_charge":
            svc_exp += exp; svc_col += col
        else:
            other_exp += exp; other_col += col
        key = b["tenant_id"]
        if key not in by_apartment:
            t = await db.tenants.find_one({"id": key}, {"_id": 0}) or {}
            by_apartment[key] = {
                "tenant_id": key,
                "tenant_name": t.get("full_name", "-"),
                "apartment_number": t.get("apartment_number", ""),
                "diesel_outstanding": 0.0,
                "electricity_outstanding": 0.0,
                "service_charge_outstanding": 0.0,
                "other_outstanding": 0.0,
                "total_outstanding": 0.0,
                "total_expected": 0.0,
                "total_collected": 0.0,
            }
        bal = max(0.0, exp - col)
        if bt == "diesel_deposit":
            by_apartment[key]["diesel_outstanding"] += bal
        elif bt == "electricity_postpaid":
            by_apartment[key]["electricity_outstanding"] += bal
        elif bt == "service_charge":
            by_apartment[key]["service_charge_outstanding"] += bal
        else:
            by_apartment[key]["other_outstanding"] += bal
        by_apartment[key]["total_outstanding"] += bal
        by_apartment[key]["total_expected"] += exp
        by_apartment[key]["total_collected"] += col
    total_exp = diesel_exp + elec_exp + svc_exp + other_exp
    total_col = diesel_col + elec_col + svc_col + other_col
    return {
        "diesel_deposit_total_expected": diesel_exp,
        "diesel_deposit_total_collected": diesel_col,
        "diesel_deposit_total_outstanding": max(0.0, diesel_exp - diesel_col),
        "electricity_postpaid_total_expected": elec_exp,
        "electricity_postpaid_total_collected": elec_col,
        "electricity_postpaid_total_outstanding": max(0.0, elec_exp - elec_col),
        "service_charge_total_expected": svc_exp,
        "service_charge_total_collected": svc_col,
        "service_charge_total_outstanding": max(0.0, svc_exp - svc_col),
        "other_total_expected": other_exp,
        "other_total_collected": other_col,
        "other_total_outstanding": max(0.0, other_exp - other_col),
        "grand_total_expected": total_exp,
        "grand_total_collected": total_col,
        "grand_total_outstanding": max(0.0, total_exp - total_col),
        "by_apartment": list(by_apartment.values()),
    }


@api_router.get("/bills/property-summary")
async def bills_property_summary(month: Optional[str] = "all", user=Depends(get_current_user)):
    """Per-property bill aggregates for the Bills landing cards. Computed server-side
    so the client never downloads every bill. Optional month filter on due_date."""
    require_roles(user, ["owner"])
    uid = user["id"]
    active_ids = await _active_tenant_ids(uid)
    has_month = month not in (None, "", "all")

    match = {"owner_id": uid, "tenant_id": {"$in": active_ids}}
    if has_month:
        match["due_date"] = {"$regex": f"^{month}"}

    agg = {d["_id"]: d async for d in db.utility_bills.aggregate([
        {"$match": match},
        {"$group": {
            "_id": "$property_id",
            "expected": {"$sum": "$amount_due"},
            "collected": {"$sum": "$amount_paid"},
            "outstanding": {"$sum": "$balance"},
            "bill_count": {"$sum": 1},
            "overdue_count": {"$sum": {"$cond": [{"$eq": ["$status", "overdue"]}, 1, 0]}},
            "diesel_out": {"$sum": {"$cond": [{"$eq": ["$bill_type", "diesel_deposit"]}, "$balance", 0]}},
            "elec_out": {"$sum": {"$cond": [{"$eq": ["$bill_type", "electricity_postpaid"]}, "$balance", 0]}},
            "svc_out": {"$sum": {"$cond": [{"$eq": ["$bill_type", "service_charge"]}, "$balance", 0]}},
        }},
    ])}

    tcount = {d["_id"]: d["n"] async for d in db.tenants.aggregate([
        {"$match": {"user_id": uid, "status": "active"}},
        {"$group": {"_id": "$property_id", "n": {"$sum": 1}}},
    ])}

    # distinct due-months for the month filter dropdown
    months = sorted({d["_id"] async for d in db.utility_bills.aggregate([
        {"$match": {"owner_id": uid}},
        {"$group": {"_id": {"$substrBytes": ["$due_date", 0, 7]}}},
    ]) if d["_id"]}, reverse=True)

    props = await db.properties.find({"user_id": uid}, {"_id": 0, "id": 1, "name": 1, "address": 1, "city": 1}).to_list(5000000)
    properties = []
    tot_e = tot_c = tot_o = 0.0
    for p in props:
        a = agg.get(p["id"], {})
        e = a.get("expected", 0) or 0
        c = a.get("collected", 0) or 0
        o = max(0.0, a.get("outstanding", 0) or 0)
        tot_e += e; tot_c += c; tot_o += o
        properties.append({
            "property_id": p["id"], "property_name": p["name"],
            "address": p.get("address", ""), "city": p.get("city", ""),
            "active_tenants": tcount.get(p["id"], 0),
            "expected": e, "collected": c, "outstanding": o,
            "diesel_out": max(0.0, a.get("diesel_out", 0) or 0),
            "elec_out": max(0.0, a.get("elec_out", 0) or 0),
            "svc_out": max(0.0, a.get("svc_out", 0) or 0),
            "bill_count": a.get("bill_count", 0),
            "overdue_count": a.get("overdue_count", 0),
        })
    return {
        "months": months,
        "properties": properties,
        "totals": {"expected": tot_e, "collected": tot_c, "outstanding": tot_o},
    }


@api_router.get("/apartments/summary")
async def apartments_summary(user=Depends(get_current_user)):
    """List of active apartments (each represented by its tenant) with aggregated totals for the drill-down view."""
    require_roles(user, ["owner"])
    tenants = await db.tenants.find({"user_id": user["id"], "status": "active"}, {"_id": 0}).to_list(5000000)
    result = []
    for t in tenants:
        prop = await db.properties.find_one({"id": t["property_id"]}, {"_id": 0, "name": 1})
        recs = await db.rent_records.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(5000000)
        rent_exp = sum(r["amount_due"] for r in recs)
        rent_col = sum(r["amount_paid"] for r in recs)
        bills = await db.utility_bills.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(5000000)
        util_exp = sum(b["amount_due"] for b in bills if b.get("bill_type") in ("diesel_deposit", "electricity_postpaid", "other"))
        util_col = sum(b["amount_paid"] for b in bills if b.get("bill_type") in ("diesel_deposit", "electricity_postpaid", "other"))
        svc_exp = sum(b["amount_due"] for b in bills if b.get("bill_type") == "service_charge")
        svc_col = sum(b["amount_paid"] for b in bills if b.get("bill_type") == "service_charge")
        total_exp = rent_exp + util_exp + svc_exp
        total_col = rent_col + util_col + svc_col
        result.append({
            "tenant_id": t["id"],
            "tenant_name": t["full_name"],
            "apartment_number": t.get("apartment_number", ""),
            "property_id": t["property_id"],
            "property_name": prop["name"] if prop else "-",
            "rent_expected": rent_exp,
            "rent_collected": rent_col,
            "rent_outstanding": max(0.0, rent_exp - rent_col),
            "utility_expected": util_exp,
            "utility_collected": util_col,
            "utility_outstanding": max(0.0, util_exp - util_col),
            "service_charge_expected": svc_exp,
            "service_charge_collected": svc_col,
            "service_charge_outstanding": max(0.0, svc_exp - svc_col),
            "total_expected": total_exp,
            "total_collected": total_col,
            "total_outstanding": max(0.0, total_exp - total_col),
        })
    result.sort(key=lambda x: (x["property_name"], x["apartment_number"], x["tenant_name"]))
    return result


class BulkServiceChargeIn(BaseModel):
    tenant_id: str
    title: str = "Service charge"
    description: Optional[str] = ""
    fixed_amount: float
    start_date: str
    frequency: str  # one_time | weekly | monthly | quarterly | yearly
    occurrences: int = 12


@api_router.post("/bills/bulk/service-charge")
async def bulk_service_charge(data: BulkServiceChargeIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "bills", "Utility bills")
    t = await db.tenants.find_one({"id": data.tenant_id, "user_id": user["id"]})
    if not t:
        raise HTTPException(404, "Tenant not found")
    step_days_map = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365, "one_time": 0}
    if data.frequency not in step_days_map:
        raise HTTPException(400, "Invalid frequency")
    occ = 1 if data.frequency == "one_time" else max(1, min(24, data.occurrences))
    step = step_days_map[data.frequency]
    try:
        base_date = datetime.fromisoformat(data.start_date).date()
    except Exception:
        raise HTTPException(400, "Invalid start_date")
    created = []
    for i in range(occ):
        due = (base_date + timedelta(days=step * i)).isoformat()
        suffix = "" if occ == 1 else f" ({i + 1}/{occ})"
        bill = {
            "id": new_id(),
            "owner_id": user["id"],
            "user_id": user["id"],
            "tenant_id": data.tenant_id,
            "tenant_user_id": t.get("tenant_user_id"),
            "property_id": t["property_id"],
            "apartment_number": t.get("apartment_number", ""),
            "bill_type": "service_charge",
            "title": f"{data.title}{suffix}",
            "description": data.description,
            "amount_due": data.fixed_amount,
            "fixed_amount": data.fixed_amount,
            "amount_paid": 0.0,
            "balance": data.fixed_amount,
            "status": compute_bill_status(due, data.fixed_amount, 0.0),
            "due_date": due,
            "frequency": data.frequency,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.utility_bills.insert_one(bill)
        bill.pop("_id", None)
        created.append(bill)
    return {"ok": True, "count": len(created), "bills": created}


@api_router.patch("/bills/{bill_id}")
async def update_bill(bill_id: str, data: BillUpdateIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    b = await db.utility_bills.find_one({"id": bill_id, "owner_id": user["id"]})
    if not b:
        raise HTTPException(404, "Not found")
    upd: Dict[str, Any] = {}
    if data.title is not None: upd["title"] = data.title
    if data.description is not None: upd["description"] = data.description
    if data.due_date is not None: upd["due_date"] = data.due_date
    if data.billing_period_start is not None: upd["billing_period_start"] = data.billing_period_start
    if data.billing_period_end is not None: upd["billing_period_end"] = data.billing_period_end
    if data.previous_reading is not None: upd["previous_reading"] = data.previous_reading
    if data.current_reading is not None: upd["current_reading"] = data.current_reading
    if data.rate is not None: upd["rate"] = data.rate
    # Recompute amount_due when readings/rate change (electricity) or explicit amount_due passed
    new_amount = None
    if b.get("bill_type") == "electricity_postpaid" and (data.previous_reading is not None or data.current_reading is not None or data.rate is not None):
        prev = data.previous_reading if data.previous_reading is not None else b["previous_reading"]
        curr = data.current_reading if data.current_reading is not None else b["current_reading"]
        rate = data.rate if data.rate is not None else b["rate"]
        units = max(0.0, curr - prev)
        new_amount = units * rate
        upd["units_consumed"] = units
    if data.amount_due is not None:
        new_amount = data.amount_due
        upd["fixed_amount"] = data.amount_due
    if new_amount is not None:
        upd["amount_due"] = new_amount
        upd["balance"] = max(0.0, new_amount - b["amount_paid"])
        upd["status"] = compute_bill_status(upd.get("due_date", b["due_date"]), new_amount, b["amount_paid"])
    upd["updated_at"] = now_iso()
    await db.utility_bills.update_one({"id": bill_id}, {"$set": upd})
    return {"ok": True}


@api_router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    r = await db.utility_bills.delete_one({"id": bill_id, "owner_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await db.bill_payments.delete_many({"bill_id": bill_id})
    return {"ok": True}


@api_router.post("/bills/{bill_id}/payments")
async def record_bill_payment(bill_id: str, data: BillPaymentIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    b = await db.utility_bills.find_one({"id": bill_id, "owner_id": user["id"]})
    if not b:
        raise HTTPException(404, "Not found")
    payment_date = data.payment_date or date.today().isoformat()
    pay = {
        "id": new_id(),
        "owner_id": user["id"],
        "bill_id": bill_id,
        "tenant_id": b["tenant_id"],
        "amount": data.amount,
        "method": data.method,
        "reference": data.reference,
        "payment_date": payment_date,
        "notes": data.notes,
        "created_at": now_iso(),
    }
    await db.bill_payments.insert_one(pay)
    new_paid = b["amount_paid"] + data.amount
    new_balance = max(0.0, b["amount_due"] - new_paid)
    new_status = compute_bill_status(b["due_date"], b["amount_due"], new_paid)
    await db.utility_bills.update_one({"id": bill_id}, {"$set": {
        "amount_paid": new_paid, "balance": new_balance, "status": new_status, "updated_at": now_iso(),
    }})
    return strip_private(pay)


@api_router.delete("/bills/{bill_id}/payments/{pid}")
async def delete_bill_payment(bill_id: str, pid: str, user=Depends(get_current_user)):
    """Undo a single bill payment. Recomputes balance & status."""
    require_roles(user, ["owner"])
    b = await db.utility_bills.find_one({"id": bill_id, "owner_id": user["id"]})
    if not b:
        raise HTTPException(404, "Bill not found")
    p = await db.bill_payments.find_one({"id": pid, "bill_id": bill_id})
    if not p:
        raise HTTPException(404, "Payment not found")
    new_paid = max(0.0, b["amount_paid"] - p["amount"])
    new_balance = b["amount_due"] - new_paid
    new_status = compute_bill_status(b["due_date"], b["amount_due"], new_paid)
    await db.bill_payments.delete_one({"id": pid})
    await db.utility_bills.update_one({"id": bill_id}, {"$set": {
        "amount_paid": new_paid, "balance": new_balance, "status": new_status, "updated_at": now_iso(),
    }})
    return {"ok": True}


@api_router.post("/bills/{bill_id}/mark-fully-paid")
async def mark_bill_fully_paid(bill_id: str, user=Depends(get_current_user)):
    """One-click settle the bill with a system payment for the remaining balance."""
    require_roles(user, ["owner"])
    b = await db.utility_bills.find_one({"id": bill_id, "owner_id": user["id"]})
    if not b:
        raise HTTPException(404, "Not found")
    remaining = b["amount_due"] - b["amount_paid"]
    if remaining <= 0:
        await db.utility_bills.update_one({"id": bill_id}, {"$set": {"amount_paid": b["amount_due"], "balance": 0, "status": "paid", "updated_at": now_iso()}})
        return {"ok": True, "already_paid": True}
    pay = {
        "id": new_id(),
        "owner_id": user["id"],
        "bill_id": bill_id,
        "tenant_id": b["tenant_id"],
        "amount": remaining,
        "method": "manual_mark_paid",
        "reference": "Marked as paid",
        "payment_date": date.today().isoformat(),
        "notes": "One-click mark as fully paid",
        "created_at": now_iso(),
    }
    await db.bill_payments.insert_one(pay)
    await db.utility_bills.update_one({"id": bill_id}, {"$set": {
        "amount_paid": b["amount_due"], "balance": 0, "status": "paid", "updated_at": now_iso(),
    }})
    return {"ok": True}


@api_router.post("/bills/{bill_id}/mark-unpaid")
async def mark_bill_unpaid(bill_id: str, user=Depends(get_current_user)):
    """Wipe every payment on this bill and reset amount_paid to 0."""
    require_roles(user, ["owner"])
    b = await db.utility_bills.find_one({"id": bill_id, "owner_id": user["id"]})
    if not b:
        raise HTTPException(404, "Not found")
    del_res = await db.bill_payments.delete_many({"bill_id": bill_id})
    new_status = compute_bill_status(b["due_date"], b["amount_due"], 0)
    await db.utility_bills.update_one({"id": bill_id}, {"$set": {
        "amount_paid": 0, "balance": b["amount_due"], "status": new_status, "updated_at": now_iso(),
    }})
    return {"ok": True, "deleted_payments": del_res.deleted_count}


# ---------------- BILLS EXPORT / IMPORT ----------------
def _bill_month_key(iso: str) -> str:
    if not iso:
        return "Unknown"
    try:
        d = parse_date(iso)
        return f"{d.year}-{d.month:02d}"
    except Exception:
        return "Unknown"


def _month_sheet_title(key: str) -> str:
    if key == "Unknown":
        return "Unknown"
    try:
        y, m = key.split("-")
        return datetime(int(y), int(m), 1).strftime("%b %Y")
    except Exception:
        return key


EXPORT_COLUMNS = ["Property", "Apartment", "Tenant", "Bill Type", "Title",
                  "Amount Due", "Amount Paid", "Balance", "Usage (kWh)", "Rate",
                  "Status", "Due Date"]


@api_router.get("/bills/export")
async def export_bills(
    period: str = "all",          # month | year | all
    month: Optional[str] = None,  # YYYY-MM (when period=month)
    year: Optional[str] = None,   # YYYY (when period=year)
    property_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    require_roles(user, ["owner"])
    await require_feature(user, "reports", "Reports & exports")
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    active_ids = await _active_tenant_ids(user["id"])
    q: Dict[str, Any] = {"owner_id": user["id"], "tenant_id": {"$in": active_ids}}
    if property_id and property_id != "all":
        q["property_id"] = property_id
    if tenant_id and tenant_id != "all":
        q["tenant_id"] = tenant_id
    bills = await db.utility_bills.find(q, {"_id": 0}).to_list(5000000)

    # period filter
    def _in_period(b):
        mk = _bill_month_key(b.get("due_date"))
        if period == "month" and month:
            return mk == month
        if period == "year" and year:
            return mk.startswith(f"{year}-")
        return True
    bills = [b for b in bills if _in_period(b)]

    # name lookups
    prop_names: Dict[str, str] = {}
    tid_names: Dict[str, str] = {}
    for b in bills:
        pid = b.get("property_id")
        if pid and pid not in prop_names:
            p = await db.properties.find_one({"id": pid}, {"_id": 0})
            prop_names[pid] = p.get("name", "-") if p else "-"
        tid = b.get("tenant_id")
        if tid not in tid_names:
            t = await db.tenants.find_one({"id": tid}, {"_id": 0})
            tid_names[tid] = t.get("full_name", "-") if t else "-"

    # group bills: month -> property -> [bills]
    grouped: Dict[str, Dict[str, list]] = {}
    for b in bills:
        mk = _bill_month_key(b.get("due_date"))
        pid = b.get("property_id") or "none"
        grouped.setdefault(mk, {}).setdefault(pid, []).append(b)

    wb = Workbook()
    wb.remove(wb.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="047857")
    prop_font = Font(bold=True, size=12, color="065F46")
    prop_fill = PatternFill("solid", fgColor="D1FAE5")

    month_keys = sorted(grouped.keys())
    if not month_keys:
        ws = wb.create_sheet("No data")
        ws["A1"] = "No bills match the selected filters."

    for mk in month_keys:
        title = _month_sheet_title(mk)[:31] or "Sheet"
        ws = wb.create_sheet(title)
        row = 1
        for pid, plist in grouped[mk].items():
            # property header row
            ws.cell(row=row, column=1, value=prop_names.get(pid, "—")).font = prop_font
            ws.cell(row=row, column=1).fill = prop_fill
            row += 1
            # column headers
            for ci, col in enumerate(EXPORT_COLUMNS, start=1):
                c = ws.cell(row=row, column=ci, value=col)
                c.font = header_font
                c.fill = header_fill
            row += 1
            sub_due = sub_paid = sub_bal = 0.0
            for b in plist:
                ws.cell(row=row, column=1, value=prop_names.get(pid, "—"))
                ws.cell(row=row, column=2, value=b.get("apartment_number", ""))
                ws.cell(row=row, column=3, value=tid_names.get(b.get("tenant_id"), "-"))
                ws.cell(row=row, column=4, value=(b.get("bill_type", "") or "").replace("_", " "))
                ws.cell(row=row, column=5, value=b.get("title", ""))
                ws.cell(row=row, column=6, value=round(b.get("amount_due", 0) or 0, 2))
                ws.cell(row=row, column=7, value=round(b.get("amount_paid", 0) or 0, 2))
                ws.cell(row=row, column=8, value=round(b.get("balance", 0) or 0, 2))
                ws.cell(row=row, column=9, value=b.get("units_consumed", "") if b.get("bill_type") == "electricity_postpaid" else "")
                ws.cell(row=row, column=10, value=b.get("rate", "") if b.get("bill_type") == "electricity_postpaid" else "")
                ws.cell(row=row, column=11, value=(b.get("status", "") or "").replace("_", " "))
                ws.cell(row=row, column=12, value=b.get("due_date", ""))
                sub_due += b.get("amount_due", 0) or 0
                sub_paid += b.get("amount_paid", 0) or 0
                sub_bal += b.get("balance", 0) or 0
                row += 1
            # subtotal row
            tc = ws.cell(row=row, column=5, value="Subtotal")
            tc.font = Font(bold=True)
            ws.cell(row=row, column=6, value=round(sub_due, 2)).font = Font(bold=True)
            ws.cell(row=row, column=7, value=round(sub_paid, 2)).font = Font(bold=True)
            ws.cell(row=row, column=8, value=round(sub_bal, 2)).font = Font(bold=True)
            row += 2  # blank line before next property
        # column widths
        widths = [22, 12, 22, 18, 24, 14, 14, 14, 12, 8, 14, 14]
        for ci, w in enumerate(widths, start=1):
            ws.column_dimensions[ws.cell(row=1, column=ci).column_letter].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname_parts = ["bills"]
    if period == "month" and month:
        fname_parts.append(month)
    elif period == "year" and year:
        fname_parts.append(year)
    if property_id and property_id != "all":
        fname_parts.append(prop_names.get(property_id, "property").replace(" ", "_"))
    filename = "_".join(fname_parts) + ".xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


IMPORT_SYSTEM_MSG = (
    "You are a data extraction assistant for a property management app. "
    "You will receive raw tabular data (extracted from an Excel/CSV file the landlord uploaded) "
    "containing utility bill records. Convert it into a normalized JSON array of bill objects. "
    "Each object MUST use exactly these keys: "
    "tenant_name (string), apartment_number (string), bill_type (one of: "
    "electricity_postpaid, diesel_deposit, service_charge, other), title (string), "
    "amount_due (number), amount_paid (number), units (number, kWh consumed for electricity else 0), "
    "rate (number, per-kWh rate for electricity else 0), due_date (YYYY-MM-DD string). "
    "Infer bill_type from column names/values (e.g. electricity/power=electricity_postpaid, "
    "diesel/fuel/generator=diesel_deposit, service=service_charge, otherwise other). "
    "If a value is missing use 0 for numbers and empty string for strings. "
    "For any date, output ISO YYYY-MM-DD; if only a month is given, use the 1st. "
    "Respond ONLY with the JSON array, no markdown, no commentary."
)


def _extract_workbook_text(file_bytes: bytes) -> str:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    chunks = []
    for ws in wb.worksheets:
        rows = []
        for r in ws.iter_rows(values_only=True):
            if r is None:
                continue
            if any(c is not None and str(c).strip() != "" for c in r):
                rows.append([("" if c is None else str(c)) for c in r])
        if rows:
            chunks.append(f"### Sheet: {ws.title}\n" + "\n".join([" | ".join(r) for r in rows[:200]]))
    return "\n\n".join(chunks)


def _norm_name(s: str) -> str:
    return (s or "").strip().lower()


@api_router.post("/bills/import/analyze")
async def analyze_bill_import(
    file: UploadFile = File(...),
    property_id: str = Form(...),
    user=Depends(get_current_user),
):
    """AI reads the uploaded Excel and returns a preview of bill rows,
    split into matched (tenant found) and unmatched (tenant not found)."""
    require_roles(user, ["owner"])
    await require_feature(user, "reports", "Reports & exports")
    prop = await db.properties.find_one({"id": property_id, "user_id": user["id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(400, "Invalid property")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    try:
        text = _extract_workbook_text(raw)
    except Exception:
        logger.exception("Failed to read workbook")
        raise HTTPException(400, "Could not read the Excel file. Please upload a valid .xlsx file.")
    if not text.strip():
        raise HTTPException(400, "The uploaded sheet appears to be empty.")

    from ai_provider import completion
    parsed: list = []
    try:
        resp = await asyncio.wait_for(
            completion(IMPORT_SYSTEM_MSG, f"Raw data:\n\n{text}\n\nReturn the JSON array.", timeout=60),
            timeout=65,
        )
        s = resp if isinstance(resp, str) else str(resp)
        s = s.strip()
        if s.startswith("```"):
            s = s.split("```", 2)[1]
            if s.lstrip().startswith("json"):
                s = s.lstrip()[4:]
        s = s.strip().strip("`").strip()
        start = s.find("[")
        end = s.rfind("]")
        if start != -1 and end != -1:
            s = s[start:end + 1]
        parsed = _json.loads(s)
        if not isinstance(parsed, list):
            parsed = []
    except Exception:
        logger.exception("AI bill import parsing failed")
        raise HTTPException(422, "The AI could not understand this file. Make sure it has columns like tenant name, bill type, amount and date.")

    # tenants in this property (active) for matching
    tenants = await db.tenants.find(
        {"user_id": user["id"], "property_id": property_id, "status": {"$nin": ["archived", "access_revoked"]}},
        {"_id": 0},
    ).to_list(5000000)
    by_name = {_norm_name(t["full_name"]): t for t in tenants}
    by_apt = {_norm_name(t.get("apartment_number", "")): t for t in tenants if t.get("apartment_number")}

    matched, unmatched = [], []
    valid_types = {"electricity_postpaid", "diesel_deposit", "service_charge", "other"}
    for r in parsed:
        if not isinstance(r, dict):
            continue
        name = str(r.get("tenant_name", "")).strip()
        apt = str(r.get("apartment_number", "")).strip()
        bt = str(r.get("bill_type", "other")).strip()
        if bt not in valid_types:
            bt = "other"
        try:
            amount_due = float(r.get("amount_due") or 0)
        except Exception:
            amount_due = 0.0
        try:
            amount_paid = float(r.get("amount_paid") or 0)
        except Exception:
            amount_paid = 0.0
        try:
            units = float(r.get("units") or 0)
        except Exception:
            units = 0.0
        try:
            rate = float(r.get("rate") or 0)
        except Exception:
            rate = 0.0
        row = {
            "tenant_name": name,
            "apartment_number": apt,
            "bill_type": bt,
            "title": str(r.get("title") or bt.replace("_", " ").title()),
            "amount_due": amount_due,
            "amount_paid": amount_paid,
            "units": units,
            "rate": rate,
            "due_date": str(r.get("due_date") or date.today().isoformat())[:10],
        }
        t = by_name.get(_norm_name(name)) or (by_apt.get(_norm_name(apt)) if apt else None)
        if t:
            row["tenant_id"] = t["id"]
            row["matched_tenant_name"] = t["full_name"]
            row["apartment_number"] = row["apartment_number"] or t.get("apartment_number", "")
            matched.append(row)
        else:
            unmatched.append(row)

    return {
        "property_id": property_id,
        "property_name": prop.get("name"),
        "matched": matched,
        "unmatched": unmatched,
        "summary": {
            "total_rows": len(matched) + len(unmatched),
            "matched_count": len(matched),
            "unmatched_count": len(unmatched),
        },
    }


class ImportRow(BaseModel):
    tenant_id: Optional[str] = None
    tenant_name: str = ""
    apartment_number: str = ""
    bill_type: str = "other"
    title: str = ""
    amount_due: float = 0
    amount_paid: float = 0
    units: float = 0
    rate: float = 0
    due_date: str
    action: str = "import"   # import | skip
    create_tenant: bool = False


class ImportCommitIn(BaseModel):
    property_id: str
    rows: List[ImportRow]


@api_router.post("/bills/import/commit")
async def commit_bill_import(data: ImportCommitIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "reports", "Reports & exports")
    prop = await db.properties.find_one({"id": data.property_id, "user_id": user["id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(400, "Invalid property")

    created_bills = 0
    created_tenants = 0
    skipped = 0
    payments_recorded = 0
    tenant_cache: Dict[str, dict] = {}

    for r in data.rows:
        if r.action != "import":
            skipped += 1
            continue
        tenant = None
        if r.tenant_id:
            tenant = await db.tenants.find_one({"id": r.tenant_id, "user_id": user["id"], "property_id": data.property_id}, {"_id": 0})
        if not tenant and r.create_tenant:
            key = _norm_name(r.tenant_name) + "|" + _norm_name(r.apartment_number)
            if key in tenant_cache:
                tenant = tenant_cache[key]
            else:
                tdoc = {
                    "id": new_id(),
                    "user_id": user["id"],
                    "tenant_user_id": None,
                    "full_name": r.tenant_name or "Imported tenant",
                    "email": "",
                    "phone": "",
                    "whatsapp": "",
                    "property_id": data.property_id,
                    "unit_id": None,
                    "apartment_number": r.apartment_number or "N/A",
                    "rent_amount": 0.0,
                    "rent_frequency": "monthly",
                    "due_date": r.due_date,
                    "lease_start": None,
                    "lease_end": None,
                    "notes": "Created via AI Excel import",
                    "status": "active",
                    "invite_status": "not_sent",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
                await db.tenants.insert_one(tdoc)
                tenant = strip_private(tdoc)
                tenant_cache[key] = tenant
                created_tenants += 1
        if not tenant:
            skipped += 1
            continue

        bt = r.bill_type if r.bill_type in ("electricity_postpaid", "diesel_deposit", "service_charge", "other") else "other"
        units = max(0.0, r.units)
        amount_due = r.amount_due
        if bt == "electricity_postpaid" and amount_due <= 0 and units > 0 and r.rate > 0:
            amount_due = units * r.rate
        bill = {
            "id": new_id(),
            "owner_id": user["id"],
            "tenant_id": tenant["id"],
            "tenant_user_id": tenant.get("tenant_user_id"),
            "property_id": data.property_id,
            "unit_id": tenant.get("unit_id"),
            "apartment_number": tenant.get("apartment_number", r.apartment_number),
            "bill_type": bt,
            "title": r.title or bt.replace("_", " ").title(),
            "description": "Imported from Excel",
            "billing_period_start": None,
            "billing_period_end": None,
            "previous_reading": 0.0,
            "current_reading": units,
            "units_consumed": units,
            "rate": r.rate,
            "fixed_amount": amount_due,
            "amount_due": amount_due,
            "amount_paid": 0.0,
            "balance": amount_due,
            "status": compute_bill_status(r.due_date, amount_due, 0),
            "due_date": r.due_date,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.utility_bills.insert_one(bill)
        created_bills += 1

        paid = max(0.0, min(r.amount_paid, amount_due)) if amount_due > 0 else max(0.0, r.amount_paid)
        if paid > 0:
            await db.bill_payments.insert_one({
                "id": new_id(),
                "owner_id": user["id"],
                "bill_id": bill["id"],
                "tenant_id": tenant["id"],
                "amount": paid,
                "method": "imported",
                "reference": "Excel import",
                "payment_date": r.due_date,
                "notes": "Imported from Excel",
                "created_at": now_iso(),
            })
            new_balance = max(0.0, amount_due - paid)
            await db.utility_bills.update_one({"id": bill["id"]}, {"$set": {
                "amount_paid": paid,
                "balance": new_balance,
                "status": compute_bill_status(r.due_date, amount_due, paid),
                "updated_at": now_iso(),
            }})
            payments_recorded += 1

    return {
        "ok": True,
        "created_bills": created_bills,
        "created_tenants": created_tenants,
        "payments_recorded": payments_recorded,
        "skipped": skipped,
    }


@api_router.get("/bills/{bill_id}")
async def get_bill(bill_id: str, user=Depends(get_current_user)):
    b = await db.utility_bills.find_one({"id": bill_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Not found")
    if user["role"] == "owner" and b["owner_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] == "tenant" and b.get("tenant_user_id") != user["id"]:
        raise HTTPException(403, "Forbidden")
    if user["role"] not in ("owner", "tenant"):
        raise HTTPException(403, "Forbidden")
    b["payments"] = await db.bill_payments.find({"bill_id": bill_id}, {"_id": 0}).sort("payment_date", -1).to_list(5000000)
    return b


# ---------------- TENANT BILLS ----------------
@api_router.get("/tenant/bills")
async def tenant_bills(user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    items = await db.utility_bills.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("due_date", -1).to_list(5000000)
    return items


# ---------------- TENANT EVIDENCE: PRIVATE GRIDFS ATTACHMENTS ----------------
# Binary files stay in MongoDB and require a valid account for retrieval.
from bson import ObjectId

EVIDENCE_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf"}

async def _store_evidence(file: UploadFile, max_bytes: int = 25 * 1024 * 1024):
    mime = (file.content_type or "").lower()
    if mime not in EVIDENCE_TYPES:
        raise HTTPException(400, "Only JPG, PNG, WebP, MP4, WebM or PDF evidence is allowed")
    data = await file.read(max_bytes + 1)
    if not data or len(data) > max_bytes:
        raise HTTPException(400, "File must be between 1 byte and 25 MB")
    signatures = {
        "image/jpeg": data.startswith(bytes.fromhex("ffd8ff")),
        "image/png": data.startswith(bytes.fromhex("89504e470d0a1a0a")),
        "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        "video/mp4": len(data) > 12 and data[4:8] == b"ftyp",
        "video/webm": data.startswith(bytes.fromhex("1a45dfa3")),
        "application/pdf": data.startswith(b"%PDF-"),
    }
    if not signatures[mime]:
        raise HTTPException(400, "File content does not match the permitted type")
    oid = await media_bucket.upload_from_stream(
        file.filename or "evidence", data, metadata={"content_type": mime, "created_at": now_iso()}
    )
    return {"id": str(oid), "name": (file.filename or "evidence")[:150], "content_type": mime, "size": len(data)}

@api_router.get("/evidence/{file_id}")
async def read_evidence(file_id: str, user=Depends(get_current_user)):
    if not ObjectId.is_valid(file_id):
        raise HTTPException(404, "Not found")
    proof = {"attachments.id": file_id}
    complaint = await db.maintenance_complaints.find_one(proof)
    report = await db.payment_reports.find_one({"evidence.id": file_id})
    if not complaint and not report:
        raise HTTPException(404, "Not found")
    if user["role"] != "admin":
        allowed = complaint and (complaint.get("owner_id") == user["id"] or complaint.get("tenant_user_id") == user["id"] or complaint.get("assigned_to_user_id") == user["id"])
        allowed = allowed or (report and (report.get("owner_id") == user["id"] or report.get("tenant_user_id") == user["id"]))
        if not allowed:
            raise HTTPException(403, "Forbidden")
    try:
        stream = await media_bucket.open_download_stream(ObjectId(file_id))
        content = await stream.read()
    except Exception:
        raise HTTPException(404, "File missing")
    mime = ((stream.metadata or {}).get("content_type") or "application/octet-stream")
    return Response(content, media_type=mime, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})

@api_router.post("/tenant/complaints/{cid}/attachments")
async def upload_complaint_attachment(cid: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    tenant, owner = await _get_tenant_context(user)
    complaint = await db.maintenance_complaints.find_one({"id": cid, "tenant_id": tenant["id"]})
    if not complaint:
        raise HTTPException(404, "Complaint not found")
    if len(complaint.get("attachments") or []) >= 5:
        raise HTTPException(400, "Maximum 5 attachments per complaint")
    evidence = await _store_evidence(file)
    await db.maintenance_complaints.update_one({"id": cid}, {"$push": {"attachments": evidence}, "$set": {"updated_at": now_iso()}})
    return evidence

class ReportReviewIn(BaseModel):
    status: Literal["verified", "rejected"]
    note: str = ""

@api_router.post("/tenant/payments/report")
async def report_tenant_payment(kind: Literal["bill", "rent"] = Form(...), record_id: str = Form(...),
                                amount: float = Form(...), reference: str = Form(""), notes: str = Form(""),
                                file: UploadFile = File(...), user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    if amount <= 0:
        raise HTTPException(400, "Payment amount must be positive")
    collection = db.utility_bills if kind == "bill" else db.rent_records
    record = await collection.find_one({"id": record_id, "tenant_id": tenant["id"]})
    if not record:
        raise HTTPException(404, "Bill or rent record not found")
    evidence = await _store_evidence(file)
    report = {"id": new_id(), "kind": kind, "record_id": record_id, "tenant_id": tenant["id"],
              "tenant_user_id": user["id"], "owner_id": tenant["user_id"], "property_id": tenant["property_id"],
              "amount": amount, "reference": reference[:160], "notes": notes[:1000], "evidence": evidence,
              "status": "pending", "created_at": now_iso(), "updated_at": now_iso()}
    await db.payment_reports.insert_one(report)
    return strip_private(report)

@api_router.get("/tenant/payments/reports")
async def tenant_payment_reports(user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    return await db.payment_reports.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.get("/payments/reports")
async def owner_payment_reports(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    return await db.payment_reports.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.patch("/payments/reports/{rid}")
async def owner_review_payment_report(rid: str, data: ReportReviewIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    report = await db.payment_reports.find_one({"id": rid, "owner_id": user["id"]})
    if not report:
        raise HTTPException(404, "Payment notification not found")
    if report["status"] != "pending":
        raise HTTPException(409, "Already reviewed")
    await db.payment_reports.update_one({"id": rid, "status": "pending"}, {"$set": {
        "status": data.status, "review_note": data.note[:1000], "reviewed_by": user["id"], "updated_at": now_iso()
    }})
    # 'verified' means evidence reviewed, NOT ledger paid. Landlord must explicitly
    # record a payment through the existing payment route to avoid double credits.
    return {"ok": True, "status": data.status, "ledger_updated": False}

# ---------------- MAINTENANCE / COMPLAINTS ----------------
@api_router.post("/tenant/complaints")
async def tenant_create_complaint(data: ComplaintIn, user=Depends(get_current_user)):
    tenant, owner = await _get_tenant_context(user)
    await require_feature(owner, "maintenance", "Maintenance workflow")
    if not data.description.strip():
        raise HTTPException(400, "Description is required")
    doc = {
        "id": new_id(),
        "owner_id": tenant["user_id"],
        "tenant_id": tenant["id"],
        "tenant_user_id": user["id"],
        "property_id": tenant["property_id"],
        "unit_id": tenant.get("unit_id"),
        "apartment_number": tenant.get("apartment_number", ""),
        "title": data.title,
        "category": data.category,
        "description": data.description,
        "priority": data.priority,
        "status": "open",
        "assigned_to_facility_manager_id": None,
        "assigned_to_user_id": None,
        "tenant_can_see": True,
        "landlord_remark": "",
        "tenant_remark": "",
        "facility_manager_remark": "",
        "pending_reason": "",
        "completion_note": "",
        "attachments": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "assigned_at": None,
        "completed_at": None,
        "closed_at": None,
    }
    await db.maintenance_complaints.insert_one(doc)
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": doc["id"], "user_id": user["id"], "role": "tenant",
        "status_from": None, "status_to": "open",
        "message": f"Complaint lodged: {data.title}", "created_at": now_iso(),
    })
    return strip_private(doc)


@api_router.get("/tenant/complaints")
async def tenant_list_complaints(user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    items = await db.maintenance_complaints.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000000)
    return items


@api_router.get("/tenant/complaints/{cid}")
async def tenant_get_complaint(cid: str, user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    c = await db.maintenance_complaints.find_one({"id": cid, "tenant_id": tenant["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    c["updates"] = await db.maintenance_updates.find({"complaint_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(5000000)
    return c


@api_router.post("/tenant/complaints/{cid}/remarks")
async def tenant_add_remark(cid: str, data: ComplaintRemarkIn, user=Depends(get_current_user)):
    tenant, _ = await _get_tenant_context(user)
    c = await db.maintenance_complaints.find_one({"id": cid, "tenant_id": tenant["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "tenant",
        "status_from": c["status"], "status_to": c["status"], "message": data.message,
        "created_at": now_iso(),
    })
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": {"tenant_remark": data.message, "updated_at": now_iso()}})
    return {"ok": True}


@api_router.get("/maintenance/complaints")
async def owner_list_complaints(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "maintenance", "Maintenance workflow")
    items = await db.maintenance_complaints.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000000)
    prop_names: Dict[str, str] = {}
    for c in items:
        t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
        c["tenant_name"] = t.get("full_name", "-")
        pid = t.get("property_id") or c.get("property_id")
        if pid and pid not in prop_names:
            p = await db.properties.find_one({"id": pid}, {"_id": 0})
            prop_names[pid] = p.get("name", "-") if p else "-"
        c["property_id"] = pid
        c["property_name"] = prop_names.get(pid, "-")
        if c.get("assigned_to_facility_manager_id"):
            fm = await db.facility_managers.find_one({"id": c["assigned_to_facility_manager_id"]}, {"_id": 0}) or {}
            c["assigned_to_name"] = fm.get("full_name", "-")
    return items


@api_router.get("/maintenance/complaints/{cid}")
async def owner_get_complaint(cid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "maintenance", "Maintenance workflow")
    c = await db.maintenance_complaints.find_one({"id": cid, "owner_id": user["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    c["updates"] = await db.maintenance_updates.find({"complaint_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(5000000)
    t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
    c["tenant"] = t
    pid = t.get("property_id") or c.get("property_id")
    if pid:
        p = await db.properties.find_one({"id": pid}, {"_id": 0})
        c["property_id"] = pid
        c["property_name"] = p.get("name", "-") if p else "-"
    return c


@api_router.patch("/maintenance/complaints/{cid}")
async def owner_update_complaint(cid: str, data: ComplaintUpdateIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "maintenance", "Maintenance workflow")
    c = await db.maintenance_complaints.find_one({"id": cid, "owner_id": user["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    upd = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": upd})
    return {"ok": True}


@api_router.post("/maintenance/complaints/{cid}/assign")
async def owner_assign_complaint(cid: str, data: ComplaintAssignIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    c = await db.maintenance_complaints.find_one({"id": cid, "owner_id": user["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    fm = await db.facility_managers.find_one({"id": data.facility_manager_id, "owner_id": user["id"]})
    if not fm:
        raise HTTPException(400, "Facility manager not found or not yours")
    if fm.get("status") != "active":
        raise HTTPException(400, "Facility manager is not active")
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": {
        "assigned_to_facility_manager_id": fm["id"],
        "assigned_to_user_id": fm.get("user_id"),
        "status": "assigned",
        "assigned_at": now_iso(),
        "updated_at": now_iso(),
    }})
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "owner",
        "status_from": c["status"], "status_to": "assigned",
        "message": f"Assigned to {fm['full_name']}", "created_at": now_iso(),
    })
    await log_action(user, "complaint_assigned", "complaint", cid, after={"fm_id": fm["id"]})
    return {"ok": True}


@api_router.post("/maintenance/complaints/{cid}/remarks")
async def owner_complaint_remark(cid: str, data: ComplaintRemarkIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "maintenance", "Maintenance workflow")
    c = await db.maintenance_complaints.find_one({"id": cid, "owner_id": user["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "owner",
        "status_from": c["status"], "status_to": c["status"], "message": data.message,
        "created_at": now_iso(),
    })
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": {"landlord_remark": data.message, "updated_at": now_iso()}})
    return {"ok": True}


@api_router.post("/maintenance/complaints/{cid}/close")
async def owner_close_complaint(cid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    await require_feature(user, "maintenance", "Maintenance workflow")
    c = await db.maintenance_complaints.find_one({"id": cid, "owner_id": user["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": {
        "status": "closed", "closed_at": now_iso(), "updated_at": now_iso(),
    }})
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "owner",
        "status_from": c["status"], "status_to": "closed", "message": "Complaint closed",
        "created_at": now_iso(),
    })
    await log_action(user, "complaint_closed", "complaint", cid)
    return {"ok": True}


# ---------------- FACILITY MANAGER ----------------
async def _create_fm_invite(owner: dict, fm: dict) -> Optional[dict]:
    if not fm.get("email"):
        return None
    await db.facility_manager_invites.update_many(
        {"facility_manager_id": fm["id"], "status": "pending"},
        {"$set": {"status": "revoked"}},
    )
    raw = create_secure_token()
    invite = {
        "id": new_id(),
        "token_hash": sha256_token(raw),
        "email": fm["email"].lower(),
        "owner_id": owner["id"],
        "facility_manager_id": fm["id"],
        "role": "facility_manager",
        "status": "pending",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "accepted_at": None,
        "created_at": now_iso(),
    }
    await db.facility_manager_invites.insert_one(invite)
    link = f"{FRONTEND_URL}/fm-invite/{raw}"
    send_email_dev(
        to=fm["email"],
        subject="You have been invited as a Facility Manager on FixMyCribs",
        body=(
            f"Hello {fm['full_name']},\n\n{owner['full_name']} has invited you as a Facility Manager on FixMyCribs.\n\n"
            f"Use the secure link below to create your password and access your facility manager dashboard:\n\n{link}\n\n"
            f"This link expires in 7 days.\n\nFixMyCribs"
        ),
        link=link,
    )
    return {"invite_link": link if APP_ENV == "development" else None}


@api_router.get("/facility-managers")
async def list_fms(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    return await db.facility_managers.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000000)


@api_router.post("/facility-managers")
async def create_fm(data: FacilityManagerIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    count = await db.facility_managers.count_documents({"owner_id": user["id"], "status": {"$ne": "revoked"}})
    if not await check_plan_limit(user, "facility_managers", count):
        cfg = await get_effective_plan(user)
        raise HTTPException(403, f"Plan limit reached ({cfg['limits'].get('facility_managers', 0)} facility managers). Upgrade to add more.")
    doc = {
        "id": new_id(),
        "owner_id": user["id"],
        "user_id": None,
        "full_name": data.full_name,
        "email": data.email.lower(),
        "phone": data.phone or "",
        "status": "pending_invite",
        "permissions": {**DEFAULT_FM_PERMISSIONS, **(data.permissions or {})},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.facility_managers.insert_one(doc)
    inv = await _create_fm_invite(user, doc)
    doc = strip_private(doc)
    if inv and inv.get("invite_link"):
        doc["invite_link"] = inv["invite_link"]
    return doc


@api_router.patch("/facility-managers/{fid}")
async def update_fm(fid: str, data: FacilityManagerUpdateIn, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    upd = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    upd["updated_at"] = now_iso()
    r = await db.facility_managers.update_one({"id": fid, "owner_id": user["id"]}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api_router.delete("/facility-managers/{fid}")
async def revoke_fm(fid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    fm = await db.facility_managers.find_one({"id": fid, "owner_id": user["id"]})
    if not fm:
        raise HTTPException(404, "Not found")
    await db.facility_managers.update_one({"id": fid}, {"$set": {"status": "revoked", "updated_at": now_iso()}})
    await db.facility_manager_invites.update_many({"facility_manager_id": fid, "status": "pending"}, {"$set": {"status": "revoked"}})
    if fm.get("user_id"):
        await db.users.update_one({"id": fm["user_id"]}, {"$set": {"account_status": "revoked", "updated_at": now_iso()}})
    await log_action(user, "revoke_facility_manager", "facility_manager", fid)
    return {"ok": True}


@api_router.post("/facility-managers/{fid}/resend-invite")
async def resend_fm_invite(fid: str, user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    fm = await db.facility_managers.find_one({"id": fid, "owner_id": user["id"]}, {"_id": 0})
    if not fm:
        raise HTTPException(404, "Not found")
    if fm.get("user_id"):
        raise HTTPException(400, "Facility manager has already accepted invite")
    inv = await _create_fm_invite(user, fm)
    return {"ok": True, "invite_link": inv.get("invite_link") if inv else None}


@api_router.get("/fm-invites/{token}")
async def get_fm_invite(token: str):
    token_hash = sha256_token(token)
    invite = await db.facility_manager_invites.find_one({"token_hash": token_hash}, {"_id": 0})
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["status"] != "pending":
        raise HTTPException(400, f"This invite is {invite['status']}")
    try:
        exp = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.facility_manager_invites.update_one({"id": invite["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Invite has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    fm = await db.facility_managers.find_one({"id": invite["facility_manager_id"]}, {"_id": 0}) or {}
    landlord = await db.users.find_one({"id": invite["owner_id"]}, {"_id": 0}) or {}
    return {
        "email": invite["email"],
        "full_name": fm.get("full_name"),
        "landlord_name": landlord.get("full_name"),
        "expires_at": invite["expires_at"],
    }


@api_router.post("/fm-invites/{token}/accept")
async def accept_fm_invite(token: str, data: AcceptInviteIn):
    validate_password_strength(data.password)
    token_hash = sha256_token(token)
    invite = await db.facility_manager_invites.find_one({"token_hash": token_hash})
    if not invite or invite["status"] != "pending":
        raise HTTPException(400, "Invite not valid")
    try:
        exp = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.facility_manager_invites.update_one({"id": invite["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Invite has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    fm = await db.facility_managers.find_one({"id": invite["facility_manager_id"]})
    if not fm:
        raise HTTPException(400, "Facility manager record not found")
    existing_user = await db.users.find_one({"email": invite["email"]})
    if existing_user:
        raise HTTPException(400, "An account with this email already exists. Contact support.")
    user_id = new_id()
    await db.users.insert_one({
        "id": user_id,
        "full_name": data.full_name or fm.get("full_name") or invite["email"],
        "email": invite["email"],
        "phone": data.phone or fm.get("phone", ""),
        "password_hash": hash_password(data.password),
        "role": "facility_manager",
        "account_status": "active",
        "email_verified": True,
        "plan": "starter",
        "plan_status": "free",
        "owner_id": invite["owner_id"],
        "facility_manager_id": fm["id"],
        "must_change_password": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.facility_managers.update_one({"id": fm["id"]}, {"$set": {
        "user_id": user_id, "status": "active", "updated_at": now_iso(),
    }})
    await db.facility_manager_invites.update_one({"id": invite["id"]}, {"$set": {"status": "accepted", "accepted_at": now_iso()}})
    user = await db.users.find_one({"id": user_id})
    return {"token": create_token(user_id), "user": strip_private(user)}


# ----- Facility Manager endpoints -----
async def _get_fm_context(user: dict) -> tuple[dict, dict]:
    require_roles(user, ["facility_manager"])
    fm = await db.facility_managers.find_one({"id": user.get("facility_manager_id")}, {"_id": 0})
    if not fm or fm.get("status") != "active":
        raise HTTPException(403, "Your access is not active")
    owner = await db.users.find_one({"id": fm.get("owner_id")}, {"_id": 0}) or {}
    return fm, owner


@api_router.get("/facility-manager/me")
async def fm_me(user=Depends(get_current_user)):
    fm, owner = await _get_fm_context(user)
    return {"facility_manager": fm, "landlord_name": owner.get("full_name"), "landlord_email": owner.get("email")}


@api_router.get("/facility-manager/complaints")
async def fm_list_complaints(user=Depends(get_current_user)):
    fm, _ = await _get_fm_context(user)
    items = await db.maintenance_complaints.find(
        {"owner_id": fm["owner_id"], "assigned_to_facility_manager_id": fm["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(5000000)
    perms = fm.get("permissions", {})
    for c in items:
        t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
        c["tenant_name"] = t.get("full_name", "-")
        c["apartment_number"] = c.get("apartment_number") or t.get("apartment_number", "")
        if perms.get("view_tenant_contact"):
            c["tenant_phone"] = t.get("phone", "")
    return items


@api_router.get("/facility-manager/complaints/{cid}")
async def fm_get_complaint(cid: str, user=Depends(get_current_user)):
    fm, _ = await _get_fm_context(user)
    c = await db.maintenance_complaints.find_one({"id": cid, "assigned_to_facility_manager_id": fm["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    c["updates"] = await db.maintenance_updates.find({"complaint_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(5000000)
    t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
    if fm.get("permissions", {}).get("view_tenant_contact"):
        c["tenant_phone"] = t.get("phone", "")
    c["tenant_name"] = t.get("full_name", "-")
    return c


@api_router.patch("/facility-manager/complaints/{cid}/status")
async def fm_update_status(cid: str, data: ComplaintStatusIn, user=Depends(get_current_user)):
    fm, _ = await _get_fm_context(user)
    if not fm.get("permissions", {}).get("update_complaints", True):
        raise HTTPException(403, "You do not have permission to update complaints")
    c = await db.maintenance_complaints.find_one({"id": cid, "assigned_to_facility_manager_id": fm["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    valid = ["pending", "in_progress", "completed", "cannot_complete"]
    if data.status not in valid:
        raise HTTPException(400, f"Invalid status. Use one of: {valid}")
    if data.status == "pending" and not (data.pending_reason or "").strip():
        raise HTTPException(400, "pending_reason is required when marking as pending")
    if data.status == "completed" and not (data.completion_note or "").strip():
        raise HTTPException(400, "completion_note is required when marking as completed")
    upd = {"status": data.status, "updated_at": now_iso(), "facility_manager_remark": data.remark or c.get("facility_manager_remark", "")}
    if data.status == "pending":
        upd["pending_reason"] = data.pending_reason
    if data.status == "completed":
        upd["completion_note"] = data.completion_note
        upd["completed_at"] = now_iso()
    await db.maintenance_complaints.update_one({"id": cid}, {"$set": upd})
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "facility_manager",
        "status_from": c["status"], "status_to": data.status,
        "message": data.remark or data.completion_note or data.pending_reason or f"Status: {data.status}",
        "created_at": now_iso(),
    })
    return {"ok": True}


@api_router.post("/facility-manager/complaints/{cid}/remarks")
async def fm_add_remark(cid: str, data: ComplaintRemarkIn, user=Depends(get_current_user)):
    fm, _ = await _get_fm_context(user)
    c = await db.maintenance_complaints.find_one({"id": cid, "assigned_to_facility_manager_id": fm["id"]})
    if not c:
        raise HTTPException(404, "Not found")
    await db.maintenance_updates.insert_one({
        "id": new_id(), "complaint_id": cid, "user_id": user["id"], "role": "facility_manager",
        "status_from": c["status"], "status_to": c["status"], "message": data.message,
        "created_at": now_iso(),
    })
    return {"ok": True}


# ---------------- SUPPORT TICKETS ----------------
@api_router.post("/support-tickets")
async def create_ticket(data: SupportTicketIn, user=Depends(get_current_user)):
    if user["role"] not in ("owner", "tenant", "facility_manager"):
        raise HTTPException(403, "You cannot create support tickets from this account")
    doc = {
        "id": new_id(),
        "created_by_user_id": user["id"],
        "created_by_role": user["role"],
        "created_by_name": user.get("full_name"),
        "created_by_email": user.get("email"),
        "assigned_support_id": None,
        "subject": data.subject,
        "category": data.category,
        "status": "open",
        "priority": data.priority,
        "message": data.message,
        "attachments": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "resolved_at": None,
    }
    await db.support_tickets.insert_one(doc)
    await db.support_ticket_messages.insert_one({
        "id": new_id(),
        "ticket_id": doc["id"],
        "sender_user_id": user["id"],
        "sender_role": user["role"],
        "message": data.message,
        "internal": False,
        "created_at": now_iso(),
    })
    return strip_private(doc)


@api_router.get("/support-tickets/my")
async def my_tickets(user=Depends(get_current_user)):
    items = await db.support_tickets.find({"created_by_user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(5000000)
    return items


@api_router.get("/support-tickets/{tid}")
async def get_my_ticket(tid: str, user=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    if user["role"] not in ("support", "admin") and t["created_by_user_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    include_internal = user["role"] in ("support", "admin")
    q = {"ticket_id": tid}
    if not include_internal:
        q["internal"] = False
    t["messages"] = await db.support_ticket_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(5000000)
    return t


@api_router.post("/support-tickets/{tid}/messages")
async def add_ticket_message(tid: str, data: SupportTicketMessageIn, user=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    allowed = user["role"] in ("support", "admin") or t["created_by_user_id"] == user["id"]
    if not allowed:
        raise HTTPException(403, "Forbidden")
    if data.internal and user["role"] not in ("support", "admin"):
        raise HTTPException(403, "Only support/admin can post internal notes")
    if not data.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    msg = {
        "id": new_id(),
        "ticket_id": tid,
        "sender_user_id": user["id"],
        "sender_role": user["role"],
        "message": data.message.strip(),
        "internal": data.internal,
        "created_at": now_iso(),
    }
    await db.support_ticket_messages.insert_one(msg)
    upd = {"updated_at": now_iso()}
    if t["status"] == "resolved" and user["role"] not in ("support", "admin"):
        upd["status"] = "open"
    await db.support_tickets.update_one({"id": tid}, {"$set": upd})
    return strip_private(msg)


@api_router.get("/support/tickets")
async def support_list_tickets(status: Optional[str] = None, user=Depends(get_current_user)):
    require_roles(user, ["support", "admin"])
    q = {}
    if status:
        q["status"] = status
    items = await db.support_tickets.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000000)
    # Enrich with created_by + assigned_to display info
    user_ids = list({t.get("created_by_user_id") for t in items if t.get("created_by_user_id")}
                    | {t.get("assigned_support_id") for t in items if t.get("assigned_support_id")})
    if user_ids:
        u_map = {u["id"]: u async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0})}
        for t in items:
            cb = u_map.get(t.get("created_by_user_id"))
            if cb:
                t["created_by_name"] = cb.get("full_name")
                t["created_by_email"] = cb.get("email")
                t["created_by_role"] = cb.get("role")
            asg = u_map.get(t.get("assigned_support_id"))
            if asg:
                t["assigned_to_name"] = asg.get("full_name")
                t["assigned_to_email"] = asg.get("email")
    return items


@api_router.patch("/support/tickets/{tid}")
async def support_patch_ticket(tid: str, data: SupportTicketPatchIn, user=Depends(get_current_user)):
    require_roles(user, ["support", "admin"])
    upd = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not upd:
        return {"ok": True}
    if upd.get("status") == "resolved":
        upd["resolved_at"] = now_iso()
    upd["updated_at"] = now_iso()
    if "assigned_support_id" not in upd and user["role"] == "support":
        # Auto-assign to current support user if replying
        pass
    r = await db.support_tickets.update_one({"id": tid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------- ADMIN: CREATE SUPPORT USER ----------------
@api_router.post("/admin/support-users")
async def admin_create_support(data: AdminCreateUserIn, user=Depends(get_current_user)):
    require_roles(user, ["admin"])
    validate_password_strength(data.password)
    if data.role not in ("support", "admin"):
        raise HTTPException(400, "Role must be support or admin")
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(400, "Email already exists")
    user_id = new_id()
    await db.users.insert_one({
        "id": user_id,
        "full_name": data.full_name,
        "email": data.email.lower(),
        "phone": data.phone or "",
        "password_hash": hash_password(data.password),
        "role": data.role,
        "account_status": "active",
        "plan": "pro",
        "plan_status": "active",
        "created_by": user["id"],
        "must_change_password": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await log_action(user, "create_support_user", "user", user_id, after={"role": data.role, "email": data.email})
    return {"ok": True, "id": user_id}


# ---------------- OWNER MAINTENANCE-AWARE DASHBOARD ADDITIONS ----------------
@api_router.get("/dashboard/extras")
async def dashboard_extras(user=Depends(get_current_user)):
    require_roles(user, ["owner"])
    active_ids = await _active_tenant_ids(user["id"])
    bills = await db.utility_bills.find({"owner_id": user["id"], "tenant_id": {"$in": active_ids}}, {"_id": 0}).to_list(5000000)
    diesel_out = 0.0
    elec_out = 0.0
    all_out = 0.0
    for b in bills:
        bal = max(0.0, b["amount_due"] - b["amount_paid"])
        all_out += bal
        if b["bill_type"] == "diesel_deposit":
            diesel_out += bal
        elif b["bill_type"] == "electricity_postpaid":
            elec_out += bal
    open_complaints = await db.maintenance_complaints.count_documents({"owner_id": user["id"], "status": {"$in": ["open", "assigned", "in_progress", "pending"]}})
    return {
        "diesel_deposit_outstanding": diesel_out,
        "electricity_postpaid_outstanding": elec_out,
        "all_bills_outstanding": all_out,
        "open_complaints": open_complaints,
    }


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/auth/") or request.url.path.startswith("/api/admin/"):
        response.headers["Cache-Control"] = "no-store"
    if APP_ENV == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[v.strip() for v in os.environ.get('CORS_ORIGINS', FRONTEND_URL).split(',') if v.strip() and v.strip() != '*'],
    allow_methods=["*"],
    allow_headers=["*"],
)
