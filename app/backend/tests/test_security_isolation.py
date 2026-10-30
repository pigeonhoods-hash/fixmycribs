"""Isolated security regression tests. Runs only against disposable CI MongoDB."""
import os
import uuid
import pytest
from fastapi.testclient import TestClient

# CI must not point at production services, including accidentally injected secrets.
assert os.environ.get("DB_NAME") == "fixmycribs_security_ci"
assert os.environ.get("MONGO_URL") == "mongodb://127.0.0.1:27017"
assert os.environ.get("APP_ENV") == "production"

import server
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from server import app


async def _isolated_mongo_lifespan_setup():
    # Motor binds its client to the first active event loop; TestClient starts
    # its own portal loop, so create our disposable client inside that loop.
    server.client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    server.db = server.client[os.environ['DB_NAME']]
    server.media_bucket = AsyncIOMotorGridFSBucket(server.db, bucket_name='tenant_evidence')


app.router.on_startup.insert(0, _isolated_mongo_lifespan_setup)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def unique_email():
    return f"security-{uuid.uuid4().hex}@example.com"


def register(client):
    email = unique_email()
    password = "Testing!123456"
    resp = client.post("/api/auth/register", json={
        "email": email, "password": password, "full_name": "Security Test"})
    assert resp.status_code == 200, resp.text
    client.portal.call(mark_test_email_verified, email)
    return email, password, resp.json()["token"]


async def mark_test_email_verified(email):
    await server.db.users.update_one({"email": email}, {"$set": {"email_verified": True}})


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_no_public_docs(client):
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404


def test_no_anonymous_billing_or_messages(client):
    for path in ["/api/bills/unknown", "/api/messages/conversations/unknown",
                 "/api/admin/users", "/api/evidence/000000000000000000000001"]:
        assert client.get(path).status_code in (401, 403)


def test_bearer_token_forgery_and_authorization(client):
    _, _, token = register(client)
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 200
    assert client.get("/api/auth/me", headers=auth("forged.invalid.token")).status_code == 401
    assert client.get("/api/admin/users", headers=auth(token)).status_code == 403
    assert client.post("/api/admin/email/test", headers=auth(token)).status_code == 403


def test_cross_owner_property_isolation(client):
    _, _, owner_a = register(client)
    _, _, owner_b = register(client)
    payload = {"name": "Isolated", "type": "apartment", "address": "Test address",
               "city": "Lagos", "state": "Lagos", "country": "Nigeria"}
    created = client.post("/api/properties", json=payload, headers=auth(owner_a))
    assert created.status_code == 200, created.text
    pid = created.json()["id"]
    assert client.get(f"/api/properties/{pid}", headers=auth(owner_a)).status_code == 200
    assert client.get(f"/api/properties/{pid}", headers=auth(owner_b)).status_code in (403, 404)
    unit = client.post(f"/api/properties/{pid}/units", headers=auth(owner_a), json={
        "unit_name": "Flat 1", "rent_amount": 1000, "rent_frequency": "monthly"})
    assert unit.status_code == 200, unit.text
    uid = unit.json()["id"]
    assert client.delete(f"/api/units/{uid}", headers=auth(owner_b)).status_code in (403, 404)
    assert client.delete(f"/api/properties/{pid}", headers=auth(owner_b)).status_code in (403, 404)
    assert client.get(f"/api/properties/{pid}", headers=auth(owner_a)).status_code == 200
    assert client.delete(f"/api/units/{uid}", headers=auth(owner_a)).status_code == 200


def test_change_password_revokes_previous_token(client):
    email, old, token = register(client)
    changed = client.post("/api/auth/change-password", headers=auth(token),
                          json={"current_password": old, "new_password": "NewSecure!234567"})
    assert changed.status_code == 200, changed.text
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 401
    signed_in = client.post("/api/auth/login", json={
        "email": email, "password": "NewSecure!234567"})
    assert signed_in.status_code == 200, signed_in.text
    assert client.get("/api/auth/me", headers=auth(signed_in.json()["token"])).status_code == 200


def test_reset_email_throttle(client):
    address = unique_email()
    data = {"email": address}
    one = client.post("/api/auth/forgot-password", json=data)
    two = client.post("/api/auth/forgot-password", json=data)
    assert one.status_code == 200, one.text
    assert two.status_code == 429, two.text


