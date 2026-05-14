from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr

class UserOut(BaseModel):
    id: int
    email: EmailStr
    username: str
    gender: str
    address: str
    avatar_url: Optional[str] = None
    is_active: bool
    model_config = {"from_attributes": True}

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None

class FamilyMemberOut(BaseModel):
    id: int
    role: str
    user: UserOut
    model_config = {"from_attributes": True}

class FamilyOut(BaseModel):
    id: int
    code: str
    name: str
    address: str
    members: List[FamilyMemberOut] = []
    model_config = {"from_attributes": True}

class FamilyCreate(BaseModel):
    name: str = "happy family"
    address: str = ""

class FamilyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None

class DeviceOut(BaseModel):
    id: int
    serial: str
    name: str
    model: str
    status: str
    battery_percent: int
    owner_id: Optional[int] = None
    family_id: Optional[int] = None
    model_config = {"from_attributes": True}

class BindDeviceIn(BaseModel):
    serial: str
    family_id: Optional[int] = None

class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    is_read: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class SettingsOut(BaseModel):
    language: str
    region: str
    device_notifications: bool
    system_notifications: bool
    model_config = {"from_attributes": True}

class SettingsUpdate(BaseModel):
    language: Optional[str] = None
    region: Optional[str] = None
    device_notifications: Optional[bool] = None
    system_notifications: Optional[bool] = None

class HelpArticleOut(BaseModel):
    slug: str
    title: str
    category: str
    content: str
    model_config = {"from_attributes": True}

class AboutOut(BaseModel):
    product: str
    version: str
    update_status: str
    privacy_policy: str
    user_agreement: str


class RequestEmailCodeIn(BaseModel):
    email: EmailStr


class RequestEmailCodeOut(BaseModel):
    status: str
    expires_in_seconds: int
    delivered: bool = False
    debug_code: Optional[str] = None
    delivery_error: Optional[str] = None


class VerifyEmailCodeIn(BaseModel):
    email: EmailStr
    code: str


class VerifyEmailCodeOut(BaseModel):
    verified: bool
    next_step: str
    verify_token: str


class SetPasswordIn(BaseModel):
    verify_token: str
    password: str


class VerifyPasswordIn(BaseModel):
    verify_token: str
    password: str


class LoginWithPasswordIn(BaseModel):
    email: EmailStr
    password: str


class AuthSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AuthMeOut(BaseModel):
    user: UserOut
