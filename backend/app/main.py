import hmac
import os
import secrets
from datetime import datetime, timedelta
from hashlib import pbkdf2_hmac, sha256
from typing import Optional, Tuple

try:
    import resend as resend_sdk
except ImportError:
    resend_sdk = None
from random import randint
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload

from app.database import Base, SessionLocal, engine, get_db
from app.models.entities import (
    AuthSession,
    Device,
    EmailVerificationCode,
    Family,
    FamilyMember,
    HelpArticle,
    Notification,
    Setting,
    User,
)
from app.schemas.dto import (
    AboutOut,
    AuthMeOut,
    AuthSessionOut,
    BindDeviceIn,
    DeviceOut,
    FamilyCreate,
    FamilyOut,
    FamilyUpdate,
    FamilyJoin,
    HelpArticleOut,
    NotificationOut,
    ProfileUpdate,
    RequestEmailCodeIn,
    RequestEmailCodeOut,
    LoginWithPasswordIn,
    ResetPasswordIn,
    SetPasswordIn,
    SettingsOut,
    SettingsUpdate,
    UserOut,
    VerifyEmailCodeIn,
    VerifyEmailCodeOut,
    VerifyPasswordIn,
)

app = FastAPI(title="MyGardenOS API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HELP_TITLES = [
    "Operation instructions", "Installation instructions", "Mapping instructions",
    "Quick Start instructions", "Install blade disc", "Replace the battery",
    "Install the garage", "Clean the mower",
]

AUTH_SECRET = os.getenv("AUTH_SECRET", "dev-auth-secret-change-me")
AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "10"))
AUTH_VERIFY_TOKEN_TTL_MINUTES = int(os.getenv("AUTH_VERIFY_TOKEN_TTL_MINUTES", "15"))
AUTH_SESSION_TTL_DAYS = int(os.getenv("AUTH_SESSION_TTL_DAYS", "30"))
AUTH_DEBUG_CODES = os.getenv(
    "AUTH_DEBUG_CODES",
    "0" if os.getenv("APP_ENV") == "production" else "1",
) == "1"


def _now() -> datetime:
    return datetime.utcnow()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_email_code(email: str, code: str) -> str:
    raw = f"{email}:{code}:{AUTH_SECRET}"
    return sha256(raw.encode()).hexdigest()


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 200000
    digest = pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2${iterations}${salt}${digest}"


def _validate_password_rules(password: str) -> Optional[str]:
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if password.isdigit():
        return "Password cannot be only numbers"
    if not any(ch.isalpha() for ch in password):
        return "Password must include at least one letter"
    if not any(ch.isdigit() for ch in password):
        return "Password must include at least one number"
    return None


def _verify_password(password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    if password_hash.startswith("pbkdf2$"):
        _, iter_str, salt, digest = password_hash.split("$", 3)
        calc = pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iter_str)).hex()
        return hmac.compare_digest(calc, digest)
    # Backward-compatible fallback for legacy SHA-256 hashes.
    return hmac.compare_digest(sha256(password.encode()).hexdigest(), password_hash)


def _sign_payload(payload: str) -> str:
    return hmac.new(AUTH_SECRET.encode(), payload.encode(), "sha256").hexdigest()


def _make_signed_token(token_type: str, email: str, ttl_minutes: int) -> str:
    exp_ts = int((_now() + timedelta(minutes=ttl_minutes)).timestamp())
    nonce = secrets.token_urlsafe(8)
    payload = f"{token_type}|{email}|{exp_ts}|{nonce}"
    signature = _sign_payload(payload)
    return f"{payload}.{signature}"


def _verify_signed_token(token: str, expected_type: str) -> str:
    try:
        payload, signature = token.rsplit(".", 1)
        token_type, email, exp_ts, _nonce = payload.split("|", 3)
    except ValueError as exc:
        raise HTTPException(401, "Invalid token") from exc

    if not hmac.compare_digest(_sign_payload(payload), signature):
        raise HTTPException(401, "Invalid token signature")
    if token_type != expected_type:
        raise HTTPException(401, "Invalid token type")
    if int(exp_ts) < int(_now().timestamp()):
        raise HTTPException(401, "Token expired")
    return _normalize_email(email)