def test_cors_not_wildcard(client):
    response = client.options("/api/auth/login", headers={
        "Origin": "https://attacker.example.invalid",
        "Access-Control-Request-Method": "POST"})
    assert response.headers.get("access-control-allow-origin") != "*"


def test_upload_unauthenticated(client):
    response = client.post("/api/tenant/payments/report",
                           files={"file": ("invalid.pdf", b"%PDF-dummy", "application/pdf")})
    assert response.status_code in (401, 403, 422)


def test_prod_mock_payment_disabled(client):
    _, _, token = register(client)
    result = client.post("/api/subscriptions/mock-confirm", json={"reference": "mock_untrusted"},
                         headers=auth(token))
    assert result.status_code == 403


# Round 2: financial-integrity, tenant-boundary, and account-recovery testing.
def make_property(client, token, name="Building"):
    response = client.post("/api/properties", headers=auth(token), json={
        "name": name, "type": "apartment", "address": "Security test property",
        "city": "Lagos", "state": "Lagos"})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def make_tenant(client, token, property_id):
    response = client.post("/api/tenants", headers=auth(token), json={
        "full_name": "Synthetic Tenant", "email": "", "phone": "",
        "property_id": property_id, "apartment_number": "Security 1",
        "rent_amount": 1000, "rent_frequency": "monthly", "due_date": "2026-12-31"})
    assert response.status_code == 200, response.text
    tid = response.json()["id"]
    detail = client.get(f"/api/tenants/{tid}", headers=auth(token))
    assert detail.status_code == 200, detail.text
    return tid, detail.json()["rent_records"][0]["id"]


async def read_test_doc(collection, query):
    return await getattr(server.db, collection).find_one(query)


async def insert_test_doc(collection, doc):
    await getattr(server.db, collection).insert_one(doc)


async def seed_role(role, email):
    uid = server.new_id()
    await server.db.users.insert_one({
        "id": uid, "email": email, "role": role,
        "full_name": "Synthetic Privileged User",
        "password_hash": server.hash_password("Testing!123456"),
        "account_status": "active", "email_verified": True, "created_at": server.now_iso(),
        "plan": "starter", "plan_status": "free",
    })
    return uid


def test_financial_integrity_negative_rent_payment(client):
    _, _, owner = register(client)
    prop = make_property(client, owner)
    tid, rid = make_tenant(client, owner, prop)
    response = client.post("/api/payments", headers=auth(owner), json={
        "tenant_id": tid, "rent_record_id": rid, "amount": -500})
    assert response.status_code in (400, 422), response.text
    rec = client.get(f"/api/tenants/{tid}", headers=auth(owner)).json()["rent_records"][0]
    assert rec["amount_paid"] == 0


def test_financial_integrity_rent_record_tenant_mismatch(client):
    _, _, owner = register(client)
    prop = make_property(client, owner)
    tid, rid = make_tenant(client, owner, prop)
    other_tid, _ = make_tenant(client, owner, prop)
    response = client.post("/api/payments", headers=auth(owner), json={
        "tenant_id": other_tid, "rent_record_id": rid, "amount": 100})
    assert response.status_code in (400, 403, 404, 422), response.text
    rec = client.get(f"/api/tenants/{tid}", headers=auth(owner)).json()["rent_records"][0]
    assert rec["amount_paid"] == 0


def test_tenant_cannot_be_moved_to_foreign_landlord_property(client):
    _, _, owner_a = register(client)
    _, _, owner_b = register(client)
    own_property = make_property(client, owner_a)
    foreign_property = make_property(client, owner_b)
    tid, _ = make_tenant(client, owner_a, own_property)
    response = client.patch(f"/api/tenants/{tid}", headers=auth(owner_a),
                            json={"property_id": foreign_property})
    assert response.status_code in (400, 403, 404, 422), response.text
    updated = client.get(f"/api/tenants/{tid}", headers=auth(owner_a)).json()
    assert updated["property_id"] == own_property


