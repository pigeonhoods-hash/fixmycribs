"""Tests for round-3 scaling: /api/bills/property/{pid}/summary, paginated /api/bills,
tenant typeahead (server-side search)."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
DEMO_EMAIL = "demo@fixmycribs.com"
DEMO_PASSWORD = "Demo@12345!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def sample_property_id(session):
    r = session.get(f"{BASE_URL}/api/properties")
    assert r.status_code == 200
    props = r.json()
    assert isinstance(props, list) and len(props) > 0
    return props[0]["id"]


class TestPropertySummary:
    def test_summary_all(self, session, sample_property_id):
        r = session.get(f"{BASE_URL}/api/bills/property/{sample_property_id}/summary?month=all")
        assert r.status_code == 200
        d = r.json()
        for k in ["property", "months", "totals", "counts"]:
            assert k in d, f"missing {k}"
        assert d["property"]["id"] == sample_property_id
        assert isinstance(d["months"], list)
        for k in ["expected", "collected", "outstanding"]:
            assert k in d["totals"]
        for k in ["all", "diesel_deposit", "electricity_postpaid", "service_charge", "other"]:
            assert k in d["counts"]
        assert d["counts"]["all"] == (
            d["counts"]["diesel_deposit"] + d["counts"]["electricity_postpaid"]
            + d["counts"]["service_charge"] + d["counts"]["other"]
        )

    def test_summary_specific_month(self, session, sample_property_id):
        r_all = session.get(f"{BASE_URL}/api/bills/property/{sample_property_id}/summary?month=all")
        months = r_all.json().get("months") or []
        if not months:
            pytest.skip("No months for this property")
        m = months[0]
        r = session.get(f"{BASE_URL}/api/bills/property/{sample_property_id}/summary?month={m}")
        assert r.status_code == 200
        d = r.json()
        assert d["counts"]["all"] <= r_all.json()["counts"]["all"]


class TestBillsPagination:
    def test_paginated_envelope(self, session, sample_property_id):
        r = session.get(f"{BASE_URL}/api/bills?property_id={sample_property_id}&page=1&page_size=20")
        assert r.status_code == 200
        d = r.json()
        for k in ["items", "total", "page", "page_size", "total_pages"]:
            assert k in d
        assert d["page"] == 1 and d["page_size"] == 20
        if d["items"]:
            b = d["items"][0]
            assert "tenant_name" in b and "property_name" in b

    def test_no_duplicates_across_pages(self, session, sample_property_id):
        r1 = session.get(f"{BASE_URL}/api/bills?property_id={sample_property_id}&page=1&page_size=20").json()
        if r1["total_pages"] < 2:
            pytest.skip("Only one page")
        r2 = session.get(f"{BASE_URL}/api/bills?property_id={sample_property_id}&page=2&page_size=20").json()
        ids1 = {b["id"] for b in r1["items"]}
        ids2 = {b["id"] for b in r2["items"]}
        assert ids1.isdisjoint(ids2)


class TestTenantTypeahead:
    def test_property_scoped(self, session, sample_property_id):
        r = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=10&property_id={sample_property_id}")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        for t in d["items"]:
            assert t.get("property_id") == sample_property_id

    def test_search_filter(self, session, sample_property_id):
        r = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=25&property_id={sample_property_id}")
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no tenants")
        prefix = items[0]["full_name"].split()[0][:2].lower()
        r2 = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=25&property_id={sample_property_id}&q={prefix}")
        assert r2.status_code == 200
        for t in r2.json().get("items", []):
            assert prefix in t["full_name"].lower() or prefix in (t.get("email") or "").lower() or prefix in (t.get("phone") or "").lower()
