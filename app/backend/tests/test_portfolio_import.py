import copy
import json
from pathlib import Path
import sys
import types
import unittest
from portfolio_import import validate_payload, validate_record, stable_id, register_portfolio_import
from test_roster_import import Collection, HttpError


class EditableCollection(Collection):
    async def update_one(self, query, change, upsert=False):
        for row in self.rows:
            if self.matches(row, query):
                row.update(copy.deepcopy(change.get('$set', {})))
                return
        if upsert: self.rows.append({**query, **copy.deepcopy(change.get('$setOnInsert', {}))})
    async def delete_many(self, query):
        before=len(self.rows);self.rows[:]=[row for row in self.rows if not self.matches(row,query)]
        return types.SimpleNamespace(deleted_count=before-len(self.rows))


class Router:
    def __init__(self): self.routes = {}
    def route(self, method, path):
        def store(fn): self.routes[(method,path)] = fn; return fn
        return store
    def post(self,path): return self.route('POST',path)
    def get(self,path): return self.route('GET',path)
    def patch(self,path): return self.route('PATCH',path)


class PortfolioTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        fake = types.ModuleType('fastapi'); fake.Body=lambda *a,**k:None; fake.Depends=lambda *a,**k:None; fake.HTTPException=HttpError
        self.previous=sys.modules.get('fastapi');sys.modules['fastapi']=fake
        self.db=types.SimpleNamespace(properties=EditableCollection(),tenants=EditableCollection(),imported_receipts=EditableCollection(),portfolio_imports=EditableCollection())
        self.router=Router();self.limit=100
        async def plan(user):return {'limits':{'properties':self.limit,'tenants':self.limit}}
        def roles(user,allowed):
            if user['role'] not in allowed:raise HttpError(403,'Forbidden')
        register_portfolio_import(self.router,self.db,lambda:None,roles,plan,lambda:'2026-10-30T00:00:00Z')
        self.user={'id':'owner','role':'owner'}
        self.payload={'source':'Source','properties':[{'key':'p','name':'Property','address':'As stated'}],'receipts':[{'property_key':'p','receipt_key':'sheet1','tenant_name':'Test Person','total_amount':1000,'amount_paid':500,'receipt_date':'2025-01-01'}],'occupants':[{'property_key':'p','full_name':'Current Person','source_row':'November!3'}]}
    async def asyncTearDown(self):
        if self.previous is None:sys.modules.pop('fastapi',None)
        else:sys.modules['fastapi']=self.previous
    async def call(self,dry=True,user=None):return await self.router.routes[('POST','/portfolio-source-import')](self.payload,dry,user or self.user)
    async def test_preview_does_not_write(self):
        r=await self.call();self.assertEqual((r['properties_to_add'],r['receipts_to_add'],r['occupants_to_add']),(1,1,1));self.assertFalse(self.db.properties.rows)
    async def test_commit_and_retry_are_insert_only(self):
        await self.call(False);r=await self.call(False)
        self.assertEqual((r['properties_to_add'],r['receipts_to_add'],r['occupants_to_add'],r['already_imported']),(0,0,0,1))
        self.assertIsNone(self.db.tenants.rows[0]['tenant_user_id']);self.assertIsNone(self.db.tenants.rows[0]['rent_amount'])
        self.assertEqual(self.db.tenants.rows[0]['invite_status'],'not_sent')
    async def test_two_owners_are_isolated(self):
        await self.call(False)
        r=await self.router.routes[('GET','/imported-records')]({'id':'other','role':'owner'})
        self.assertFalse(r['records']);self.assertFalse(r['properties'])
    async def test_non_owner_is_rejected(self):
        with self.assertRaises(HttpError):await self.call(False,{'id':'owner','role':'tenant'})
        self.assertFalse(self.db.imported_receipts.rows)
    async def test_property_limit_rejected_before_write(self):
        self.limit=0
        with self.assertRaises(HttpError):await self.call(False)
        self.assertFalse(self.db.portfolio_imports.rows)
    async def test_edit_preserves_original(self):
        await self.call(False);rid=self.db.imported_receipts.rows[0]['id']
        await self.router.routes[('PATCH','/imported-records/{rid}')](rid,{'amount_paid':750,'notes':'Corrected'},self.user)
        row=self.db.imported_receipts.rows[0];self.assertEqual(row['amount_paid'],750);self.assertEqual(row['source_original']['amount_paid'],500)
    async def test_cross_owner_edit_is_rejected(self):
        await self.call(False);rid=self.db.imported_receipts.rows[0]['id']
        with self.assertRaises(HttpError):await self.router.routes[('PATCH','/imported-records/{rid}')](rid,{'amount_paid':750},{'id':'other','role':'owner'})
    async def test_owner_cannot_be_changed(self):
        await self.call(False);rid=self.db.imported_receipts.rows[0]['id']
        with self.assertRaises(HttpError):await self.router.routes[('PATCH','/imported-records/{rid}')](rid,{'owner_id':'other'},self.user)
    async def test_source_credits_and_missing_values_are_preserved(self):
        r=validate_record({'receipt_key':'r','tenant_name':'n','balance':-50});self.assertEqual(r['balance'],-50);self.assertIsNone(r['amount_paid'])
    async def test_invalid_money_and_duplicate_keys_rejected(self):
        for value in (float('nan'),float('inf'),'100',True):
            with self.assertRaises(ValueError):validate_record({'receipt_key':'r','tenant_name':'n','total_amount':value})
        p=copy.deepcopy(self.payload);p['receipts']*=2
        with self.assertRaises(ValueError):validate_payload(p)
    async def test_bad_dates_and_foreign_properties_rejected(self):
        for changes in ({'receipt_date':'2026-02-31'},{'property_key':'missing'}):
            p=copy.deepcopy(self.payload);p['receipts'][0].update(changes)
            with self.assertRaises(ValueError):validate_payload(p)


if __name__=='__main__':unittest.main()
