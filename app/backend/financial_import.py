"""Owner-scoped, retry-safe posting of reconciled source-backed financial entries."""
import hashlib
import json
import math
from datetime import date
from portfolio_import import stable_id


def validate(data):
    if not isinstance(data, dict) or set(data) - {'source','entries','review_items','profiles'} or not {'source','entries'} <= set(data) or not isinstance(data['source'], str) or not data['source'].strip():
        raise ValueError('Source and entries are required')
    if not isinstance(data['entries'], list) or not 1 <= len(data['entries']) <= 1500:
        raise ValueError('Invalid entry count')
    seen = set()
    for e in data['entries']:
        allowed = {'key','property_name','tenant_name','target_name','target_unit','historical','email','phone','source_keys','date','kind','title','amount_due','amount_paid','notes','rent_amount'}
        if not isinstance(e, dict) or set(e) - allowed:
            raise ValueError('Invalid entry fields')
        for k in ('key','property_name','tenant_name','target_name','target_unit','email','phone','date','kind','title','notes'):
            if not isinstance(e.get(k, ''), str) or len(e.get(k,'')) > 12000:
                raise ValueError('Invalid '+k)
        if not e.get('key') or e['key'] in seen or not e.get('tenant_name') or not e.get('property_name'):
            raise ValueError('Unique keys, property and tenant names required')
        seen.add(e['key'])
        date.fromisoformat(e['date'])
        if e['kind'] not in ('rent','service_charge','other','electricity_postpaid','diesel_deposit'):
            raise ValueError('Invalid ledger kind')
        for k in ('amount_due','amount_paid'):
            v=e.get(k)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0 <= v <= 1e12:
                raise ValueError('Invalid '+k)
        if e['amount_paid'] > e['amount_due']:
            raise ValueError('Credit must be reconciled separately')
        if e.get('rent_amount') is not None and (isinstance(e['rent_amount'],bool) or not isinstance(e['rent_amount'],(int,float)) or not math.isfinite(e['rent_amount']) or not 0 <= e['rent_amount'] <= 1e12):
            raise ValueError('Invalid profile rent')
        if not isinstance(e.get('source_keys'),list) or not e['source_keys'] or any(not isinstance(k,str) for k in e['source_keys']):
            raise ValueError('Source references required')
    if not isinstance(data.get('review_items',[]),list) or len(json.dumps(data.get('review_items',[]))) > 100000:
        raise ValueError('Invalid review items')
    if not isinstance(data.get('profiles',[]),list) or len(data.get('profiles',[]))>500:
        raise ValueError('Invalid profile count')
    for p in data.get('profiles',[]):
        if not isinstance(p,dict) or set(p)-{'property_name','target_name','target_unit','rent_amount','email','phone','source_keys'}:
            raise ValueError('Invalid profile')
        for k in ('property_name','target_name','target_unit','email','phone'):
            if not isinstance(p.get(k,''),str) or len(p.get(k,''))>500:raise ValueError('Invalid profile text')
        v=p.get('rent_amount')
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1e12:raise ValueError('Invalid profile rent')
        if not isinstance(p.get('source_keys'),list) or not p['source_keys']:raise ValueError('Profile source required')
    return data


