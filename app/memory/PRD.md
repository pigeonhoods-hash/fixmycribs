# FixMyCribs — PRD

## Problem statement (this iteration)
Enhance an existing React+FastAPI+MongoDB property management app:
1. Per-property bills default to the current month; other months only on navigation.
2. Property capacity (occupants/beds/flats/rooms/units) + occupancy % = active tenants ÷ capacity.
3. Export bills to Excel: per month/year, per property or all combined; each month = its own sheet, properties listed downward with per-property subtotals; optional single-tenant export.
4. AI Excel import: AI reads uploaded sheet, previews matched/unmatched rows; landlord adds (auto-create tenant) or skips unmatched, then commits (creates bills + payments).

## Tech stack
React (CRA + shadcn/ui) + FastAPI + MongoDB. AI via emergentintegrations (Claude sonnet) using EMERGENT_LLM_KEY. Excel via openpyxl (backend) + xlsx/file-saver (frontend, file-saver used for download).

## Implemented (2026-07-10)
- Property capacity_type + capacity on PropertyIn; occupancy_pct on list/get properties. Frontend: capacity fields in add-property form, occupancy bar on cards + PropertyDetail card.
- GET /api/bills/export (period=month|year|all, property_id, tenant_id) -> streamed .xlsx, month-per-sheet, property grouping + subtotals.
- POST /api/bills/import/analyze (multipart file + property_id) -> AI-parsed matched/unmatched preview.
- POST /api/bills/import/commit -> creates bills, optional tenant creation for unmatched, records payments.
- Shared BillsTools.jsx (Export + AI Import dialogs) wired into Bills.jsx and PropertyBills.jsx.
- Route order fix: get_bill registered after /bills/export so it isn't captured by /bills/{bill_id}.
- Hardening: commit verifies tenant.property_id == property_id; analyze wraps AI call in 60s timeout.
- Per-property bills already default to current month (verified).

## Testing
iteration_1.json: backend 100% (8/8 pytest), frontend 100%. No open issues.

## Backlog / Next
- P1: Allow editing property capacity from PropertyDetail (currently set at creation only).
- P2: Split server.py into modules; add pagination for very large export sets.
- P2: Import: support CSV in addition to .xlsx.

## Update 2026-07-10 (session 5)
- **Auto-renewal of recurring charges**: `renew_recurring_charges()` generates the next rent cycle & recurring bill (service charge, etc.) once a period elapses, based on tenant.rent_frequency / bill.frequency (weekly/monthly/quarterly/bi_annually/yearly). Runs on startup, every 6h background loop, and throttled-hourly on notification fetch. Idempotent + catch-up safe. New cycles auto-surface in the existing notifications feed so landlords are reminded. Manual trigger: POST /api/charges/renew. Verified (monthly rent due 2026-04-05 → generated May/Jun/Jul, stops at current period).
- **Dark mode**: system-aware default + one-click ThemeToggle (header + sidebar). Anti-FOUC init script in index.html. Whole-app theming via `.dark` CSS override layer in index.css (remaps hardcoded slate/white utilities) + expanded shadcn dark tokens. Verified across dashboard, bills, expenses.
- **Auth redesign** (AuthShell): immersive animated split login/signup with rotating live-feed. Mobile branded headers.
- **Mobile fixes**: DashboardHome stat-card digits responsive; Tenants & Payments now card-based on mobile (property detail pages already were).

## Iteration — Security, Subscription Enforcement & Email Auth (2026-07-10)
Problem: enforce subscription perks (block users from features not in their plan, backend + frontend), add email authentication with email verification + password reset, compulsory strong password (upper/lower/number/special, min 8), and harden security.

Implemented:
- **Strong password policy** (`validate_password_strength`) enforced on register, reset-password, change-password, tenant invite accept, FM invite accept, admin reset-password. Frontend live checklist (PasswordChecklist) + client validation on all password forms.
- **Email verification**: new OWNER registrations start `email_verified=false`; `get_current_user` returns 403 for unverified owners; `/auth/verify-email`, `/auth/resend-verification` endpoints; VerifyEmail page (/verify-email + /verify-email/:token); Protected redirects unverified owners to /verify-email. Tenants/FMs auto-verified on invite accept. Existing users backfilled verified. EMAIL DELIVERY IS MOCKED (no SMTP) — links returned as dev_verification_link / logged in dev mode.
- **Password reset via email** (pre-existing) now enforces strong policy; links are dev/logged (no SMTP).
- **Brute-force protection**: 5 failed logins/email -> 15-min lockout (429).
- **Subscription feature-gating**: added `bills` and `reports` boolean plan limits (starter=false, growth/pro=true) + startup backfill. Backend `require_feature` gates on: reports/summary, bills export/import, all bill-creation endpoints (create_bill, bulk_diesel, service_charge, bulk_service_charge), maintenance complaint endpoints (owner + tenant create), facility managers (limit 0 for starter). Frontend: useSubscription/can(), sidebar shows locked items with lock icon, FeatureGate upgrade screen on gated routes.
- **Bug fix**: removed pre-existing stray `pp;` line in App.js that was crashing the entire frontend (white screen).

Verified: testing agent 26/26 backend pass, all critical frontend flows pass. Test accounts in test_credentials.md.