def _send_email_code(email: str, code: str) -> Tuple[bool, Optional[str]]:
    if not resend_sdk:
        return False, "resend_sdk_not_installed"
    
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False, "missing_resend_api_key"
    
    resend_sdk.api_key = api_key
    try:
        response = resend_sdk.Emails.send({
            "from": "MyGardenOS <info@mygardenos.com>",
            "to": email,
            "subject": "MyGardenOS verification code",
            "html": f"<p>Your MyGardenOS verification code is <strong>{code}</strong>.</p><p>It expires in {AUTH_CODE_TTL_MINUTES} minutes.</p>",
        })
        if isinstance(response, dict):
            message_id = response.get("id")
        else:
            message_id = getattr(response, "id", None)
        if not message_id:
            return False, "resend_missing_message_id"
        return True, None
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Resend email failed: %s", e)
        return False, str(e)


def _create_auth_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = sha256(token.encode()).hexdigest()
    session = AuthSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=_now() + timedelta(days=AUTH_SESSION_TTL_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def _auth_out(db: Session, user: User) -> AuthSessionOut:
    token = _create_auth_session(db, user)
    db.refresh(user)
    return AuthSessionOut(access_token=token, user=user)


def _get_user_from_bearer(authorization: Optional[str], db: Session) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    token_hash = sha256(token.encode()).hexdigest()
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token_hash == token_hash, AuthSession.expires_at > _now())
        .first()
    )
    if not session:
        raise HTTPException(401, "Invalid or expired session")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


def _get_or_create_user_by_email(email: str, db: Session) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    username = email.split("@", 1)[0][:120] or "user"
    user = User(email=email, username=username, gender="Unknown")
    db.add(user)
    db.flush()
    db.add(Setting(user_id=user.id))
    return user

def current_user(db: Session) -> User:
    user = db.query(User).filter(User.email == "demo@example.com").first()
    if not user:
        user = User(email="demo@example.com", username="Hector", gender="Male")
        db.add(user); db.flush()
        fam = Family(code="F612I5L1", name="happy family", creator_id=user.id)
        db.add(fam); db.flush()
        db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="Family Creator"))
        db.add(Setting(user_id=user.id))
    return user

def seed(db: Session):
    user = current_user(db)
    if db.query(Device).count() == 0:
        db.add_all([
            Device(serial="MOCK-AN1600-001", name="MyGardenOS Mower", model="AN-1600"),
            Device(serial="MOCK-AN1600-002", name="Garden Mower Demo", model="AN-1600"),
        ])
    if db.query(HelpArticle).count() == 0:
        for title in HELP_TITLES:
            slug = title.lower().replace(" ", "-")
            db.add(HelpArticle(slug=slug, title=title, content=f"# {title}\n\nMowers User Manual\n\nThis development-test document is a PDF-like placeholder for {title}.\n\n1. Safety alerts\n2. Specifications\n3. App operation\n4. Maintenance and storage"))
    db.commit()

@app.on_event("startup")
def startup():
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()
    except Exception as e:
        # Log but do not crash — /health should still respond even if DB is unreachable
        import logging
        logging.getLogger(__name__).error("Startup DB init failed: %s", e)

@app.get("/health")
def health():
    return {"status": "ok", "service": "MyGardenOS API"}


@app.post("/auth/email/request-code", response_model=RequestEmailCodeOut)
def request_email_code(payload: RequestEmailCodeIn, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = _now() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)
    code_record = EmailVerificationCode(
        email=email,
        code_hash=_hash_email_code(email, code),
        expires_at=expires_at,
    )
    db.add(code_record)
    db.commit()

    delivered, delivery_error = _send_email_code(email, code)
    if not delivered and not AUTH_DEBUG_CODES:
        raise HTTPException(500, f"Email delivery failed: {delivery_error or 'unknown'}")

    return RequestEmailCodeOut(
        status="sent" if delivered else "debug_only",
        expires_in_seconds=AUTH_CODE_TTL_MINUTES * 60,
        delivered=delivered,
        debug_code=code if AUTH_DEBUG_CODES else None,
        delivery_error=delivery_error if not delivered else None,
    )


@app.post("/auth/password/forgot/request-code", response_model=RequestEmailCodeOut)
@app.post("/auth/password/request-code", response_model=RequestEmailCodeOut)
def request_forgot_password_code(payload: RequestEmailCodeIn, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "User not found")

    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = _now() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)
    code_record = EmailVerificationCode(
        email=email,
        code_hash=_hash_email_code(email, code),
        expires_at=expires_at,
    )
    db.add(code_record)
    db.commit()

    delivered, delivery_error = _send_email_code(email, code)
    if not delivered and not AUTH_DEBUG_CODES:
        raise HTTPException(500, f"Email delivery failed: {delivery_error or 'unknown'}")

    return RequestEmailCodeOut(
        status="sent" if delivered else "debug_only",
        expires_in_seconds=AUTH_CODE_TTL_MINUTES * 60,
        delivered=delivered,
        debug_code=code if AUTH_DEBUG_CODES else None,
        delivery_error=delivery_error if not delivered else None,
    )


