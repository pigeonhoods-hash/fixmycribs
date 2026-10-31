"""Owner-scoped, retry-safe posting of reconciled source-backed finances."""
import hashlib
import json
import math
from datetime import date

from portfolio_import import stable_id


ENTRY_TEXT = ('key', 'property_name', 'tenant_name', 'target_name', 'target_unit',
              'email', 'phone', 'date', 'kind', 'title', 'notes')


def _money(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1e12:
        raise ValueError('Invalid ' + label)
    return value


def validate(data):
    allowed_top = {'source', 'version', 'replace_previous', 'entries', 'review_items', 'profiles'}
    if not isinstance(data, dict) or set(data) - allowed_top or not {'source', 'entries'} <= set(data):
        raise ValueError('Source and entries are required')
    if not isinstance(data['source'], str) or not data['source'].strip() or len(data['source']) > 1000:
        raise ValueError('Invalid source')
    if not isinstance(data.get('version', ''), str) or len(data.get('version', '')) > 200:
        raise ValueError('Invalid version')
    if not isinstance(data.get('replace_previous', False), bool):
        raise ValueError('Invalid replacement mode')
    if not isinstance(data['entries'], list) or not 1 <= len(data['entries']) <= 5000:
        raise ValueError('Invalid entry count')
    seen, payment_seen = set(), set()
    for entry in data['entries']:
        allowed = set(ENTRY_TEXT) | {'historical', 'source_keys', 'amount_due', 'amount_paid', 'rent_amount', 'payments'}
        if not isinstance(entry, dict) or set(entry) - allowed:
            raise ValueError('Invalid entry fields')
        for key in ENTRY_TEXT:
            if not isinstance(entry.get(key, ''), str) or len(entry.get(key, '')) > 12000:
                raise ValueError('Invalid ' + key)
        if not entry.get('key') or entry['key'] in seen or not entry.get('tenant_name') or not entry.get('property_name'):
            raise ValueError('Unique keys, property and tenant names required')
        seen.add(entry['key'])
        date.fromisoformat(entry['date'])
        if entry['kind'] not in ('rent', 'service_charge', 'other', 'electricity_postpaid', 'diesel_deposit'):
            raise ValueError('Invalid ledger kind')
        _money(entry.get('amount_due'), 'amount_due')
        _money(entry.get('amount_paid'), 'amount_paid')
        if entry.get('rent_amount') is not None:
            _money(entry['rent_amount'], 'profile rent')
        if not isinstance(entry.get('source_keys'), list) or not entry['source_keys'] or any(not isinstance(k, str) for k in entry['source_keys']):
            raise ValueError('Source references required')
        payments = entry.get('payments', [])
        if not isinstance(payments, list) or len(payments) > 500:
            raise ValueError('Invalid payment events')
        total = 0.0
        for payment in payments:
            if not isinstance(payment, dict) or set(payment) - {'key', 'date', 'amount', 'source_keys', 'notes'}:
                raise ValueError('Invalid payment fields')
            if not isinstance(payment.get('key'), str) or not payment['key'] or payment['key'] in payment_seen:
                raise ValueError('Unique payment keys required')
            payment_seen.add(payment['key'])
            date.fromisoformat(payment.get('date', ''))
            _money(payment.get('amount'), 'payment amount')
            if payment['amount'] <= 0:
                raise ValueError('Payment amount must be positive')
            if not isinstance(payment.get('source_keys'), list) or not payment['source_keys'] or any(not isinstance(k, str) for k in payment['source_keys']):
                raise ValueError('Payment source references required')
            if not isinstance(payment.get('notes', ''), str) or len(payment.get('notes', '')) > 12000:
                raise ValueError('Invalid payment notes')
            total += payment['amount']
        if payments and abs(total - entry['amount_paid']) > .05:
            raise ValueError('Payment events do not equal amount paid')
    if not isinstance(data.get('review_items', []), list) or len(json.dumps(data.get('review_items', []))) > 200000:
        raise ValueError('Invalid review items')
    if not isinstance(data.get('profiles', []), list) or len(data.get('profiles', [])) > 1000:
        raise ValueError('Invalid profile count')
    for profile in data.get('profiles', []):
        if not isinstance(profile, dict) or set(profile) - {'property_name', 'target_name', 'target_unit', 'rent_amount', 'email', 'phone', 'source_keys'}:
            raise ValueError('Invalid profile')
        for key in ('property_name', 'target_name', 'target_unit', 'email', 'phone'):
            if not isinstance(profile.get(key, ''), str) or len(profile.get(key, '')) > 500:
                raise ValueError('Invalid profile text')
        _money(profile.get('rent_amount'), 'profile rent')
        if not isinstance(profile.get('source_keys'), list) or not profile['source_keys']:
            raise ValueError('Profile source required')
    return data


def register_financial_import(router, db, current_user, require_roles, now_iso, status):
    from fastapi import Body, Depends, HTTPException

    @router.post('/financial-source-import')
    async def post_finances(data: dict = Body(...), dry_run: bool = True, user=Depends(current_user)):
        require_roles(user, ['owner'])
        try:
            payload = validate(data)
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc))
        owner = user['id']
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        version = payload.get('version') or ('legacy-' + digest[:16])
        props = await db.properties.find({'user_id': owner}, {'_id': 0}).to_list(10000)
        people = await db.tenants.find({'user_id': owner}, {'_id': 0}).to_list(10000)
        sources = await db.imported_receipts.find({'owner_id': owner}, {'_id': 0}).to_list(10000)
        by_prop = {p['name'].casefold(): p['id'] for p in props}
        by_source = {r['receipt_key']: r for r in sources}
        pending, new_people, updates, skipped = [], {}, {}, 0
        totals = {'rent_due': 0, 'rent_paid': 0, 'bills_due': 0, 'bills_paid': 0, 'credits': 0}

        def source_is_valid(source_key, property_id):
            source = by_source.get(source_key)
            return bool(source and source.get('property_id') in (None, property_id))

        def identity_name(value):
            # Treat harmless spreadsheet spacing differences as the same
            # identity while preserving the unit/property ambiguity checks.
            return ' '.join(str(value or '').split()).casefold()

        def active_matches(property_id, name, unit):
            return [t for t in people if t['property_id'] == property_id and t.get('status') != 'archived' and identity_name(t['full_name']) == identity_name(name) and (not unit or t.get('apartment_number') == unit)]

        def historical_matches(property_id, name, unit):
            return [t for t in people if t['property_id'] == property_id and t.get('status') == 'archived' and identity_name(t['full_name']) == identity_name(name) and (not unit or t.get('apartment_number') in (unit, 'Not stated in source', None, ''))]

        for entry in payload['entries']:
            property_id = by_prop.get(entry['property_name'].casefold())
            if not property_id:
                raise HTTPException(400, 'Unknown owned property: ' + entry['property_name'])
            invalid_source = next((key for key in entry['source_keys'] if not source_is_valid(key, property_id)), None)
            if invalid_source:
                # The caller is the owning landlord and needs the exact editable
                # source row to repair a legacy property assignment safely.
                raise HTTPException(400, 'Source is missing or linked to another property: ' + invalid_source)
            marker = stable_id(owner, f'financial-entry:{version}:{entry["key"]}')
            if await db.financial_import_entries.find_one({'_id': marker, 'owner_id': owner}):
                skipped += 1
                continue
            name = entry.get('target_name') or entry['tenant_name']
            unit = entry.get('target_unit', '')
            matches = active_matches(property_id, name, unit) if not entry.get('historical') else historical_matches(property_id, name, unit)
            if len(matches) > 1:
                raise HTTPException(400, 'Ambiguous tenant: specify apartment')
            if matches:
                tenant = matches[0]
            elif not entry.get('historical'):
                raise HTTPException(400, 'Current tenant not matched: ' + entry['tenant_name'])
            else:
                tid = stable_id(owner, 'historical-person:' + property_id + ':' + name.casefold() + ':' + unit.casefold())
                tenant = new_people.setdefault(tid, {
                    'id': tid, 'user_id': owner, 'property_id': property_id, 'full_name': name,
                    'status': 'archived', 'archived_at': now_iso(),
                    'archive_reason': 'Historical source profile; current occupancy not confirmed',
                    'source_import_history': True, 'retention_exempt': True, 'tenant_user_id': None,
                    'unit_id': None, 'apartment_number': unit or 'Not stated in source',
                    'rent_amount': None, 'rent_frequency': 'one_time', 'due_date': None,
                    'lease_start': None, 'lease_end': None, 'email': entry.get('email', ''),
                    'phone': entry.get('phone', ''), 'whatsapp': '', 'invite_status': 'not_sent',
                    'financial_reconciliation': 'source_posted', 'created_at': now_iso(),
                    'notes': 'Imported historical financial profile. No lease or move-out dates asserted.',
                })
            update = updates.setdefault(tenant['id'], {})
            for field in ('email', 'phone'):
                if not tenant.get(field) and entry.get(field):
                    update[field] = entry[field]
            if entry.get('rent_amount') is not None and (tenant.get('rent_amount') is None or tenant.get('financial_reconciliation') in ('source_posted', 'source_records')):
                update.update(rent_amount=entry['rent_amount'], rent_frequency='one_time', financial_reconciliation='source_posted')
            paid_dates = [p['date'] for p in entry.get('payments', [])]
            document = {
                'id': marker, 'user_id': owner, 'owner_id': owner, 'tenant_id': tenant['id'],
                'tenant_user_id': tenant.get('tenant_user_id'), 'property_id': property_id,
                'unit_id': tenant.get('unit_id'), 'apartment_number': tenant.get('apartment_number', ''),
                'amount_due': entry['amount_due'], 'amount_paid': entry['amount_paid'],
                'balance': round(max(0, entry['amount_due'] - entry['amount_paid']), 2),
                'credit_balance': round(max(0, entry['amount_paid'] - entry['amount_due']), 2),
                'due_date': entry['date'],
                'paid_date': max(paid_dates) if paid_dates and entry['amount_paid'] >= entry['amount_due'] else None,
                'status': status(entry['date'], entry['amount_due'], entry['amount_paid']),
                'frequency': 'one_time', 'title': entry['title'], 'description': entry['notes'],
                'notes': entry['notes'], 'source_keys': entry['source_keys'], 'source_import': True,
                'financial_import_version': version, 'source_reference_date': True,
                'created_at': now_iso(), 'updated_at': now_iso(),
            }
            if entry['kind'] == 'rent':
                document.update(rent_period_start=None, rent_period_end=None)
                collection, payment_collection, prefix = 'rent_records', 'payments', 'rent'
            else:
                document['bill_type'] = entry['kind']
                collection, payment_collection, prefix = 'utility_bills', 'bill_payments', 'bills'
            totals[prefix + '_due'] += document['amount_due']
            totals[prefix + '_paid'] += document['amount_paid']
            totals['credits'] += document['credit_balance']
            pending.append((entry, document, collection, payment_collection))

        for profile in payload.get('profiles', []):
            property_id = by_prop.get(profile['property_name'].casefold())
            matches = active_matches(property_id, profile['target_name'], profile.get('target_unit', '')) if property_id else []
            if len(matches) != 1 or any(not source_is_valid(key, property_id) for key in profile['source_keys']):
                raise HTTPException(400, 'Profile or source not uniquely matched')
            tenant = matches[0]
            fields = updates.setdefault(tenant['id'], {})
            if tenant.get('rent_amount') is None or tenant.get('financial_reconciliation') in ('source_posted', 'source_records'):
                fields.update(rent_amount=profile['rent_amount'], rent_frequency='one_time', financial_reconciliation='source_posted')
            for field in ('email', 'phone'):
                if not tenant.get(field) and profile.get(field):
                    fields[field] = profile[field]

        replace = bool(payload.get('replace_previous'))
        old_filter = {'owner_id': owner, 'source_import': True, 'financial_import_version': {'$ne': version}}
        old_rent = await db.rent_records.find(old_filter, {'_id': 0}).to_list(10000) if replace else []
        old_payments = await db.payments.find(old_filter, {'_id': 0}).to_list(10000) if replace else []
        old_bills = await db.utility_bills.find(old_filter, {'_id': 0}).to_list(10000) if replace else []
        old_bill_payments = await db.bill_payments.find(old_filter, {'_id': 0}).to_list(10000) if replace else []
        old_markers = await db.financial_import_entries.find({'owner_id': owner, 'version': {'$ne': version}}, {'_id': 0}).to_list(10000) if replace else []
        result = {
            'dry_run': dry_run, 'version': version, 'entries_to_add': len(pending),
            'historical_profiles_to_add': len(new_people), 'profiles_to_update': len(updates),
            'already_posted': skipped, 'previous_entries_to_replace': len(old_rent) + len(old_bills),
            'previous_payments_to_replace': len(old_payments) + len(old_bill_payments),
            'totals': {key: round(value, 2) for key, value in totals.items()},
            'notifications_sent': 0,
        }
        if dry_run:
            return result

        await db.financial_imports.update_one(
            {'_id': stable_id(owner, digest)},
            {'$setOnInsert': {'owner_id': owner, 'version': version, 'payload': payload, 'created_at': now_iso()}},
            upsert=True,
        )
        for tenant in new_people.values():
            await db.tenants.update_one({'_id': tenant['id']}, {'$setOnInsert': tenant}, upsert=True)
        for tenant_id, fields in updates.items():
            if fields:
                await db.tenants.update_one({'id': tenant_id, 'user_id': owner}, {'$set': fields})
        for entry, document, collection, payment_collection in pending:
            await getattr(db, collection).update_one({'_id': document['id']}, {'$setOnInsert': document}, upsert=True)
            payment_events = entry.get('payments') or ([{
                'key': 'implicit:' + entry['key'], 'date': entry['date'], 'amount': entry['amount_paid'],
                'source_keys': entry['source_keys'], 'notes': entry['notes'],
            }] if entry['amount_paid'] > 0 else [])
            for event in payment_events:
                payment = {
                    'id': stable_id(owner, f'financial-payment:{version}:{event["key"]}'),
                    'user_id': owner, 'owner_id': owner, 'tenant_id': document['tenant_id'],
                    'property_id': document['property_id'], 'amount': event['amount'],
                    'payment_date': event['date'], 'method': 'historical_source',
                    'reference': event['key'], 'receipt_number': event['key'], 'notes': event.get('notes', ''),
                    'source_keys': event['source_keys'], 'source_import': True,
                    'financial_import_version': version, 'created_at': now_iso(),
                    ('rent_record_id' if collection == 'rent_records' else 'bill_id'): document['id'],
                }
                await getattr(db, payment_collection).update_one({'_id': payment['id']}, {'$setOnInsert': payment}, upsert=True)
            await db.financial_import_entries.update_one(
                {'_id': document['id']},
                {'$setOnInsert': {'owner_id': owner, 'key': entry['key'], 'version': version, 'created_at': now_iso()}},
                upsert=True,
            )

        # Replacement is recoverable: snapshot the exact prior source-import
        # documents before removing them from the live ledgers. Manual/native
        # financial records are never selected by this filter.
        if replace and (old_rent or old_payments or old_bills or old_bill_payments or old_markers):
            backup_id = stable_id(owner, 'financial-backup:' + version)
            await db.financial_import_backups.update_one(
                {'_id': backup_id},
                {'$setOnInsert': {
                    'owner_id': owner, 'replacement_version': version, 'created_at': now_iso(),
                    'rent_records': old_rent, 'payments': old_payments,
                    'utility_bills': old_bills, 'bill_payments': old_bill_payments,
                    'markers': old_markers,
                }},
                upsert=True,
            )
            await db.rent_records.delete_many(old_filter)
            await db.payments.delete_many(old_filter)
            await db.utility_bills.delete_many(old_filter)
            await db.bill_payments.delete_many(old_filter)
            await db.financial_import_entries.delete_many({'owner_id': owner, 'version': {'$ne': version}})
        result['previous_entries_replaced'] = len(old_rent) + len(old_bills)
        result['previous_payments_replaced'] = len(old_payments) + len(old_bill_payments)

        source_history = await db.tenants.find(
            {'user_id': owner, 'archive_reason': 'Historical source profile; current occupancy not confirmed'},
            {'_id': 0, 'id': 1},
        ).to_list(10000)
        for tenant in source_history:
            await db.tenants.update_one(
                {'id': tenant['id'], 'user_id': owner},
                {'$set': {'source_import_history': True, 'retention_exempt': True}},
            )
        result['retained_source_profiles'] = len(source_history)
        return result

    @router.get('/financial-source-import')
    async def financial_import_state(user=Depends(current_user)):
        require_roles(user, ['owner'])
        batches = await db.financial_imports.find({'owner_id': user['id']}, {'_id': 0}).to_list(1000)
        latest = batches[-1] if batches else {}
        version = latest.get('version')
        marker_filter = {'owner_id': user['id']}
        if version:
            marker_filter['version'] = version
        return {
            'posted_entries': await db.financial_import_entries.count_documents(marker_filter),
            'active_version': version,
            'review_items': latest.get('payload', {}).get('review_items', []),
        }
