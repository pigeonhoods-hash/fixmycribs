# FixMyCribs cleanup

- Removed Emergent visual-editor CRACO wrapper, frontend package, external JS, page branding.
- Removed `emergentintegrations` dependency and replaced the two AI call sites with `backend/ai_provider.py`.
- Optional `OPENAI_API_KEY` provides AI reminders and spreadsheet parsing via the OpenAI API; with no key, reminders use their existing template fallback and AI spreadsheet import returns its existing validation error.
- Sanitized `.env` files out of the distribution: copy `.env.example` to `.env` and set your actual values locally.
- The original archive contained credentials; rotate any real keys before publishing or deploying.
- Preserved property, tenancy, billing, user, and support application logic.
- Build and integration tests require installing dependencies and running MongoDB; not run here.