def register_financial_import(router, db, current_user, require_roles, now_iso, status):
    from fastapi import Body, Depends, HTTPException

    @router.post('/financial-source-import')
    async def post_finances(data: dict=Body(...), dry_run: bool=True, user=Depends(current_user)):
        require_roles(user,['owner'])
        try: payload=validate(data)
        except (ValueError,TypeError,KeyError) as exc: raise HTTPException(400,str(exc))
        owner=user['id']
        props=await db.properties.find({'user_id':owner},{'_id':0}).to_list(10000)
        people=await db.tenants.find({'user_id':owner},{'_id':0}).to_list(10000)
        sources=await db.imported_receipts.find({'owner_id':owner},{'_id':0}).to_list(10000)
        by_prop={p['name'].casefold():p['id'] for p in props}
        by_source={r['receipt_key']:r for r in sources}
        pending=[]; new_people={}; updates={}; skipped=0
        totals={'rent_due':0,'rent_paid':0,'bills_due':0,'bills_paid':0}
        for e in payload['entries']:
            pid=by_prop.get(e['property_name'].casefold())
            if not pid: raise HTTPException(400,'Unknown owned property: '+e['property_name'])
            if any(k not in by_source or by_source[k].get('property_id') != pid for k in e['source_keys']):
                raise HTTPException(400,'Source does not belong to this property')
            marker=stable_id(owner,'financial-entry:'+e['key'])
            if await db.financial_import_entries.find_one({'_id':marker,'owner_id':owner}):
                skipped+=1;continue
            matches=[t for t in people if t['property_id']==pid and t['full_name'].casefold()==(e.get('target_name') or e['tenant_name']).casefold() and (not e.get('target_unit') or t.get('apartment_number')==e['target_unit'])]
            if len(matches)>1: raise HTTPException(400,'Ambiguous tenant: specify apartment')
            if matches: tenant=matches[0]
            elif not e.get('historical'): raise HTTPException(400,'Current tenant not matched: '+e['tenant_name'])
            else:
                tid=stable_id(owner,'historical-person:'+pid+':'+e['tenant_name'].casefold())
                tenant=new_people.setdefault(tid,{'id':tid,'user_id':owner,'property_id':pid,'full_name':e['tenant_name'],'status':'archived','archived_at':now_iso(),'archive_reason':'Historical source profile; current occupancy not confirmed','source_import_history':True,'retention_exempt':True,'tenant_user_id':None,'unit_id':None,'apartment_number':e.get('target_unit') or 'Not stated in source','rent_amount':None,'rent_frequency':'one_time','due_date':None,'lease_start':None,'lease_end':None,'email':e.get('email',''),'phone':e.get('phone',''),'whatsapp':'','invite_status':'not_sent','created_at':now_iso(),'notes':'Imported historical financial profile. No lease or move-out dates asserted.'})
            update=updates.setdefault(tenant['id'],{})
            for field in ('email','phone'):
                if not tenant.get(field) and e.get(field): update[field]=e[field]
            if e.get('rent_amount') is not None and not tenant.get('rent_amount'):
                update.update(rent_amount=e['rent_amount'],rent_frequency='one_time',financial_reconciliation='source_posted')
            doc={'id':marker,'user_id':owner,'owner_id':owner,'tenant_id':tenant['id'],'tenant_user_id':tenant.get('tenant_user_id'),'property_id':pid,'unit_id':tenant.get('unit_id'),'apartment_number':tenant.get('apartment_number',''),'amount_due':e['amount_due'],'amount_paid':e['amount_paid'],'balance':round(e['amount_due']-e['amount_paid'],2),'due_date':e['date'],'paid_date':e['date'] if e['amount_paid']==e['amount_due'] else None,'status':status(e['date'],e['amount_due'],e['amount_paid']),'frequency':'one_time','title':e['title'],'description':e['notes'],'notes':e['notes'],'source_keys':e['source_keys'],'source_import':True,'source_reference_date':True,'created_at':now_iso(),'updated_at':now_iso()}
            if e['kind']=='rent':
                doc.update(rent_period_start=None,rent_period_end=None)
                collection='rent_records';pay_collection='payments';prefix='rent'
            else:
                doc['bill_type']=e['kind'];collection='utility_bills';pay_collection='bill_payments';prefix='bills'
            totals[prefix+'_due']+=doc['amount_due'];totals[prefix+'_paid']+=doc['amount_paid']
            pending.append((e,doc,collection,pay_collection))
        for profile in payload.get('profiles',[]):
            pid=by_prop.get(profile['property_name'].casefold())
            matches=[t for t in people if t['property_id']==pid and t['full_name'].casefold()==profile['target_name'].casefold() and (not profile.get('target_unit') or t.get('apartment_number')==profile['target_unit'])]
            if len(matches)!=1 or any(k not in by_source or by_source[k].get('property_id')!=pid for k in profile['source_keys']):
                raise HTTPException(400,'Profile or source not uniquely matched')
            t=matches[0];fields=updates.setdefault(t['id'],{})
            if t.get('rent_amount') is None:fields.update(rent_amount=profile['rent_amount'],rent_frequency='one_time',financial_reconciliation='source_posted')
            for field in ('email','phone'):
                if not t.get(field) and profile.get(field):fields[field]=profile[field]
        result={'dry_run':dry_run,'entries_to_add':len(pending),'historical_profiles_to_add':len(new_people),'profiles_to_update':len(updates),'already_posted':skipped,'totals':{k:round(v,2) for k,v in totals.items()},'notifications_sent':0}
        if dry_run:return result
        digest=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
        await db.financial_imports.update_one({'_id':stable_id(owner,digest)},{'$setOnInsert':{'owner_id':owner,'payload':payload,'created_at':now_iso()}},upsert=True)
        for t in new_people.values():await db.tenants.update_one({'_id':t['id']},{'$setOnInsert':t},upsert=True)
        for tid,fields in updates.items():
            if fields:await db.tenants.update_one({'id':tid,'user_id':owner},{'$set':fields})
        for e,doc,collection,pay_collection in pending:
            await getattr(db,collection).update_one({'_id':doc['id']},{'$setOnInsert':doc},upsert=True)
            if doc['amount_paid']>0:
                pay={'id':stable_id(owner,'financial-payment:'+e['key']),'user_id':owner,'owner_id':owner,'tenant_id':doc['tenant_id'],'property_id':doc['property_id'],'amount':doc['amount_paid'],'payment_date':e['date'],'method':'historical_source','reference':e['key'],'receipt_number':e['key'],'notes':e['notes'],'source_keys':e['source_keys'],'source_import':True,'created_at':now_iso(),('rent_record_id' if collection=='rent_records' else 'bill_id'):doc['id']}
                await getattr(db,pay_collection).update_one({'_id':pay['id']},{'$setOnInsert':pay},upsert=True)
            await db.financial_import_entries.update_one({'_id':doc['id']},{'$setOnInsert':{'owner_id':owner,'key':e['key'],'created_at':now_iso()}},upsert=True)
        # Backfill the retention flag on source-history profiles created by an
        # earlier batch. This deliberately runs on retry-safe commits too, so an
        # existing import can repair its own metadata without duplicating money.
        source_history=await db.tenants.find({'user_id':owner,'archive_reason':'Historical source profile; current occupancy not confirmed'},{'_id':0,'id':1}).to_list(10000)
        for tenant in source_history:
            await db.tenants.update_one({'id':tenant['id'],'user_id':owner},{'$set':{'source_import_history':True,'retention_exempt':True}})
        result['retained_source_profiles']=len(source_history)
        return result

    @router.get('/financial-source-import')
    async def financial_import_state(user=Depends(current_user)):
        require_roles(user,['owner'])
        batches=await db.financial_imports.find({'owner_id':user['id']},{'_id':0}).to_list(1000)
        items=[]
        for batch in batches:items.extend(batch.get('payload',{}).get('review_items',[]))
        return {'posted_entries':await db.financial_import_entries.count_documents({'owner_id':user['id']}),'review_items':items}
