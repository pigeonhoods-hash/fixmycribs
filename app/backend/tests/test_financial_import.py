import copy
import sys
import types
import unittest
from financial_import import validate, register_financial_import
from test_portfolio_import import Router, EditableCollection
from test_roster_import import HttpError


class FinancialTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        fake=types.ModuleType('fastapi');fake.Body=lambda *a,**k:None;fake.Depends=lambda *a,**k:None;fake.HTTPException=HttpError
        self.previous=sys.modules.get('fastapi');sys.modules['fastapi']=fake
        self.db=types.SimpleNamespace(**{k:EditableCollection() for k in ['properties','tenants','imported_receipts','financial_import_entries','financial_imports','rent_records','payments','utility_bills','bill_payments']})
        self.db.properties.rows=[{'id':'p','user_id':'o','name':'Property'}]
        self.db.tenants.rows=[{'id':'t','user_id':'o','property_id':'p','full_name':'Current','apartment_number':'1A','status':'active'}]
        self.db.imported_receipts.rows=[{'receipt_key':'sheet','owner_id':'o','property_id':'p'}]
        self.router=Router()
        def roles(user,allowed):
            if user['role'] not in allowed:raise HttpError(403,'Forbidden')
        register_financial_import(self.router,self.db,lambda:None,roles,lambda:'2026-10-30',lambda d,a,p:'paid' if a==p else 'overdue')
        self.user={'id':'o','role':'owner'}
        self.data={'source':'Original receipts','entries':[{'key':'opening-1','property_name':'Property','tenant_name':'Current','target_name':'Current','target_unit':'1A','source_keys':['sheet'],'date':'2026-10-01','kind':'rent','title':'Rent','amount_due':1000,'amount_paid':600,'notes':'Opening snapshot','rent_amount':1000}]}
    async def asyncTearDown(self):
        if self.previous is None:sys.modules.pop('fastapi',None)
        else:sys.modules['fastapi']=self.previous
    async def call(self,dry=True,user=None):return await self.router.routes[('POST','/financial-source-import')](self.data,dry,user or self.user)
    async def test_preview_has_no_side_effect(self):
        r=await self.call();self.assertEqual(r['totals']['rent_paid'],600);self.assertFalse(self.db.rent_records.rows);self.assertNotIn('rent_amount',self.db.tenants.rows[0])
    async def test_post_and_retry_do_not_duplicate(self):
        await self.call(False);r=await self.call(False)
        self.assertEqual(r['already_posted'],1);self.assertEqual(len(self.db.payments.rows),1);self.assertEqual(self.db.rent_records.rows[0]['balance'],400);self.assertEqual(self.db.tenants.rows[0]['rent_frequency'],'one_time')
    async def test_recovery_from_partial_write(self):
        await self.call(False);self.db.financial_import_entries.rows=[];self.db.payments.rows=[]
        await self.call(False);self.assertEqual(len(self.db.rent_records.rows),1);self.assertEqual(len(self.db.payments.rows),1)
    async def test_bill_and_payment_link(self):
        self.data['entries'][0]['kind']='service_charge';await self.call(False)
        self.assertFalse(self.db.rent_records.rows);self.assertEqual(self.db.bill_payments.rows[0]['bill_id'],self.db.utility_bills.rows[0]['id'])
    async def test_cross_owner_cannot_post(self):
        with self.assertRaises(HttpError):await self.call(False,{'id':'other','role':'owner'})
        self.assertFalse(self.db.financial_imports.rows)
    async def test_foreign_source_aborts_all_before_write(self):
        second=copy.deepcopy(self.data['entries'][0]);second.update(key='bad',source_keys=['foreign']);self.data['entries'].append(second)
        with self.assertRaises(HttpError):await self.call(False)
        self.assertFalse(self.db.rent_records.rows)
    async def test_ambiguous_name_requires_unit(self):
        self.db.tenants.rows.append({**self.db.tenants.rows[0],'id':'t2','apartment_number':'1B'});self.data['entries'][0]['target_unit']=''
        with self.assertRaises(HttpError):await self.call(False)
    async def test_missing_current_match_never_creates_profile(self):
        self.data['entries'][0]['target_name']='Missing'
        with self.assertRaises(HttpError):await self.call(False)
        self.assertEqual(len(self.db.tenants.rows),1)
    async def test_historical_profile_has_no_access_or_recurring_rent(self):
        self.data['entries'][0].update(target_name='',tenant_name='Historical',historical=True)
        await self.call(False);t=self.db.tenants.rows[-1]
        self.assertEqual(t['status'],'archived');self.assertIsNone(t['tenant_user_id']);self.assertIsNone(t['lease_start']);self.assertEqual(t['rent_frequency'],'one_time');self.assertTrue(t['retention_exempt']);self.assertTrue(t['source_import_history'])
    async def test_retry_backfills_retention_on_existing_source_history(self):
        self.db.tenants.rows.append({'id':'legacy-history','user_id':'o','property_id':'p','full_name':'Legacy','status':'archived','archive_reason':'Historical source profile; current occupancy not confirmed'})
        r=await self.call(False);t=next(x for x in self.db.tenants.rows if x['id']=='legacy-history')
        self.assertTrue(t['retention_exempt']);self.assertTrue(t['source_import_history']);self.assertEqual(r['retained_source_profiles'],1)
    async def test_invalid_amounts_dates_and_duplicate_keys(self):
        for change in [{'amount_paid':float('nan')},{'amount_due':-1},{'amount_paid':1001},{'date':'2026-02-30'},{'kind':'invalid'},{'amount_paid':True}]:
            d=copy.deepcopy(self.data);d['entries'][0].update(change)
            with self.assertRaises(ValueError):validate(d)
        d=copy.deepcopy(self.data);d['entries']*=2
        with self.assertRaises(ValueError):validate(d)
