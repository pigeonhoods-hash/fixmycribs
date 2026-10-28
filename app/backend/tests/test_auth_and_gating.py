"""
FixMyCribs — Auth (password policy, verification, brute-force, reset)
and Subscription Feature-Gating backend tests.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fixmycribs.com"
ADMIN_PASSWORD = "Admin@FixMyCribs2026"
STARTER_EMAIL = "owner1@test.com"
STARTER_PASSWORD = "Strong@123"
GROWTH_EMAIL = "growth@test.com"
GROWTH_PASSWORD = "Growth@123"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------- Password Policy -------
class TestPasswordPolicy:
    @pytest.mark.parametrize("pw", ["weakpass", "short", "alllowercase1", "ALLUPPER1!", "NoNumber!", "NoSpecial1"])
    def test_weak_passwords_rejected(self, s, pw):
        payload = {
            "full_name": "Weak Test",
            "email": f"weak_{uuid.uuid4().hex[:8]}@test.com",
            "phone": "",
            "password": pw,
        }
        r = s.post(f"{API}/auth/register", json=payload, timeout=20)
        # pydantic min_length=8 gives 422 for short (<8); custom validator gives 400
        assert r.status_code in (400, 422), f"pw={pw} -> {r.status_code} {r.text}"

    def test_strong_password_accepted(self, s):
        email = f"strong_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "full_name": "Strong Test", "email": email, "phone": "", "password": "Strong@123",
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("email_verification_required") is True
        assert "dev_verification_link" in data
        assert "token" in data


# ------- Registration + Email Verification -------
class TestEmailVerification:
    @pytest.fixture(scope="class")
    def registered(self, s):
        email = f"verify_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "full_name": "Verify Me", "email": email, "phone": "", "password": "Strong@123",
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        link = data["dev_verification_link"]
        token = link.rsplit("/", 1)[-1]
        return {"email": email, "jwt": data["token"], "verify_token": token}

    def test_owner_blocked_until_verified(self, s, registered):
        r = s.get(f"{API}/properties", headers=_auth(registered["jwt"]), timeout=20)
        assert r.status_code == 403, r.text
        assert "verify" in r.text.lower()

    def test_verify_email_success(self, s, registered):
        r = s.post(f"{API}/auth/verify-email", json={"token": registered["verify_token"]}, timeout=20)
        assert r.status_code == 200, r.text

    def test_owner_endpoints_accessible_after_verify(self, s, registered):
        r = s.get(f"{API}/properties", headers=_auth(registered["jwt"]), timeout=20)
        assert r.status_code == 200, r.text

    def test_resend_verification(self, s):
        email = f"resend_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "full_name": "Resend", "email": email, "phone": "", "password": "Strong@123",
        }, timeout=20)
        assert r.status_code == 200
        jwt_tok = r.json()["token"]
        r2 = s.post(f"{API}/auth/resend-verification", headers=_auth(jwt_tok), timeout=20)
        assert r2.status_code == 200, r2.text
        assert "dev_verification_link" in r2.json()


# ------- Password reset -------
class TestPasswordReset:
    def test_forgot_and_reset(self, s):
        email = f"reset_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "full_name": "Reset Me", "email": email, "phone": "", "password": "Strong@123",
        }, timeout=20)
        assert r.status_code == 200
        r = s.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "dev_link" in data, data
        token = data["dev_link"].rsplit("/", 1)[-1]

        # weak new password blocked
        r_bad = s.post(f"{API}/auth/reset-password", json={"token": token, "password": "weak"}, timeout=20)
        assert r_bad.status_code in (400, 422)

        # strong new password
        r_ok = s.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewStrong@456"}, timeout=20)
        assert r_ok.status_code == 200, r_ok.text

        # old password no longer works
        r_old = _login(s, email, "Strong@123")
        assert r_old.status_code == 401
        # new one works
        r_new = _login(s, email, "NewStrong@456")
        assert r_new.status_code == 200


# ------- Login / Admin -------
class TestLogin:
    def test_admin_login(self, s):
        r = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"

    def test_starter_owner_login(self, s):
        r = _login(s, STARTER_EMAIL, STARTER_PASSWORD)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["plan"] in ("starter", "free") or r.json()["user"]["role"] == "owner"

    def test_growth_owner_login(self, s):
        r = _login(s, GROWTH_EMAIL, GROWTH_PASSWORD)
        assert r.status_code == 200, r.text


# ------- Subscription Feature Gating -------
@pytest.fixture(scope="module")
def starter_token(s):
    r = _login(s, STARTER_EMAIL, STARTER_PASSWORD)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def growth_token(s):
    r = _login(s, GROWTH_EMAIL, GROWTH_PASSWORD)
    assert r.status_code == 200, r.text
    return r.json()["token"]


class TestStarterGating:
    def test_reports_blocked(self, s, starter_token):
        r = s.get(f"{API}/reports/summary", headers=_auth(starter_token), timeout=20)
        assert r.status_code == 403, r.text

    def test_maintenance_blocked(self, s, starter_token):
        r = s.get(f"{API}/maintenance/complaints", headers=_auth(starter_token), timeout=20)
        assert r.status_code == 403, r.text

    def test_facility_manager_create_blocked(self, s, starter_token):
        r = s.post(f"{API}/facility-managers", headers=_auth(starter_token),
                   json={"full_name": "X", "email": f"fm_{uuid.uuid4().hex[:6]}@test.com", "phone": ""}, timeout=20)
        assert r.status_code == 403, r.text

    def test_bills_create_blocked(self, s, starter_token):
        r = s.post(f"{API}/bills", headers=_auth(starter_token), json={
            "tenant_id": "nonexistent", "bill_type": "diesel_deposit", "title": "t",
            "due_date": "2026-12-31",
        }, timeout=20)
        # must be 403 (feature-gated) BEFORE tenant lookup
        assert r.status_code == 403, r.text


class TestGrowthUnlocked:
    def test_reports_ok(self, s, growth_token):
        r = s.get(f"{API}/reports/summary", headers=_auth(growth_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_maintenance_ok(self, s, growth_token):
        r = s.get(f"{API}/maintenance/complaints", headers=_auth(growth_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_bills_gate_passes(self, s, growth_token):
        # A create with bogus tenant should NOT return 403; may 400/404
        r = s.post(f"{API}/bills", headers=_auth(growth_token), json={
            "tenant_id": "nonexistent", "bill_type": "diesel_deposit", "title": "t",
            "due_date": "2026-12-31",
        }, timeout=20)
        assert r.status_code != 403, r.text


# ------- Core Regression -------
class TestCoreRegression:
    def test_growth_dashboard(self, s, growth_token):
        r = s.get(f"{API}/dashboard/summary", headers=_auth(growth_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_growth_properties(self, s, growth_token):
        r = s.get(f"{API}/properties", headers=_auth(growth_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_growth_tenants(self, s, growth_token):
        r = s.get(f"{API}/tenants", headers=_auth(growth_token), timeout=20)
        assert r.status_code == 200, r.text


# ------- Brute Force (LAST — uses throwaway email) -------
class TestBruteForceLast:
    def test_lockout_after_5_fails(self, s):
        email = f"brute_{uuid.uuid4().hex[:8]}@test.com"
        # register a fresh user (verified state doesn't matter for login path)
        r = s.post(f"{API}/auth/register", json={
            "full_name": "Brute", "email": email, "phone": "", "password": "Strong@123",
        }, timeout=20)
        assert r.status_code == 200
        # 5 bad attempts -> 401 each
        for i in range(5):
            rr = _login(s, email, "WrongPass@1")
            assert rr.status_code == 401, f"attempt {i}: {rr.status_code} {rr.text}"
        # 6th -> 429 lockout
        rr = _login(s, email, "WrongPass@1")
        assert rr.status_code == 429, f"expected 429, got {rr.status_code}: {rr.text}"
