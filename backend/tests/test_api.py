import pytest
import time
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _auth_headers_for_user():
    email = f"profile-{int(time.time() * 1000)}@example.com"
    send_res = client.post("/auth/email/request-code", json={"email": email})
    assert send_res.status_code == 200
    code = send_res.json()["debug_code"]

    verify_res = client.post("/auth/email/verify-code", json={"email": email, "code": code})
    assert verify_res.status_code == 200
    verify_token = verify_res.json()["verify_token"]

    set_res = client.post(
        "/auth/password/set",
        json={"verify_token": verify_token, "password": "MyPass123"},
    )
    assert set_res.status_code == 200
    token = set_res.json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}

# ── Health ────────────────────────────────────────────────────────────────────

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "MyGardenOS API"

# ── Auth / Dev user ───────────────────────────────────────────────────────────

def test_dev_user():
    res = client.get("/auth/dev-user")
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "demo@example.com"
    assert "id" in data

# ── Profile ───────────────────────────────────────────────────────────────────

def test_get_profile():
    email, headers = _auth_headers_for_user()
    res = client.get("/profile", headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == email

def test_update_profile():
    _, headers = _auth_headers_for_user()
    res = client.patch("/profile", json={"username": "TestUser", "gender": "Female"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "TestUser"
    assert data["gender"] == "Female"

# ── Families ──────────────────────────────────────────────────────────────────

def test_list_families():
    res = client.get("/families")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_create_and_dissolve_family():
    res = client.post("/families", json={"name": "Test Family", "address": "123 Test St"})
    assert res.status_code == 200
    fam = res.json()
    assert fam["name"] == "Test Family"
    fam_id = fam["id"]

    # dissolve
    del_res = client.delete(f"/families/{fam_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "dissolved"

def test_update_family():
    res = client.post("/families", json={"name": "Edit Family"})
    assert res.status_code == 200
    fam_id = res.json()["id"]

    patch_res = client.patch(f"/families/{fam_id}", json={"address": "456 New Ave"})
    assert patch_res.status_code == 200
    assert patch_res.json()["address"] == "456 New Ave"

    client.delete(f"/families/{fam_id}")

def test_update_nonexistent_family():
    res = client.patch("/families/999999", json={"name": "Ghost"})
    assert res.status_code == 404

def test_dissolve_nonexistent_family():
    res = client.delete("/families/999999")
    assert res.status_code == 404

# ── Devices ───────────────────────────────────────────────────────────────────

def test_search_devices():
    res = client.get("/devices/search")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_list_devices():
    res = client.get("/devices")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_bind_device():
    available = client.get("/devices/search").json()
    assert len(available) > 0, "No unbound devices available for binding test"
    serial = available[0]["serial"]

    res = client.post("/devices/bind", json={"serial": serial})
    assert res.status_code == 200
    data = res.json()
    assert data["serial"] == serial
    assert data["status"] == "bound"

def test_bind_nonexistent_device():
    res = client.post("/devices/bind", json={"serial": "DOES-NOT-EXIST-0000"})
    assert res.status_code == 404

# ── Notifications ─────────────────────────────────────────────────────────────

def test_notifications_device():
    res = client.get("/notifications?kind=device")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_notifications_system():
    res = client.get("/notifications?kind=system")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_notifications_read_filter():
    res = client.get("/notifications?kind=device&read=false")
    assert res.status_code == 200

# ── Settings ──────────────────────────────────────────────────────────────────

def test_get_settings():
    res = client.get("/settings")
    assert res.status_code == 200
    data = res.json()
    assert "language" in data
    assert "device_notifications" in data

def test_update_settings():
    res = client.patch("/settings", json={"language": "Chinese", "device_notifications": False})
    assert res.status_code == 200
    data = res.json()
    assert data["language"] == "Chinese"
    assert data["device_notifications"] is False
    # restore
    client.patch("/settings", json={"language": "English", "device_notifications": True})

# ── Help articles ─────────────────────────────────────────────────────────────

def test_list_help_articles():
    res = client.get("/help/articles")
    assert res.status_code == 200
    articles = res.json()
    assert isinstance(articles, list)
    assert len(articles) > 0

def test_get_help_article_by_slug():
    articles = client.get("/help/articles").json()
    slug = articles[0]["slug"]

    res = client.get(f"/help/articles/{slug}")
    assert res.status_code == 200
    assert res.json()["slug"] == slug

def test_get_nonexistent_article():
    res = client.get("/help/articles/not-a-real-slug")
    assert res.status_code == 404

# ── About ─────────────────────────────────────────────────────────────────────

def test_about():
    res = client.get("/about")
    assert res.status_code == 200
    data = res.json()
    assert data["product"] == "MyGardenOS"
    assert "version" in data
    assert "privacy_policy" in data
    assert "user_agreement" in data


# ── Real auth flow ────────────────────────────────────────────────────────────

def test_email_code_password_auth_flow():
    email = f"authflow-{int(time.time() * 1000)}@example.com"

    # 1) Request code and verify email; first login requires setting password.
    send_res = client.post("/auth/email/request-code", json={"email": email})
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["status"] in {"sent", "debug_only"}
    assert send_data.get("debug_code")

    verify_res = client.post(
        "/auth/email/verify-code",
        json={"email": email, "code": send_data["debug_code"]},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["verified"] is True
    assert verify_data["next_step"] == "set_password"

    set_res = client.post(
        "/auth/password/set",
        json={"verify_token": verify_data["verify_token"], "password": "MyPass123"},
    )
    assert set_res.status_code == 200
    set_data = set_res.json()
    assert set_data["access_token"]
    assert set_data["user"]["email"] == email

    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {set_data['access_token']}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email

    # 2) Next login via email+code should require password verification.
    send2_res = client.post("/auth/email/request-code", json={"email": email})
    assert send2_res.status_code == 200
    code2 = send2_res.json()["debug_code"]

    verify2_res = client.post("/auth/email/verify-code", json={"email": email, "code": code2})
    assert verify2_res.status_code == 200
    verify2_data = verify2_res.json()
    assert verify2_data["next_step"] == "verify_password"

    wrong_pw = client.post(
        "/auth/password/verify",
        json={"verify_token": verify2_data["verify_token"], "password": "WrongPass"},
    )
    assert wrong_pw.status_code == 401

    verify_pw = client.post(
        "/auth/password/verify",
        json={"verify_token": verify2_data["verify_token"], "password": "MyPass123"},
    )
    assert verify_pw.status_code == 200
    assert verify_pw.json()["user"]["email"] == email

