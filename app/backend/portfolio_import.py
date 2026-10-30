"""Editable historical source records; never sends mail or generates charges."""
import hashlib
import json
import math
import uuid
from datetime import date

MONEY = ('rent_amount', 'service_charge', 'total_amount', 'amount_paid', 'balance')
TEXT = ('tenant_name', 'receipt_number', 'receipt_date_text', 'unit_number', 'payment_label', 'notes', 'source_sheet')


def stable_id(owner, key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps([owner, key])))


def check_money(value):
    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 1e12):
        raise ValueError('Invalid source amount')
    return value


def validate_record(row):
    allowed = set(MONEY + TEXT) | {'property_key', 'receipt_key', 'receipt_date', 'line_items', 'source_cells', 'occupancy_status'}
    if not isinstance(row, dict) or set(row) - allowed:
        raise ValueError('Unexpected receipt field')
    result = dict(row)
    for key in TEXT + ('property_key', 'receipt_key'):
        value = row.get(key, '')
        if not isinstance(value, str) or len(value) > (20000 if key == 'notes' else 500):
            raise ValueError('Invalid ' + key)
        result[key] = value.strip()
    if not result['receipt_key'] or not result['tenant_name']:
        raise ValueError('Receipt key and tenant name are required')
    for key in MONEY:
        result[key] = check_money(row.get(key))
    if row.get('receipt_date'):
        date.fromisoformat(row['receipt_date'])
    result['receipt_date'] = row.get('receipt_date') or None
    result['occupancy_status'] = row.get('occupancy_status', 'unconfirmed')
    if result['occupancy_status'] not in ('current', 'past', 'unconfirmed'):
        raise ValueError('Invalid occupancy status')
    for key in ('line_items', 'source_cells'):
        value = row.get(key, [] if key == 'line_items' else {})
        if len(json.dumps(value, allow_nan=False)) > 50000:
            raise ValueError('Source evidence is too large')
        result[key] = value
    return result


def validate_payload(data):
    if not isinstance(data, dict) or set(data) - {'source', 'properties', 'receipts', 'occupants'}:
        raise ValueError('Invalid import object')
    source = data.get('source')
    if not isinstance(source, str) or not source.strip() or len(source) > 500:
        raise ValueError('Source is required')
    props, receipts = data.get('properties'), data.get('receipts')
    if not isinstance(props, list) or len(props) > 100 or not isinstance(receipts, list) or not 1 <= len(receipts) <= 2000:
        raise ValueError('Invalid property or receipt count')
    clean_props, keys = [], set()
    for p in props:
        if not isinstance(p, dict) or set(p) - {'key', 'name', 'address', 'city', 'type'}:
            raise ValueError('Invalid property')
        if any(not isinstance(v, str) or len(v) > 1000 for v in p.values()):
            raise ValueError('Invalid property value')
        if not p.get('key') or not p.get('name') or p['key'] in keys:
            raise ValueError('Property keys and names are required and must be unique')
        keys.add(p['key'])
        clean_props.append(p)
    clean_receipts, seen = [], set()
    for r in receipts:
        row = validate_record(r)
        if row['property_key'] and row['property_key'] not in keys:
            raise ValueError('Unknown property reference')
        if row['receipt_key'] in seen:
            raise ValueError('Duplicate source key')
        seen.add(row['receipt_key'])
        clean_receipts.append(row)
    occupants = data.get('occupants', [])
    if not isinstance(occupants, list) or len(occupants) > 500:
        raise ValueError('Invalid occupant count')
    clean_occupants, occupant_keys = [], set()
    for person in occupants:
        allowed = {'property_key', 'full_name', 'unit_number', 'email', 'phone', 'source_row'}
        if not isinstance(person, dict) or set(person) - allowed or any(not isinstance(v, str) or len(v) > 500 for v in person.values()):
            raise ValueError('Invalid occupant')
        if person.get('property_key') not in keys or not person.get('full_name', '').strip():
            raise ValueError('Occupant property and name are required')
        key = (person['property_key'], person['full_name'].strip().casefold())
        if key in occupant_keys:
            raise ValueError('Duplicate occupant')
        occupant_keys.add(key)
        clean_occupants.append({k: person.get(k, '').strip() for k in allowed})
    return {'source': source.strip(), 'properties': clean_props, 'receipts': clean_receipts, 'occupants': clean_occupants}


