"""One-time FixMyCribs admin recovery, run manually in the Railway backend shell.

Uses Railway's ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD variables.
Never run this automatically on application startup or through an HTTP endpoint.
"""

import os
import re
import sys
from datetime import datetime, timezone

import bcrypt
from pymongo import MongoClient


def abort(message):
    print(f"ERROR: {message}", flush=True)
    sys.exit(1)


def main():
    email = os.environ.get("ADMIN_SEED_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_SEED_PASSWORD", "")
    mongo_url = os.environ.get("MONGO_URL", "")
    db_name = os.environ.get("DB_NAME", "")

    if not email or "@" not in email:
        abort("Set ADMIN_SEED_EMAIL on the Railway backend service.")
    if not mongo_url or not db_name:
        abort("Set MONGO_URL and DB_NAME on the Railway backend service.")
    if not (12 <= len(password.encode("utf-8")) <= 72):
        abort("ADMIN_SEED_PASSWORD must be between 12 and 72 UTF-8 bytes.")
    if not all([
        re.search(r"[A-Z]", password),
        re.search(r"[a-z]", password),
        re.search(r"[0-9]", password),
        re.search(r"[^A-Za-z0-9]", password),
    ]):
        abort("ADMIN_SEED_PASSWORD must contain uppercase, lowercase, a digit, and a symbol.")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        db = client[db_name]
        existing = db.users.find_one({"email": email})
        if not existing:
            abort("No user found for ADMIN_SEED_EMAIL. Verify Railway variables and restart the backend to seed the admin first.")
        if existing.get("role") != "admin":
            abort("The configured email belongs to a non-admin account. No changes made.")
        if existing.get("account_status", "active") != "active":
            abort("The admin account is not active. No changes made.")

        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        result = db.users.update_one(
            {"_id": existing["_id"], "role": "admin"},
            {"$set": {
                "password_hash": hashed,
                "email_verified": True,
                "must_change_password": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        if result.modified_count != 1:
            abort("Database did not confirm a password update.")

        updated = db.users.find_one({"_id": existing["_id"], "role": "admin"})
        if not updated or not bcrypt.checkpw(password.encode("utf-8"), updated["password_hash"].encode("utf-8")):
            abort("Password verification failed after update.")
        db.login_attempts.delete_many({"email": email})
        print("SUCCESS: Admin password verified and login lockout cleared.", flush=True)
        print("Log in with ADMIN_SEED_EMAIL and your configured password.", flush=True)
        print("After successful login, remove ADMIN_SEED_PASSWORD from Railway variables.", flush=True)
    except Exception as error:
        abort(f"Database/recovery error: {type(error).__name__} (details withheld to protect secrets).")
    finally:
        client.close()


if __name__ == "__main__":
    main()