def test_negative_bill_payment_cannot_increase_debt(client):
    _, _, owner = register(client)
    prop = make_property(client, owner)
    tid, _ = make_tenant(client, owner, prop)
    bill = "security_bill_" + uuid.uuid4().hex
    client.portal.call(insert_test_doc, "utility_bills", {
        "id": bill, "owner_id": client.portal.call(read_test_doc, "tenants", {"id": tid})["user_id"],
        "tenant_id": tid, "property_id": prop, "bill_type": "service_charge",
        "amount_due": 1000, "amount_paid": 0, "balance": 1000,
        "due_date": "2026-12-31", "status": "issued", "title": "Security fixture"})
    response = client.post(f"/api/bills/{bill}/payments", headers=auth(owner),
                           json={"amount": -100, "method": "cash"})
    assert response.status_code in (400, 422), response.text
    stored = client.portal.call(read_test_doc, "utility_bills", {"id": bill})
    assert stored["amount_paid"] == 0


def test_bill_amount_cannot_be_set_negative(client):
    _, _, owner = register(client)
    prop = make_property(client, owner)
    tid, _ = make_tenant(client, owner, prop)
    bill = "security_bill_" + uuid.uuid4().hex
    t = client.portal.call(read_test_doc, "tenants", {"id": tid})
    client.portal.call(insert_test_doc, "utility_bills", {
        "id": bill, "owner_id": t["user_id"], "tenant_id": tid, "property_id": prop,
        "bill_type": "service_charge", "amount_due": 1000, "amount_paid": 0,
        "balance": 1000, "status": "issued", "due_date": "2026-12-31", "title": "Fixture"})
    response = client.patch(f"/api/bills/{bill}", headers=auth(owner), json={"amount_due": -500})
    assert response.status_code in (400, 422), response.text
    stored = client.portal.call(read_test_doc, "utility_bills", {"id": bill})
    assert stored["amount_due"] == 1000


def test_admin_reset_revokes_existing_owner_sessions(client):
    email, _, token = register(client)
    target = client.portal.call(read_test_doc, "users", {"email": email})
    admin_uid = client.portal.call(seed_role, "admin", unique_email())
    admin_token = server.create_token(admin_uid)
    response = client.post(f"/api/admin/users/{target['id']}/reset-password",
                           headers=auth(admin_token), json={"new_password": "ResetSecurity!123"})
    assert response.status_code == 200, response.text
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 401


def test_cross_landlord_billing_and_tenant_listing(client):
    _, _, owner_a = register(client)
    _, _, owner_b = register(client)
    pid = make_property(client, owner_a)
    tid, rid = make_tenant(client, owner_a, pid)
    for method, path, data in [
        ("GET", f"/api/tenants/{tid}", None),
        ("POST", f"/api/rent-records/{rid}/mark-fully-paid", None),
        ("POST", f"/api/rent-records/{rid}/mark-unpaid", None),
        ("POST", "/api/payments", {"tenant_id": tid, "rent_record_id": rid, "amount": 100}),
    ]:
        res = client.request(method, path, headers=auth(owner_b), json=data)
        assert res.status_code in (400, 403, 404, 422), f"{method} {path}: {res.status_code} {res.text}"


def test_nonadmin_cannot_reset_other_users_password(client):
    _, _, owner = register(client)
    admin = client.portal.call(seed_role, "admin", unique_email())
    result = client.post(f"/api/admin/users/{admin}/reset-password",
                         headers=auth(owner), json={"new_password": "StrongReset!123"})
    assert result.status_code == 403, result.text


def test_security_headers_on_auth_response(client):
    response = client.post("/api/auth/login",
                           json={"email": unique_email(), "password": "Wrong!123456"})
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("cache-control") == "no-store"
    assert response.headers.get("x-frame-options") == "DENY"


def test_declared_oversized_json_rejected(client):
    response = client.post("/api/auth/login", headers={
        "Content-Length": str(3 * 1024 * 1024)
    }, json={"email": unique_email(), "password": "Wrong!123456"})
    assert response.status_code == 413, response.text