@app.post("/auth/email/verify-code", response_model=VerifyEmailCodeOut)
def verify_email_code(payload: VerifyEmailCodeIn, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    code_record = (
        db.query(EmailVerificationCode)
        .filter(
            EmailVerificationCode.email == email,
            EmailVerificationCode.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .first()
    )
    if not code_record:
        raise HTTPException(400, "Verification code not found")
    if code_record.expires_at < _now():
        raise HTTPException(400, "Verification code expired")
    if not hmac.compare_digest(code_record.code_hash, _hash_email_code(email, payload.code)):
        raise HTTPException(400, "Verification code is invalid")

    code_record.consumed_at = _now()
    user = _get_or_create_user_by_email(email, db)
    db.commit()
    db.refresh(user)

    next_step = "set_password" if not user.password_hash else "verify_password"
    verify_token = _make_signed_token("email_verified", email, AUTH_VERIFY_TOKEN_TTL_MINUTES)
    return VerifyEmailCodeOut(verified=True, next_step=next_step, verify_token=verify_token)


@app.post("/auth/password/forgot/verify-code", response_model=VerifyEmailCodeOut)
@app.post("/auth/password/verify-code", response_model=VerifyEmailCodeOut)
def verify_forgot_password_code(payload: VerifyEmailCodeIn, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "User not found")

    code_record = (
        db.query(EmailVerificationCode)
        .filter(
            EmailVerificationCode.email == email,
            EmailVerificationCode.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .first()
    )
    if not code_record:
        raise HTTPException(400, "Verification code not found")
    if code_record.expires_at < _now():
        raise HTTPException(400, "Verification code expired")
    if not hmac.compare_digest(code_record.code_hash, _hash_email_code(email, payload.code)):
        raise HTTPException(400, "Verification code is invalid")

    code_record.consumed_at = _now()
    db.commit()

    verify_token = _make_signed_token("email_verified", email, AUTH_VERIFY_TOKEN_TTL_MINUTES)
    return VerifyEmailCodeOut(verified=True, next_step="reset_password", verify_token=verify_token)


@app.post("/auth/password/set", response_model=AuthSessionOut)
def set_password(payload: SetPasswordIn, db: Session = Depends(get_db)):
    password_error = _validate_password_rules(payload.password)
    if password_error:
        raise HTTPException(400, password_error)
    email = _verify_signed_token(payload.verify_token, "email_verified")
    user = _get_or_create_user_by_email(email, db)
    if user.password_hash:
        raise HTTPException(409, "Password already set. Use /auth/password/verify")

    user.password_hash = _hash_password(payload.password)
    db.commit()
    return _auth_out(db, user)


@app.post("/auth/password/reset", response_model=AuthSessionOut)
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    password_error = _validate_password_rules(payload.password)
    if password_error:
        raise HTTPException(400, password_error)

    email = _verify_signed_token(payload.verify_token, "email_verified")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.password_hash = _hash_password(payload.password)
    db.commit()
    return _auth_out(db, user)


@app.post("/auth/password/verify", response_model=AuthSessionOut)
def verify_password(payload: VerifyPasswordIn, db: Session = Depends(get_db)):
    email = _verify_signed_token(payload.verify_token, "email_verified")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "User not found")
    if not user.password_hash:
        raise HTTPException(409, "Password not set. Use /auth/password/set")
    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect password")

    return _auth_out(db, user)


@app.post("/auth/login", response_model=AuthSessionOut)
def login_with_password(payload: LoginWithPasswordIn, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "User not found")
    if not user.password_hash:
        raise HTTPException(409, "Password not set. Please register first")
    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect password")

    return _auth_out(db, user)


@app.get("/auth/me", response_model=AuthMeOut)
def auth_me(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    return AuthMeOut(user=user)

@app.get("/auth/dev-user", response_model=UserOut)
def dev_user(db: Session = Depends(get_db)):
    return current_user(db)

@app.get("/profile", response_model=UserOut)
def get_profile(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    return user

@app.patch("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    for field in ["username", "gender", "address"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(user, field, value)
    if payload.password:
        password_error = _validate_password_rules(payload.password)
        if password_error:
            raise HTTPException(400, password_error)
        user.password_hash = _hash_password(payload.password)
    db.commit(); db.refresh(user)
    return user

@app.get("/families", response_model=list[FamilyOut])
def list_families(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    return (
        db.query(Family)
        .options(joinedload(Family.members).joinedload(FamilyMember.user))
        .join(FamilyMember)
        .filter(FamilyMember.user_id == user.id)
        .all()
    )

@app.post("/families", response_model=FamilyOut)
def create_family(
    payload: FamilyCreate,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    fam = Family(code=f"F{randint(1000000, 9999999)}", name=payload.name, address=payload.address, creator_id=user.id)
    db.add(fam); db.flush(); db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="Family Creator")); db.commit(); db.refresh(fam)
    return db.query(Family).options(joinedload(Family.members).joinedload(FamilyMember.user)).get(fam.id)

@app.post("/families/join", response_model=FamilyOut)
def join_family(
    payload: FamilyJoin,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(400, "Family code is required")
    fam = db.query(Family).filter(Family.code == code).first()
    if not fam:
        raise HTTPException(404, "Family not found for the given code")
    existing = db.query(FamilyMember).filter(
        FamilyMember.family_id == fam.id, FamilyMember.user_id == user.id
    ).first()
    if existing:
        raise HTTPException(409, "You are already a member of this family")
    db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="Family Member"))
    db.commit()
    return db.query(Family).options(joinedload(Family.members).joinedload(FamilyMember.user)).get(fam.id)

@app.post("/families/{family_id}/leave")
def leave_family(
    family_id: int,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_bearer(authorization, db)
    member = db.query(FamilyMember).filter(
        FamilyMember.family_id == family_id, FamilyMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(404, "You are not a member of this family")
    db.delete(member); db.commit()
    return {"status": "left"}

@app.patch("/families/{family_id}", response_model=FamilyOut)
def update_family(
    family_id: int,
    payload: FamilyUpdate,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    _get_user_from_bearer(authorization, db)
    fam = db.get(Family, family_id)
    if not fam: raise HTTPException(404, "Family not found")
    if payload.name is not None: fam.name = payload.name
    if payload.address is not None: fam.address = payload.address
    db.commit()
    return db.query(Family).options(joinedload(Family.members).joinedload(FamilyMember.user)).get(family_id)

@app.delete("/families/{family_id}")
def dissolve_family(
    family_id: int,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    _get_user_from_bearer(authorization, db)
    fam = db.get(Family, family_id)
    if not fam: raise HTTPException(404, "Family not found")
    db.delete(fam); db.commit()
    return {"status": "dissolved"}

@app.get("/devices", response_model=list[DeviceOut])
def devices(db: Session = Depends(get_db)):
    user = current_user(db)
    return db.query(Device).filter(Device.owner_id == user.id).all()

@app.get("/devices/search", response_model=list[DeviceOut])
def search_devices(db: Session = Depends(get_db)):
    return db.query(Device).filter(Device.owner_id.is_(None)).all()

@app.post("/devices/bind", response_model=DeviceOut)
def bind_device(payload: BindDeviceIn, db: Session = Depends(get_db)):
    user = current_user(db)
    device = db.query(Device).filter(Device.serial == payload.serial).first()
    if not device: raise HTTPException(404, "Device not found")
    device.owner_id = user.id; device.family_id = payload.family_id; device.status = "bound"
    db.commit(); db.refresh(device)
    return device

@app.get("/notifications", response_model=list[NotificationOut])
def notifications(kind: str = Query("device"), read: Optional[bool] = Query(None), db: Session = Depends(get_db)):
    user = current_user(db)
    q = db.query(Notification).filter(Notification.user_id == user.id, Notification.kind == kind)
    if read is not None: q = q.filter(Notification.is_read == read)
    return q.order_by(Notification.created_at.desc()).all()

@app.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    user = current_user(db)
    settings = db.query(Setting).filter(Setting.user_id == user.id).first() or Setting(user_id=user.id)
    db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.patch("/settings", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    user = current_user(db)
    settings = db.query(Setting).filter(Setting.user_id == user.id).first() or Setting(user_id=user.id)
    for field, value in payload.model_dump(exclude_unset=True).items(): setattr(settings, field, value)
    db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.get("/help/articles", response_model=list[HelpArticleOut])
def help_articles(db: Session = Depends(get_db)):
    return db.query(HelpArticle).order_by(HelpArticle.id).all()

@app.get("/help/articles/{slug}", response_model=HelpArticleOut)
def help_article(slug: str, db: Session = Depends(get_db)):
    article = db.query(HelpArticle).filter(HelpArticle.slug == slug).first()
    if not article: raise HTTPException(404, "Article not found")
    return article

@app.get("/about", response_model=AboutOut)
def about():
    return AboutOut(product="MyGardenOS", version="V0.1.0-dev", update_status="Development build is up to date", privacy_policy="Privacy Policy placeholder for MyGardenOS.", user_agreement="User Agreement placeholder for MyGardenOS.")