## Backlog / Next
- P1: Configure real email delivery (SendGrid/Resend/SMTP) so verification & reset emails are actually sent — currently MOCKED (dev links only).
- P2: Add "Sign in with Google" (deferred by user).
- P3: Optionally route locked-nav clicks to the FeatureGate page instead of Billing; silence Recharts width/height(-1) warnings; consider splitting server.py into modules.

## Iteration — Real Email Delivery via SMTP (2026-07-10)
- Implemented real transactional email using Python stdlib smtplib over Gmail SMTP (SSL 465), sent in a daemon thread so the async event loop never blocks. Falls back to dev-logging when SMTP env not set.
- HTML + plain multipart emails with branded template + CTA button (_html_email).
- Senders: verification & password-reset from `no-reply@fixmycribs.ng`; welcome email (sent after successful email verification) from `hello@fixmycribs.ng`. Tenant/FM invite emails also now deliver for real.
- Verified end-to-end: verification, welcome, both accepted by Gmail (logs show [email->sent]).
- Config in backend/.env: SMTP_HOST/PORT/USERNAME/PASSWORD (Gmail app password), SMTP_FROM_EMAIL, SMTP_FROM_EMAIL_WELCOME, SMTP_FROM_NAME.
- NOTE: Gmail may rewrite the visible From to the authenticated Gmail account unless no-reply@fixmycribs.ng / hello@fixmycribs.ng are added as verified "Send mail as" aliases in Gmail, and SPF/DKIM for fixmycribs.ng are set for good deliverability. Set APP_ENV=production in prod so dev_verification_link isn't returned in API responses.

## Iteration — Email Redesign + Large Demo Dataset (2026-07-10)
- Redesigned all transactional emails (_html_email) into a premium branded template: dark header band, logo lockup, accent bar, big title, paragraph rendering, pill CTA with shadow, footer. Per-type accents & copy — verification (emerald), welcome (blue, from hello@), password reset (amber). send_email_dev now forwards accent/eyebrow/preheader/footnote. Verified all 3 send via Gmail SMTP.
- Added backend/seed_demo.py (idempotent, tagged demo_seed) seeding a PRO owner demo@fixmycribs.com / Demo@12345!: 30 properties (15-20 unit capacity), 300 tenants, yearly rent + yearly service charge, monthly electricity+water bills Jan→present, monthly per-property expenses, 5 facility managers, 20 complaints. Includes payments (with property_id) + bill_payments so Reports show real collected revenue.
- Verified: dashboard ₦398m collected / 85 overdue tenants; reports collected/bills/expenses/net all populated across 30 properties.

## Iteration — Scale: Pagination + Indexes + Aggregation (2026-07-10)
- Added MongoDB compound indexes (utility_bills owner+property/tenant/due/created, payments, rent_records, expenses, tenants user+status+created+id) on startup.
- Reports (`/reports/summary`) rewritten from ~150 N+1 queries to ~5 aggregation pipelines (payments/bill_payments $lookup/expenses/rent_records/tenants grouped by property). Same response shape; verified ₦398m collected etc.
- New `/bills/property-summary?month=` aggregation endpoint powers the Bills landing cards server-side (no more downloading all bills). Bills.jsx rewritten to consume it (+ month list + property search).
- `/tenants` now supports optional pagination (page/page_size/q/property_id) returning an envelope; legacy call (no page) still returns an array for other consumers. Tenants.jsx paginates (25/page) with server-side search; overdue quick-filter loads all.
- FIXED critical pagination bug (testing agent): non-deterministic sort on tied created_at caused duplicate rows across pages — added `id` ASC tiebreaker + covering index. Verified 300 unique / 0 duplicates across 12 pages.
- Testing: 7/7 backend pytest pass, all frontend flows pass (iteration_2.json).

## Backlog / Next
- Reduce list_tenants N+1 (rent_records per tenant) via a single aggregation/bulk $in when scaling further.
- Paginate PropertyBills drill-down and other selector dropdowns for true multi-million scale.
- Continue modularizing server.py (now ~4780 lines).

## Iteration — Deep Scale: bulk tenants + PropertyBills pagination + typeahead (2026-07-10)
- Tenants list N+1 removed: enrich() now uses 2 bulk queries per page (properties $in + rent_records aggregation for latest-per-tenant) instead of ~2N queries.
- `/bills` extended with month + page/page_size (envelope) + bulk name enrichment; legacy array preserved when no page param.
- New `/bills/property/{pid}/summary?month=` aggregation powers PropertyBills stat cards, month list & per-type tab counts server-side.
- PropertyBills.jsx rewritten: loadSummary + paginated loadRows + bounded loadTenants; added table pagination (bills-pagination). No longer downloads all bills.
- New TenantSelect typeahead component (server-searched, property-scoped) replaces the Service-charge & Other-bill tenant dropdowns.
- Added compound indexes on utility_bills (owner+property+tenant+due, owner+property+bill_type+due).
- Testing: 6/6 new + 7/7 prior pytests pass, all frontend flows pass (iteration_3.json). No open issues.

## Backlog / Next
- Deprecate remaining unpaginated `.to_list(5000000)` paths once all consumers migrate.
- Extend typeahead pattern to other tenant/property dropdowns (RentRecords, Messages, Payments).
- Modularize server.py (~4,850 lines) into tenants/bills/reports routers.