# Round 3: authentication, verification-link, provider, and invitation tests.
def test_registration_verification_and_single_use_link(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "send_email_dev", lambda **kw: sent.append(kw))
    email = unique_email()
    response = client.post("/api/auth/register", json={
        "full_name": "Registration Test", "email": email, "password": "Testing!123456"})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "owner"
    assert response.json()["user"]["email_verified"] is False
    assert "dev_verification_link" not in response.json()
    assert response.json()["email_delivery_failed"] is False
    assert len(sent) == 1 and sent[0]["to"] == email
    raw = sent[0]["link"].split("/verify-email/")[-1]
    stored = client.portal.call(read_test_doc, "email_verification_tokens", {
        "token_hash": server.sha256_token(raw)})
    assert stored["status"] == "pending"
    assert raw not in str(stored)
    token = response.json()["token"]
    denied = client.post("/api/properties", headers=auth(token), json={
        "name": "Verification required", "type": "apartment", "address": "Test"})
    assert denied.status_code == 403, denied.text
    verified = client.post("/api/auth/verify-email", json={"token": raw})
    assert verified.status_code == 200, verified.text
    assert len(sent) == 2  # verification email + welcome
    assert client.post("/api/auth/verify-email", json={"token": raw}).status_code == 400
    assert len(sent) == 2  # welcome email must be sent at most once
    assert client.get("/api/auth/me", headers=auth(token)).json()["email_verified"] is True


def test_resend_supersedes_previous_verification_link(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "send_email_dev", lambda **kw: sent.append(kw))
    response = client.post("/api/auth/register", json={
        "full_name": "Resend Test", "email": unique_email(), "password": "Testing!123456"})
    assert response.status_code == 200, response.text
    first = sent[-1]["link"].split("/verify-email/")[-1]
    token = response.json()["token"]
    resend = client.post("/api/auth/resend-verification", headers=auth(token))
    assert resend.status_code == 200, resend.text
    second = sent[-1]["link"].split("/verify-email/")[-1]
    assert first != second
    assert client.post("/api/auth/verify-email", json={"token": first}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"token": second}).status_code == 200
    assert client.post("/api/auth/resend-verification", headers=auth(token)).status_code == 429


def test_password_reset_email_token_expiration_reuse_and_old_session(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "send_email_dev", lambda **kw: sent.append(kw))
    email, old_password, old_token = register(client)
    request = client.post("/api/auth/forgot-password", json={"email": email})
    assert request.status_code == 200, request.text
    raw = sent[-1]["link"].split("/reset-password/")[-1]
    record = client.portal.call(read_test_doc, "password_reset_tokens",
                                {"token_hash": server.sha256_token(raw)})
    assert record["status"] == "pending"
    assert raw not in str(record)
    reset = client.post("/api/auth/reset-password", json={"token": raw, "password": "Changed!123456"})
    assert reset.status_code == 200, reset.text
    assert client.post("/api/auth/reset-password",
                       json={"token": raw, "password": "ChangedAgain!123"}).status_code == 400
    assert client.get("/api/auth/me", headers=auth(old_token)).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": email, "password": old_password}).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": email, "password": "Changed!123456"}).status_code == 200


def test_expired_password_reset_link_rejected(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "send_email_dev", lambda **kw: sent.append(kw))
    email, _, _ = register(client)
    request = client.post("/api/auth/forgot-password", json={"email": email})
    assert request.status_code == 200
    raw = sent[-1]["link"].split("/reset-password/")[-1]
    client.portal.call(expire_token, "password_reset_tokens", server.sha256_token(raw))
    result = client.post("/api/auth/reset-password", json={
        "token": raw, "password": "Changed!123456"})
    assert result.status_code == 400


async def expire_token(collection, token_hash):
    from datetime import datetime, timezone, timedelta
    await getattr(server.db, collection).update_one({"token_hash": token_hash},
        {"$set": {"expires_at": (datetime.now(timezone.utc)-timedelta(days=2)).isoformat()}})


def test_expired_verification_link_rejected(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "send_email_dev", lambda **kw: sent.append(kw))
    response = client.post("/api/auth/register", json={
        "full_name": "Expiry Test", "email": unique_email(), "password": "Testing!123456"})
    assert response.status_code == 200
    raw = sent[-1]["link"].split("/verify-email/")[-1]
    client.portal.call(expire_token, "email_verification_tokens", server.sha256_token(raw))
    result = client.post("/api/auth/verify-email", json={"token": raw})
    assert result.status_code == 400


