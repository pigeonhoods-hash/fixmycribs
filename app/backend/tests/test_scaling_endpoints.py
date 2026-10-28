"""Tests for scaling endpoints: bills/property-summary, reports/summary, tenants pagination/search."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
DEMO_EMAIL = "demo@fixmycribs.com"
DEMO_PASSWORD = "Demo@12345!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


class TestBillsPropertySummary:
    def test_summary_current_month(self, session):
        r = session.get(f"{BASE_URL}/api/bills/property-summary")
        assert r.status_code == 200
        d = r.json()
        assert "properties" in d and "totals" in d and "months" in d
        assert len(d["properties"]) == 30
        # Ensure at least some non-zero data
        nonzero = [p for p in d["properties"] if (p.get("expected", 0) or p.get("collected", 0) or p.get("outstanding", 0))]
        assert len(nonzero) > 0

    def test_summary_all_time(self, session):
        r = session.get(f"{BASE_URL}/api/bills/property-summary?month=all")
        assert r.status_code == 200
        d = r.json()
        assert d["totals"]["expected"] > 0
        assert d["totals"]["collected"] > 0
        # All 30 properties should have bill counts
        with_bills = [p for p in d["properties"] if p.get("bill_count", 0) > 0]
        assert len(with_bills) == 30


class TestReportsSummary:
    def test_reports_summary(self, session):
        r = session.get(f"{BASE_URL}/api/reports/summary")
        assert r.status_code == 200
        d = r.json()
        # Handles either list or dict envelope
        props = d if isinstance(d, list) else d.get("properties") or d.get("items") or []
        assert len(props) == 30
        total_rent = sum(p.get("collected", 0) for p in props)
        total_bills = sum(p.get("bills_collected", 0) for p in props)
        total_exp = sum(p.get("expenses_total", 0) for p in props)
        # Realistic ranges
        assert total_rent > 300_000_000
        assert total_bills > 50_000_000
        assert total_exp > 20_000_000


class TestTenantsPagination:
    def test_legacy_array(self, session):
        r = session.get(f"{BASE_URL}/api/tenants")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert len(d) >= 100

    def test_paginated_envelope(self, session):
        r = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=25")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)
        for k in ["items", "total", "page", "page_size", "total_pages"]:
            assert k in d
        assert d["page"] == 1
        assert d["page_size"] == 25
        assert d["total"] == 300
        assert d["total_pages"] == 12
        assert len(d["items"]) == 25

    def test_page_2_different(self, session):
        r1 = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=25")
        r2 = session.get(f"{BASE_URL}/api/tenants?page=2&page_size=25")
        ids1 = {t["id"] for t in r1.json()["items"]}
        ids2 = {t["id"] for t in r2.json()["items"]}
        assert ids1.isdisjoint(ids2)

    def test_search(self, session):
        r = session.get(f"{BASE_URL}/api/tenants?page=1&page_size=25&q=chi")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0
        assert d["total"] < 100  # narrowed
