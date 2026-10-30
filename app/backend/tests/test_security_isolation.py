"""Isolated security regression tests. Runs only against disposable CI MongoDB."""
import os
import uuid
import pytest
from fastapi.testclient import TestClient

# CI must not point at production services, including accidentally injected secrets.
assert os.environ.get("DB_NAME") == "fixmycribs_security_ci"
assert os.environ.get("MONGO_URL") == "mongodb://127.0.0.1:27017"
assert os.environ.get("APP_ENV") == "production"

from server import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def unique_email():
    return f"security-{uuid.uuid4().hex}@example.invalid"


def register(client):
    email = unique_email()
    password = "Testing!123456"
    resp = client.post("/api/auth/register", json={
        "email": email, "password": password, "full_name": "Security Test"})
    assert resp.status_code == 200, resp.text
    return email, password, resp.json()["token"]


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
    assert client.get("/api/admin/email/test", headers=auth(token)).status_code == 403


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
    assert client.delete(f"/api/properties/{pid}", headers=auth(owner_b)).status_code in (403, 404)


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