def test_login_lockout_after_failed_attempts(client):
    email, password, _ = register(client)
    for attempt in range(server.MAX_LOGIN_ATTEMPTS):
        result = client.post("/api/auth/login", json={
            "email": email, "password": "incorrect!123"})
        assert result.status_code == 401, (attempt, result.text)
    correct = client.post("/api/auth/login", json={"email": email, "password": password})
    assert correct.status_code == 429, correct.text


def test_password_strength_and_public_role_escalation(client):
    weak = client.post("/api/auth/register", json={
        "full_name": "Weak", "email": unique_email(), "password": "password"})
    assert weak.status_code in (400, 422), weak.text
    response = client.post("/api/auth/register", json={
        "full_name": "Role Test", "email": unique_email(), "password": "Testing!123456",
        "role": "admin", "email_verified": True, "plan": "pro"})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "owner"
    assert response.json()["user"]["email_verified"] is False
    assert response.json()["user"]["plan"] == "starter"


def test_admin_email_endpoint_mocks_resend_acceptance_and_rejection(client, monkeypatch):
    admin_id = client.portal.call(seed_role, "admin", unique_email())
    admin_token = server.create_token(admin_id)
    monkeypatch.setenv("RESEND_API_KEY", "ci_fake_only_do_not_use")
    monkeypatch.setenv("EMAIL_FROM", "no-reply@example.com")
    monkeypatch.setattr(server, "_resend_send_sync", lambda *args: "ci-provider-id")
    accepted = client.post("/api/admin/email/test", headers=auth(admin_token))
    assert accepted.status_code == 200, accepted.text
    assert accepted.json().get("message_id") == "ci-provider-id"
    _, _, owner = register(client)
    assert client.post("/api/admin/email/test", headers=auth(owner)).status_code == 403
    def reject(*args):
        raise RuntimeError("Simulated provider rejection")
    monkeypatch.setattr(server, "_resend_send_sync", reject)
    rejected = client.post("/api/admin/email/test", headers=auth(admin_token))
    assert rejected.status_code == 502, rejected.text
    assert "Simulated" not in rejected.text  # no internal provider details


def test_unconfigured_email_transport_advertised_as_unavailable(client, monkeypatch):
    admin_id = client.portal.call(seed_role, "admin", unique_email())
    admin_token = server.create_token(admin_id)
    for name in ("RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST",
                 "SMTP_USERNAME", "SMTP_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    unavailable = client.post("/api/admin/email/test", headers=auth(admin_token))
    assert unavailable.status_code == 503, unavailable.text


def test_email_template_escapes_user_supplied_html():
    dangerous = '<img src=x onerror=alert(1)>'
    email = server._html_email("Verify account", "Hello " + dangerous, "https://example.com/verify")
    assert dangerous not in email
    assert "&lt;img" in email



def test_signup_email_provider_rejection_is_reported_without_losing_account(client, monkeypatch):
    email = unique_email()
    def reject(**kwargs):
        if kwargs.get("confirmed"):
            raise RuntimeError("Simulated Resend 403")
    monkeypatch.setattr(server, "send_email_dev", reject)
    response = client.post("/api/auth/register", json={
        "full_name": "Delivery Rejection", "email": email, "password": "Testing!123456"})
    assert response.status_code == 200, response.text
    assert response.json()["email_delivery_failed"] is True
    assert response.json()["email_verification_required"] is True
    stored = client.portal.call(read_test_doc, "users", {"email": email})
    assert stored is not None and stored["email_verified"] is False
    resend = client.post("/api/auth/resend-verification", headers=auth(response.json()["token"]))
    assert resend.status_code == 502, resend.text
    assert "Simulated" not in resend.text


def test_sync_provider_transport_reports_403_cleanly(monkeypatch):
    class FakeResponse:
        status_code = 403
        def json(self):
            return {"message": "You can only send testing emails to your own email address"}
        def raise_for_status(self):
            import requests
            raise requests.HTTPError("403", response=self)
    import requests
    monkeypatch.setenv("RESEND_API_KEY", "test-only")
    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResponse())
    with pytest.raises(requests.HTTPError):
        server._resend_send_sync("test@example.com", "Test", "plain", "<p>safe</p>",
                                 "noreply@example.com", "FixMyCribs")
