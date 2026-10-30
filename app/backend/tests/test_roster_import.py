import asyncio
import copy
import sys
import types
import unittest
from roster_import import validate_roster, record_id, register_roster_import


class HttpError(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


class Cursor:
    def __init__(self, rows): self.rows = rows
    async def to_list(self, limit): return copy.deepcopy(self.rows[:limit])


class Collection:
    def __init__(self, rows=None): self.rows = rows or []
    def matches(self, row, query):
        return all((row.get(k) != v['$ne']) if isinstance(v, dict) and '$ne' in v else row.get(k) == v for k, v in query.items())
    async def find_one(self, query, projection=None):
        return next((copy.deepcopy(r) for r in self.rows if self.matches(r, query)), None)
    def find(self, query, projection=None): return Cursor([r for r in self.rows if self.matches(r, query)])
    async def count_documents(self, query): return len([r for r in self.rows if self.matches(r, query)])
    async def update_one(self, query, change, upsert=False):
        if not await self.find_one(query): self.rows.append({**query, **copy.deepcopy(change['$setOnInsert'])})


class Router:
    def post(self, path):
        def save(fn): self.fn = fn; return fn
        return save


class RosterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        fake = types.ModuleType('fastapi')
        fake.Body = lambda *a, **k: None
        fake.Depends = lambda *a, **k: None
        fake.HTTPException = HttpError
        self.previous = sys.modules.get('fastapi')
        sys.modules['fastapi'] = fake
        self.db = types.SimpleNamespace(properties=Collection([{'id':'p','user_id':'o'}]), units=Collection(), tenants=Collection(), roster_imports=Collection())
        self.router = Router()
        self.limit = 100
        async def plan(user): return {'limits': {'tenants': self.limit}}
        def roles(user, allowed):
            if user['role'] not in allowed: raise HttpError(403, 'Forbidden')
        register_roster_import(self.router, self.db, lambda: None, roles, plan, lambda: '2026-10-30T00:00:00Z')
        self.payload = {'source':'Register','as_of':'2026-10-30','rows':[{'unit_number':'1A','occupant_name':'Test Tenant'},{'unit_number':'1B'}]}
        self.user = {'id':'o','role':'owner'}

    async def asyncTearDown(self):
        if self.previous is None: sys.modules.pop('fastapi', None)
        else: sys.modules['fastapi'] = self.previous

    async def call(self, dry=True, user=None, payload=None):
        return await self.router.fn('p', payload or self.payload, dry, user or self.user)

    async def test_preview_is_read_only(self):
        out = await self.call()
        self.assertEqual((out['units_to_add'], out['tenants_to_add']), (2,1))
        self.assertEqual(len(self.db.units.rows)+len(self.db.tenants.rows)+len(self.db.roster_imports.rows), 0)

    async def test_insert_preserves_unknown_finances_and_no_portal_access(self):
        await self.call(False)
        tenant = self.db.tenants.rows[0]
        self.assertIsNone(tenant['rent_amount'])
        self.assertIsNone(tenant['due_date'])
        self.assertIsNone(tenant['tenant_user_id'])
        self.assertEqual(tenant['invite_status'], 'not_sent')
        self.assertEqual(len(self.db.units.rows), 2)

    async def test_retry_is_idempotent(self):
        await self.call(False)
        out = await self.call(False)
        self.assertEqual((out['units_to_add'], out['tenants_to_add'], out['already_imported']), (0,0,2))
        self.assertEqual(len(self.db.tenants.rows), 1)

    async def test_other_owner_cannot_import(self):
        with self.assertRaises(HttpError) as err: await self.call(False, {'id':'x','role':'owner'})
        self.assertEqual(err.exception.status_code, 404)
        self.assertFalse(self.db.units.rows)

    async def test_tenant_role_cannot_import(self):
        with self.assertRaises(HttpError) as err: await self.call(False, {'id':'o','role':'tenant'})
        self.assertEqual(err.exception.status_code, 403)

    async def test_plan_limit_aborts_before_write(self):
        self.limit = 0
        with self.assertRaises(HttpError): await self.call(False)
        self.assertFalse(self.db.units.rows)

    async def test_conflict_aborts_entire_batch(self):
        self.db.units.rows.append({'id':'existing','property_id':'p','unit_number':'1B'})
        with self.assertRaises(HttpError): await self.call(False)
        self.assertEqual(len(self.db.units.rows), 1)
        self.assertFalse(self.db.tenants.rows)

    async def test_occupant_change_is_not_overwritten(self):
        await self.call(False)
        new = copy.deepcopy(self.payload)
        new['rows'][0]['occupant_name'] = 'Changed'
        with self.assertRaises(HttpError): await self.call(False, payload=new)
        self.assertEqual(self.db.tenants.rows[0]['full_name'], 'Test Tenant')

    async def test_invalid_rows_rejected(self):
        for rows in ([{'unit_number':'1A'}, {'unit_number':'1a'}], [{'unit_number':'1A','email':'broken'}], [{'unit_number':'1A','email':'x@y.com'}], [{'unit_number':'1A','user_id':'x'}]):
            with self.subTest(rows=rows), self.assertRaises(ValueError): validate_roster({**self.payload, 'rows':rows})

    async def test_ids_are_owner_scoped(self):
        self.assertNotEqual(record_id('a','p','1A','unit'), record_id('b','p','1A','unit'))


if __name__ == '__main__': unittest.main()
