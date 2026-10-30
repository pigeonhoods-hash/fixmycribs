"""Owner-scoped migration of a roster without invitations or new invoices."""
import hashlib
import json
import re
import uuid
from datetime import date


def validate_roster(data):
    if not isinstance(data, dict) or set(data) - {"source", "as_of", "rows"}:
        raise ValueError("Expected source, as_of and rows")
    source = str(data.get("source", "")).strip()
    if not source or len(source) > 250:
        raise ValueError("A source name is required (maximum 250 characters)")
    date.fromisoformat(data.get("as_of", ""))
    rows = data.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 500:
        raise ValueError("Provide 1 to 500 units")
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict) or set(row) - {"unit_number", "occupant_name", "email", "phone", "source_row", "notes"}:
            raise ValueError("Unexpected roster field")
        out = {}
        for key, limit in (("unit_number", 100), ("occupant_name", 250), ("email", 250), ("phone", 100), ("source_row", 100), ("notes", 10000)):
            value = row.get(key, "")
            if not isinstance(value, str) or len(value) > limit:
                raise ValueError(f"Invalid {key}")
            out[key] = value.strip()
        key = out["unit_number"].casefold()
        if not key or key in seen:
            raise ValueError("Unit numbers must be present and unique")
        seen.add(key)
        if out["email"] and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", out["email"]):
            raise ValueError("Invalid email")
        if not out["occupant_name"] and (out["email"] or out["phone"]):
            raise ValueError("A vacant unit cannot have tenant contact details")
        result.append(out)
    return {"source": source, "as_of": data["as_of"], "rows": result}


def record_id(owner_id, property_id, unit_number, kind):
    key = json.dumps([owner_id, property_id, unit_number.casefold(), kind])
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def register_roster_import(router, db, current_user, require_roles, effective_plan, now_iso):
    from fastapi import Body, Depends, HTTPException

    @router.post("/properties/{pid}/roster-import")
    async def import_roster(pid: str, data: dict = Body(...), dry_run: bool = True, user=Depends(current_user)):
        require_roles(user, ["owner"])
        prop = await db.properties.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "Property not found")
        try:
            payload = validate_roster(data)
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, str(exc))
        existing_units = await db.units.find({"property_id": pid}, {"_id": 0}).to_list(10000)
        existing_tenants = await db.tenants.find({"user_id": user["id"], "property_id": pid}, {"_id": 0}).to_list(10000)
        units = {str(x.get("unit_number") or x.get("unit_name") or "").casefold(): x for x in existing_units}
        tenants = {str(x.get("apartment_number", "")).casefold(): x for x in existing_tenants if x.get("status") not in ("archived", "access_revoked")}
        new_units, new_tenants, skipped = [], [], 0
        for row in payload["rows"]:
            key = row["unit_number"].casefold()
            uid = record_id(user["id"], pid, key, "unit")
            tid = record_id(user["id"], pid, key, "tenant")
            old_unit, old_tenant = units.get(key), tenants.get(key)
            if old_unit or old_tenant:
                if (old_unit and old_unit.get("id") != uid) or (old_tenant and old_tenant.get("id") != tid):
                    raise HTTPException(409, f"Existing unit or tenant needs manual reconciliation: {row['unit_number']}")
                if old_tenant and old_tenant.get("full_name") != row["occupant_name"]:
                    raise HTTPException(409, "Occupant changed since import; existing records were not modified")
                if old_unit and old_unit.get("status") != ("occupied" if row["occupant_name"] else "vacant"):
                    raise HTTPException(409, "Occupancy changed since import; existing records were not modified")
            provenance = {"source": payload["source"], "as_of": payload["as_of"], "source_row": row["source_row"]}
            if not old_unit:
                new_units.append({"id": uid, "property_id": pid, "unit_name": row["unit_number"], "unit_number": row["unit_number"], "rent_amount": None, "rent_frequency": None, "status": "occupied" if row["occupant_name"] else "vacant", "source_import": provenance, "created_at": now_iso()})
            if row["occupant_name"] and not old_tenant:
                new_tenants.append({"id": tid, "user_id": user["id"], "tenant_user_id": None, "full_name": row["occupant_name"], "email": row["email"].lower(), "phone": row["phone"], "whatsapp": "", "property_id": pid, "unit_id": uid, "apartment_number": row["unit_number"], "rent_amount": None, "rent_frequency": None, "due_date": None, "lease_start": None, "lease_end": None, "notes": row["notes"], "status": "active", "invite_status": "not_sent", "financial_reconciliation": "pending", "source_import": provenance, "created_at": now_iso(), "updated_at": now_iso()})
            if old_unit and (old_tenant or not row["occupant_name"]):
                skipped += 1
        cfg = await effective_plan(user)
        count = await db.tenants.count_documents({"user_id": user["id"], "status": {"$ne": "archived"}})
        limit = cfg.get("limits", {}).get("tenants", 0)
        if limit >= 0 and count + len(new_tenants) > limit:
            raise HTTPException(403, "Tenant plan allowance is insufficient for this import")
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        result = {"dry_run": dry_run, "units_to_add": len(new_units), "tenants_to_add": len(new_tenants), "already_imported": skipped, "invitations_sent": 0, "financial_entries_created": 0, "digest": digest}
        if dry_run:
            return result
        # Insert-only deterministic IDs make retries safe, including partial failures.
        # No existing record is overwritten and the original source stays auditable.
        batch_id = record_id(user["id"], pid, digest, "batch")
        await db.roster_imports.update_one({"_id": batch_id}, {"$setOnInsert": {"owner_id": user["id"], "property_id": pid, "payload": payload, "created_at": now_iso()}}, upsert=True)
        for doc in new_units:
            await db.units.update_one({"_id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
        for doc in new_tenants:
            await db.tenants.update_one({"_id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
        return result
