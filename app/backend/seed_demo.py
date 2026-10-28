"""Seed a large, realistic demo dataset for one PRO owner.

Idempotent: wipes any previously-seeded demo data (tagged demo_seed=True) for the
demo owner before re-inserting. Run:  python seed_demo.py
"""
import asyncio
import os
import random
import uuid
from datetime import datetime, timezone, date
from dateutil.relativedelta import relativedelta
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

random.seed(42)
NOW = datetime.now(timezone.utc)
TODAY = date.today()
YEAR = TODAY.year

DEMO_EMAIL = "demo@fixmycribs.com"
DEMO_PASSWORD = "Demo@12345!"


def nid():
    return str(uuid.uuid4())


def iso():
    return NOW.isoformat()


def hash_pw(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


FIRST = ["Chidi", "Ngozi", "Emeka", "Aisha", "Tunde", "Funke", "Ibrahim", "Amaka", "Segun", "Zainab",
         "Obinna", "Yetunde", "Musa", "Chioma", "Kunle", "Halima", "Uche", "Bisi", "Sadiq", "Ada",
         "Femi", "Nkechi", "Bello", "Temi", "Ikenna", "Fatima", "Wale", "Ifeoma", "Danjuma", "Kemi"]
LAST = ["Okafor", "Adeyemi", "Balogun", "Okonkwo", "Abubakar", "Eze", "Ogunleye", "Nwosu", "Bello",
        "Adewale", "Mohammed", "Chukwu", "Oladipo", "Ibrahim", "Onyeka", "Suleiman", "Afolabi", "Ojo",
        "Danladi", "Uche", "Sanusi", "Obi", "Lawal", "Amadi", "Yusuf"]
ESTATE_ADJ = ["Lekki", "Ikoyi", "Maitama", "Victoria", "Banana", "Gwarinpa", "Magodo", "Asokoro",
              "Wuse", "Yaba", "Surulere", "Ajah", "Ikeja", "Garki", "Jabi", "Oniru", "Chevron",
              "Osborne", "Parkview", "Ikate", "Ogudu", "Katampe", "Life Camp", "Utako", "Apo",
              "Sangotedo", "Ogba", "Egbeda", "Festac", "Gbagada"]
ESTATE_NOUN = ["Court", "Gardens", "Heights", "Residences", "Villas", "Terraces", "Towers",
               "Estate", "Homes", "Apartments", "Grove", "Enclave"]
CITIES = [("Lagos", "Lagos"), ("Abuja", "FCT"), ("Lagos", "Lagos"), ("Abuja", "FCT"), ("Port Harcourt", "Rivers")]
PROP_TYPES = ["apartment_block", "duplex", "block_of_flats", "estate", "mini_flat_block"]
CAP_TYPES = ["flats", "rooms", "units"]

EXPENSE_CATS = ["maintenance", "utilities", "security", "cleaning", "taxes", "insurance", "staff"]
EXPENSE_VENDORS = ["PowerFix Ltd", "AquaClean", "SecureGuard NG", "BrightWaste", "GreenScape",
                   "FixIt Services", "SafeHands Facility", "Prime Diesel", "CityWater Co"]
COMPLAINT_TITLES = [
    ("Leaking kitchen tap", "plumbing"), ("No power in living room", "electrical"),
    ("AC not cooling", "hvac"), ("Blocked drainage", "plumbing"), ("Broken door lock", "security"),
    ("Water heater faulty", "plumbing"), ("Cracked window pane", "structural"),
    ("Generator not starting", "electrical"), ("Pest infestation", "pest_control"),
    ("Ceiling leak after rain", "structural"), ("Faulty socket in bedroom", "electrical"),
    ("Gate motor not working", "security"), ("Low water pressure", "plumbing"),
    ("Elevator stuck", "structural"), ("Noisy plumbing at night", "plumbing"),
]
COMPLAINT_STATUSES = ["open", "assigned", "in_progress", "resolved", "closed"]
PRIORITIES = ["low", "normal", "high", "urgent"]


def months_ytd():
    """List of first-of-month dates from Jan of current year to current month."""
    return [date(YEAR, m, 1) for m in range(1, TODAY.month + 1)]


def bill_status(due_iso, amount_due, amount_paid):
    due = date.fromisoformat(due_iso)
    if amount_paid >= amount_due and amount_due > 0:
        return "paid"
    if amount_paid > 0 and amount_paid < amount_due:
        return "partially_paid" if TODAY <= due else "overdue"
    if TODAY > due:
        return "overdue"
    if TODAY == due:
        return "due_today"
    return "upcoming"


async def main():
    # 1) Ensure PRO demo owner
    owner = await db.users.find_one({"email": DEMO_EMAIL})
    if owner:
        owner_id = owner["id"]
        await db.users.update_one({"id": owner_id}, {"$set": {
            "password_hash": hash_pw(DEMO_PASSWORD), "role": "owner", "plan": "pro",
            "plan_status": "active", "account_status": "active", "email_verified": True,
            "full_name": "Demo Landlord", "updated_at": iso(),
        }})
    else:
        owner_id = nid()
        await db.users.insert_one({
            "id": owner_id, "full_name": "Demo Landlord", "email": DEMO_EMAIL, "phone": "+2348030000000",
            "password_hash": hash_pw(DEMO_PASSWORD), "role": "owner", "plan": "pro",
            "plan_status": "active", "account_status": "active", "email_verified": True,
            "must_change_password": False, "created_at": iso(), "updated_at": iso(),
        })

    # 2) Wipe prior demo data for this owner
    for coll in ("properties", "tenants", "rent_records", "payments", "utility_bills",
                 "bill_payments", "expenses", "facility_managers", "maintenance_complaints",
                 "maintenance_updates", "units"):
        await db[coll].delete_many({"$or": [{"user_id": owner_id}, {"owner_id": owner_id}]})

    props, tenants, rent_records, payments = [], [], [], []
    bills, expenses, fms, complaints, updates, bill_payments = [], [], [], [], [], []

    # distribute exactly 300 tenants across 30 properties (vary 8-12, sum forced to 300)
    per_prop = [random.randint(8, 12) for _ in range(30)]
    diff = 300 - sum(per_prop)
    idx = 0
    while diff != 0:
        step = 1 if diff > 0 else -1
        if 6 <= per_prop[idx % 30] + step <= 14:
            per_prop[idx % 30] += step
            diff -= step
        idx += 1

    # 3) Facility managers (5, active)
    for i in range(5):
        fn = f"{random.choice(FIRST)} {random.choice(LAST)}"
        fms.append({
            "id": nid(), "owner_id": owner_id, "user_id": None, "full_name": fn,
            "email": f"fm{i+1}.{fn.split()[0].lower()}@fixmycribs.ng", "phone": f"+23480{random.randint(10000000,99999999)}",
            "status": "active",
            "permissions": {"view_complaints": True, "update_complaints": True, "view_properties": True,
                            "view_tenants": True, "log_expenses": True},
            "created_at": iso(), "updated_at": iso(), "demo_seed": True,
        })
    fm_ids = [f["id"] for f in fms]

    # 4) Properties (30) + tenants (300 spread) + charges
    used_names = set()
    months = months_ytd()

    for i in range(30):
        while True:
            name = f"{random.choice(ESTATE_ADJ)} {random.choice(ESTATE_NOUN)}"
            if name not in used_names:
                used_names.add(name)
                break
        city, state = random.choice(CITIES)
        capacity = random.randint(15, 20)
        cap_type = random.choice(CAP_TYPES)
        pid = nid()
        props.append({
            "id": pid, "user_id": owner_id, "name": name, "type": random.choice(PROP_TYPES),
            "address": f"{random.randint(1,80)} {random.choice(ESTATE_ADJ)} Road", "city": city,
            "state": state, "country": "Nigeria", "status": "active",
            "notes": "", "capacity_type": cap_type, "capacity": capacity,
            "created_at": iso(), "demo_seed": True,
        })

        n_tenants = min(per_prop[i], capacity)
        # yearly rent band per property
        base_rent = random.choice([800000, 1000000, 1200000, 1500000, 1800000, 2200000, 2500000])
        sc_amount = random.choice([120000, 150000, 200000, 250000])

        for u in range(n_tenants):
            tid = nid()
            fn = f"{random.choice(FIRST)} {random.choice(LAST)}"
            apt = f"{cap_type[:-1].upper()[0]}{u+1}" if cap_type != "units" else f"Unit {u+1}"
            lease_start = date(YEAR - 1, random.randint(1, 12), random.randint(1, 28))
            # yearly rent due date -> anniversary this year
            rent_due = date(YEAR, random.randint(1, TODAY.month), random.randint(1, 28))
            rent_amount = float(base_rent + random.choice([-100000, 0, 100000, 200000]))
            tenants.append({
                "id": tid, "user_id": owner_id, "tenant_user_id": None, "full_name": fn,
                "email": f"{fn.split()[0].lower()}.{fn.split()[1].lower()}{random.randint(1,999)}@example.com",
                "phone": f"+23480{random.randint(10000000,99999999)}", "whatsapp": "",
                "property_id": pid, "unit_id": None, "apartment_number": apt,
                "rent_amount": rent_amount, "rent_frequency": "yearly", "due_date": rent_due.isoformat(),
                "lease_start": lease_start.isoformat(), "lease_end": (lease_start + relativedelta(years=1)).isoformat(),
                "notes": "", "status": "active", "invite_status": "not_sent",
                "created_at": iso(), "updated_at": iso(), "demo_seed": True,
            })

            # ---- yearly rent record ----
            paid_roll = random.random()
            if rent_due <= TODAY:
                if paid_roll < 0.72:
                    amt_paid = rent_amount
                elif paid_roll < 0.88:
                    amt_paid = round(rent_amount * random.choice([0.3, 0.5, 0.6]), 2)
                else:
                    amt_paid = 0.0
            else:
                amt_paid = rent_amount if paid_roll < 0.25 else 0.0
            st = bill_status(rent_due.isoformat(), rent_amount, amt_paid)
            rr_id = nid()
            rent_records.append({
                "id": rr_id, "user_id": owner_id, "tenant_id": tid, "property_id": pid, "unit_id": None,
                "amount_due": rent_amount, "amount_paid": amt_paid, "balance": round(rent_amount - amt_paid, 2),
                "due_date": rent_due.isoformat(), "paid_date": (rent_due.isoformat() if amt_paid >= rent_amount else None),
                "status": st, "rent_period_start": rent_due.isoformat(),
                "rent_period_end": (rent_due + relativedelta(years=1)).isoformat(),
                "frequency": "yearly", "created_at": iso(), "demo_seed": True,
            })
            if amt_paid > 0:
                payments.append({
                    "id": nid(), "user_id": owner_id, "tenant_id": tid, "rent_record_id": rr_id,
                    "property_id": pid, "unit_id": None,
                    "amount": amt_paid, "method": random.choice(["bank_transfer", "cash", "card", "pos"]),
                    "reference": f"RENT-{random.randint(100000,999999)}",
                    "receipt_number": f"RCP-{nid()[:8].upper()}",
                    "payment_date": rent_due.isoformat(), "notes": "", "created_at": iso(), "demo_seed": True,
                })

            # ---- yearly service charge (utility_bills) ----
            sc_due = date(YEAR, random.randint(1, TODAY.month), random.randint(1, 28))
            sc_paid = float(sc_amount) if random.random() < 0.7 and sc_due <= TODAY else 0.0
            bills.append(_bill(owner_id, tid, pid, apt, "service_charge", "Annual service charge",
                               float(sc_amount), sc_due, sc_paid, "yearly", bill_payments))

            # ---- monthly bills: electricity + water for each month YTD ----
            for m in months:
                mdue = date(m.year, m.month, random.choice([5, 10, 15]))
                # electricity
                e_amt = float(random.randint(8000, 45000))
                e_paid = e_amt if (mdue < TODAY and random.random() < 0.8) else (
                    round(e_amt * 0.5, 2) if random.random() < 0.15 else 0.0)
                bills.append(_bill(owner_id, tid, pid, apt, "electricity_prepaid",
                                   f"Electricity — {m.strftime('%b %Y')}", e_amt, mdue, e_paid, "monthly", bill_payments))
                # water
                w_amt = float(random.randint(3000, 12000))
                w_paid = w_amt if (mdue < TODAY and random.random() < 0.82) else 0.0
                bills.append(_bill(owner_id, tid, pid, apt, "water",
                                   f"Water — {m.strftime('%b %Y')}", w_amt, mdue, w_paid, "monthly", bill_payments))

        # ---- monthly expenses per property ----
        for m in months:
            for _ in range(random.randint(1, 3)):
                cat = random.choice(EXPENSE_CATS)
                exp_date = date(m.year, m.month, random.randint(2, 26))
                expenses.append({
                    "id": nid(), "user_id": owner_id, "property_id": pid, "category": cat,
                    "amount": float(random.choice([15000, 25000, 40000, 60000, 90000, 120000, 180000])),
                    "description": f"{cat.title()} — {m.strftime('%b %Y')}", "vendor": random.choice(EXPENSE_VENDORS),
                    "incurred_at": exp_date.isoformat(), "created_at": iso(), "updated_at": iso(),
                    "created_by_id": owner_id, "created_by_role": "owner", "created_by_name": "Demo Landlord",
                    "demo_seed": True,
                })

    # 5) 20 complaints across random tenants
    sample = random.sample(tenants, min(20, len(tenants)))
    for t in sample:
        title, cat = random.choice(COMPLAINT_TITLES)
        status = random.choice(COMPLAINT_STATUSES)
        assigned_fm = random.choice(fm_ids) if status in ("assigned", "in_progress", "resolved", "closed") else None
        created = NOW - relativedelta(days=random.randint(1, 120))
        cid = nid()
        complaints.append({
            "id": cid, "owner_id": owner_id, "tenant_id": t["id"], "tenant_user_id": None,
            "property_id": t["property_id"], "unit_id": None, "apartment_number": t["apartment_number"],
            "title": title, "category": cat, "description": f"{title}. Please attend to this as soon as possible.",
            "priority": random.choice(PRIORITIES), "status": status,
            "assigned_to_facility_manager_id": assigned_fm, "assigned_to_user_id": None,
            "tenant_can_see": True, "landlord_remark": "", "tenant_remark": "",
            "facility_manager_remark": ("On it — parts ordered." if assigned_fm else ""),
            "pending_reason": "", "completion_note": ("Fixed and verified." if status in ("resolved", "closed") else ""),
            "attachments": [], "created_at": created.isoformat(), "updated_at": iso(),
            "assigned_at": (created.isoformat() if assigned_fm else None),
            "completed_at": (iso() if status in ("resolved", "closed") else None),
            "closed_at": (iso() if status == "closed" else None), "demo_seed": True,
        })
        updates.append({
            "id": nid(), "complaint_id": cid, "user_id": t["id"], "role": "tenant",
            "status_from": None, "status_to": "open", "message": f"Complaint lodged: {title}",
            "created_at": created.isoformat(), "demo_seed": True,
        })

    # 6) Bulk insert
    async def bulk(coll, docs):
        if docs:
            for j in range(0, len(docs), 2000):
                await db[coll].insert_many(docs[j:j + 2000])

    await bulk("properties", props)
    await bulk("tenants", tenants)
    await bulk("rent_records", rent_records)
    await bulk("payments", payments)
    await bulk("utility_bills", bills)
    await bulk("bill_payments", bill_payments)
    await bulk("expenses", expenses)
    await bulk("facility_managers", fms)
    await bulk("maintenance_complaints", complaints)
    await bulk("maintenance_updates", updates)

    print(f"Seeded owner {DEMO_EMAIL} (PRO)")
    print(f"  properties={len(props)} tenants={len(tenants)} rent_records={len(rent_records)}")
    print(f"  payments={len(payments)} bills={len(bills)} expenses={len(expenses)}")
    print(f"  facility_managers={len(fms)} complaints={len(complaints)}")


def _bill(owner_id, tid, pid, apt, btype, title, amount, due, paid, freq, bill_payments):
    bid = nid()
    if paid > 0:
        bill_payments.append({
            "id": nid(), "owner_id": owner_id, "bill_id": bid, "tenant_id": tid,
            "amount": paid, "method": random.choice(["bank_transfer", "cash", "pos", "card"]),
            "reference": f"BILL-{random.randint(100000,999999)}", "payment_date": due.isoformat(),
            "notes": "", "created_at": iso(), "demo_seed": True,
        })
    return {
        "id": bid, "owner_id": owner_id, "tenant_id": tid, "tenant_user_id": None,
        "property_id": pid, "unit_id": None, "apartment_number": apt, "bill_type": btype,
        "title": title, "description": "", "billing_period_start": None, "billing_period_end": None,
        "previous_reading": 0.0, "current_reading": 0.0, "units_consumed": 0.0, "rate": 0,
        "fixed_amount": amount, "amount_due": amount, "amount_paid": paid,
        "balance": round(amount - paid, 2), "status": bill_status(due.isoformat(), amount, paid),
        "due_date": due.isoformat(), "frequency": freq, "auto_generated": False,
        "created_at": iso(), "updated_at": iso(), "demo_seed": True,
    }


if __name__ == "__main__":
    asyncio.run(main())