def register_portfolio_import(router, db, current_user, require_roles, effective_plan, now_iso):
    from fastapi import Body, Depends, HTTPException

    @router.post('/portfolio-source-import')
    async def import_sources(data: dict = Body(...), dry_run: bool = True, user=Depends(current_user)):
        require_roles(user, ['owner'])
        try:
            payload = validate_payload(data)
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, str(exc))
        existing = await db.properties.find({'user_id': user['id']}, {'_id': 0}).to_list(10000)
        by_name = {p['name'].strip().casefold(): p for p in existing}
        prop_ids, new_props = {}, []
        for p in payload['properties']:
            old = by_name.get(p['name'].strip().casefold())
            pid = old['id'] if old else stable_id(user['id'], 'property:' + p['key'])
            prop_ids[p['key']] = pid
            if not old:
                new_props.append({'id': pid, 'user_id': user['id'], 'name': p['name'], 'address': p.get('address') or 'Street address not stated in supplied records', 'city': p.get('city', 'Lagos'), 'state': 'Lagos', 'country': 'Nigeria', 'type': p.get('type', 'Apartment'), 'status': 'active', 'notes': 'Imported from source receipts. Address and apartment inventory can be edited. Receipt client addresses are not automatically treated as property addresses.', 'capacity': 0, 'capacity_type': 'units', 'created_at': now_iso()})
        cfg = await effective_plan(user)
        limit = cfg.get('limits', {}).get('properties', 0)
        if limit >= 0 and len(existing) + len(new_props) > limit:
            raise HTTPException(403, 'Property allowance is insufficient')
        docs, skipped = [], 0
        for row in payload['receipts']:
            rid = stable_id(user['id'], payload['source'] + ':' + row['receipt_key'])
            if await db.imported_receipts.find_one({'_id': rid, 'owner_id': user['id']}):
                skipped += 1
                continue
            docs.append({'id': rid, 'owner_id': user['id'], 'property_id': prop_ids.get(row['property_key']), 'source': payload['source'], **row, 'source_original': row, 'review_status': 'imported', 'created_at': now_iso(), 'updated_at': now_iso()})
        new_people = []
        for person in payload['occupants']:
            pid = prop_ids[person['property_key']]
            tid = stable_id(user['id'], 'occupant:' + person['property_key'] + ':' + person['full_name'].casefold())
            old = await db.tenants.find_one({'user_id': user['id'], 'property_id': pid, 'full_name': person['full_name']})
            if not old:
                new_people.append({'id': tid, 'user_id': user['id'], 'property_id': pid, 'tenant_user_id': None, 'unit_id': None, 'full_name': person['full_name'], 'email': person['email'], 'phone': person['phone'], 'whatsapp': '', 'apartment_number': person['unit_number'] or 'Not stated in source', 'rent_amount': None, 'rent_frequency': None, 'due_date': None, 'lease_start': None, 'lease_end': None, 'status': 'active', 'invite_status': 'not_sent', 'financial_reconciliation': 'source_records', 'notes': 'Current occupancy from ' + person['source_row'] + '. Apartment number not invented. See Receipt and utility history for editable financial source records.', 'source_import': {'source': payload['source'], 'source_row': person['source_row']}, 'created_at': now_iso(), 'updated_at': now_iso()})
        tenant_count = await db.tenants.count_documents({'user_id': user['id'], 'status': {'$ne': 'archived'}})
        tenant_limit = cfg.get('limits', {}).get('tenants', 0)
        if tenant_limit >= 0 and tenant_count + len(new_people) > tenant_limit:
            raise HTTPException(403, 'Tenant allowance is insufficient')
        result = {'dry_run': dry_run, 'properties_to_add': len(new_props), 'occupants_to_add': len(new_people), 'receipts_to_add': len(docs), 'already_imported': skipped, 'properties': [p['name'] for p in new_props], 'notifications_sent': 0, 'new_charges_created': 0}
        if dry_run:
            return result
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        await db.portfolio_imports.update_one({'_id': stable_id(user['id'], digest)}, {'$setOnInsert': {'owner_id': user['id'], 'source': payload['source'], 'payload': payload, 'created_at': now_iso()}}, upsert=True)
        for doc in new_props:
            await db.properties.update_one({'_id': doc['id']}, {'$setOnInsert': doc}, upsert=True)
        for doc in docs:
            await db.imported_receipts.update_one({'_id': doc['id']}, {'$setOnInsert': doc}, upsert=True)
        for doc in new_people:
            await db.tenants.update_one({'_id': doc['id']}, {'$setOnInsert': doc}, upsert=True)
        return result

    @router.get('/imported-records')
    async def list_records(user=Depends(current_user)):
        require_roles(user, ['owner'])
        rows = await db.imported_receipts.find({'owner_id': user['id']}, {'_id': 0}).to_list(10000)
        props = await db.properties.find({'user_id': user['id']}, {'_id': 0}).to_list(10000)
        return {'records': rows, 'properties': [{'id': p['id'], 'name': p['name']} for p in props]}

    @router.patch('/imported-records/{rid}')
    async def edit_record(rid: str, data: dict = Body(...), user=Depends(current_user)):
        require_roles(user, ['owner'])
        allowed = set(MONEY) | {'tenant_name', 'unit_number', 'receipt_date', 'payment_label', 'notes', 'occupancy_status'}
        if not data or set(data) - allowed:
            raise HTTPException(400, 'Invalid editable fields')
        old = await db.imported_receipts.find_one({'id': rid, 'owner_id': user['id']}, {'_id': 0})
        if not old:
            raise HTTPException(404, 'Receipt not found')
        try:
            candidate = {k: old.get(k) for k in set(MONEY + TEXT) | {'property_key', 'receipt_key', 'receipt_date', 'line_items', 'source_cells', 'occupancy_status'}}
            candidate.update(data)
            valid = validate_record(candidate)
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, str(exc))
        await db.imported_receipts.update_one({'id': rid, 'owner_id': user['id']}, {'$set': {**{k: valid[k] for k in data}, 'review_status': 'edited', 'updated_at': now_iso()}})
        return {'ok': True}
