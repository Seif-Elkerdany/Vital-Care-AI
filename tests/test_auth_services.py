import unittest
from datetime import datetime, timezone

from backend_api.db.security import AuthError, PasswordHasher, TokenService
from backend_api.db.services import AuthService


class FakeConnection:
    def transaction(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        del exc_type, exc, tb
        return False


class FakeDatabase:
    def __init__(self):
        self.connection = FakeConnection()

    def connect(self):
        return self.connection

    def transaction(self):
        return self.connection


class FakeUsers:
    def __init__(self):
        self.users_by_email = {}
        self.users_by_id = {}
        self.created_users = []

    def create_user(self, connection, *, email, password_hash, full_name, role):
        del connection
        if email in self.users_by_email:
            return None
        user = {
            "id": f"user-{len(self.users_by_email) + 1}",
            "email": email,
            "password_hash": password_hash,
            "full_name": full_name,
            "role": role,
            "created_at": datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc),
        }
        self.users_by_email[email] = user
        self.users_by_id[user["id"]] = user
        self.created_users.append(dict(user))
        return dict(user)

    def get_by_email(self, connection, email):
        del connection
        user = self.users_by_email.get(email)
        return dict(user) if user is not None else None

    def get_by_id(self, connection, user_id):
        del connection
        user = self.users_by_id.get(user_id)
        return dict(user) if user is not None else None

    def update_password_hash(self, connection, *, user_id, password_hash):
        del connection
        user = self.users_by_id.get(user_id)
        if user is None:
            return None
        user["password_hash"] = password_hash
        user["updated_at"] = datetime.now(timezone.utc)
        self.users_by_email[user["email"]] = user
        return dict(user)


class FakeAuthSessions:
    def __init__(self):
        self.sessions = {}
        self.counter = 0

    def create_session(self, connection, *, user_id, refresh_token_hash, expires_at):
        del connection
        self.counter += 1
        session = {
            "id": f"session-{self.counter}",
            "user_id": user_id,
            "refresh_token_hash": refresh_token_hash,
            "expires_at": expires_at,
            "revoked_at": None,
            "last_used_at": None,
            "created_at": datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc),
        }
        self.sessions[session["id"]] = session
        return dict(session)

    def get_by_id(self, connection, *, session_id):
        del connection
        session = self.sessions.get(session_id)
        return dict(session) if session is not None else None

    def rotate_refresh_token(self, connection, *, session_id, refresh_token_hash, expires_at):
        del connection
        session = self.sessions.get(session_id)
        if session is None or session.get("revoked_at") is not None:
            return None
        session["refresh_token_hash"] = refresh_token_hash
        session["expires_at"] = expires_at
        session["last_used_at"] = datetime.now(timezone.utc)
        return dict(session)

    def touch_session(self, connection, *, session_id):
        del connection
        session = self.sessions.get(session_id)
        if session is None or session.get("revoked_at") is not None:
            return None
        session["last_used_at"] = datetime.now(timezone.utc)
        return dict(session)

    def revoke_session(self, connection, *, session_id):
        del connection
        session = self.sessions.get(session_id)
        if session is None or session.get("revoked_at") is not None:
            return None
        session["revoked_at"] = datetime.now(timezone.utc)
        session["last_used_at"] = datetime.now(timezone.utc)
        return dict(session)

    def revoke_all_for_user(self, connection, *, user_id):
        del connection
        count = 0
        for session in self.sessions.values():
            if session["user_id"] == user_id and session.get("revoked_at") is None:
                session["revoked_at"] = datetime.now(timezone.utc)
                session["last_used_at"] = datetime.now(timezone.utc)
                count += 1
        return count


class FakePasswordResets:
    def __init__(self):
        self.tokens = {}
        self.counter = 0

    def create_token(self, connection, *, user_id, token_hash, expires_at):
        del connection
        self.counter += 1
        record = {
            "id": f"reset-{self.counter}",
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used_at": None,
            "created_at": datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc),
        }
        self.tokens[token_hash] = record
        return dict(record)

    def get_by_token_hash(self, connection, *, token_hash):
        del connection
        record = self.tokens.get(token_hash)
        return dict(record) if record is not None else None

    def mark_used(self, connection, *, reset_token_id):
        del connection
        for record in self.tokens.values():
            if record["id"] == reset_token_id and record["used_at"] is None:
                record["used_at"] = datetime.now(timezone.utc)
                return dict(record)
        return None


class FakePasswordResetEmailSender:
    def __init__(self):
        self.sent = []

    def send_password_reset(self, *, recipient_email, reset_url, expires_at):
        self.sent.append(
            {
                "recipient_email": recipient_email,
                "reset_url": reset_url,
                "expires_at": expires_at,
            }
        )


class AuthServiceTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.users = FakeUsers()
        self.auth_sessions = FakeAuthSessions()
        self.password_resets = FakePasswordResets()
        self.password_hasher = PasswordHasher()
        self.token_service = TokenService(
            "test-secret",
            ttl_seconds=3600,
            refresh_ttl_seconds=7200,
        )
        self.service = AuthService(
            self.database,
            users=self.users,
            auth_sessions=self.auth_sessions,
            password_resets=self.password_resets,
            password_hasher=self.password_hasher,
            token_service=self.token_service,
            password_reset_token_ttl_seconds=1800,
            password_reset_email_sender=None,
            password_reset_url_base=None,
        )

    def test_register_doctor_normalizes_email_trims_name_and_returns_token(self):
        result = self.service.register_doctor(
            email=" Doctor@Example.com ",
            password="secretpass",
            full_name="  Doctor One  ",
        )

        self.assertEqual(result["user"]["email"], "doctor@example.com")
        self.assertEqual(result["user"]["full_name"], "Doctor One")
        self.assertEqual(result["user"]["role"], "doctor")
        self.assertIn("access_token", result)
        self.assertIn("refresh_token", result)
        created = self.users.created_users[-1]
        self.assertEqual(created["email"], "doctor@example.com")
        self.assertNotEqual(created["password_hash"], "secretpass")

    def test_register_doctor_rejects_duplicate_email(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(ValueError, "already exists"):
            self.service.register_doctor(
                email="doctor@example.com",
                password="secretpass",
                full_name=None,
            )

    def test_register_doctor_rejects_invalid_email_formats(self):
        invalid_emails = [
            "doctor",
            "doctor@",
            "@example.com",
            "doctor@example",
            "doctor name@example.com",
            "doctor@example..com",
        ]

        for email in invalid_emails:
            with self.subTest(email=email):
                with self.assertRaisesRegex(ValueError, "valid email"):
                    self.service.register_doctor(
                        email=email,
                        password="secretpass",
                        full_name=None,
                    )

    def test_login_returns_user_and_access_token_for_valid_credentials(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name="Doctor One",
        )

        result = self.service.login(email="doctor@example.com", password="secretpass")

        self.assertEqual(result["user"]["email"], "doctor@example.com")
        self.assertEqual(result["user"]["role"], "doctor")
        self.assertIn("access_token", result)
        self.assertIn("refresh_token", result)

    def test_login_rejects_wrong_password(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(AuthError, "Invalid email or password."):
            self.service.login(email="doctor@example.com", password="wrongpass")

    def test_login_rejects_invalid_email_as_bad_credentials(self):
        with self.assertRaisesRegex(AuthError, "Invalid email or password."):
            self.service.login(email="not-an-email", password="secretpass")

    def test_current_user_resolves_user_from_token(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name="Doctor One",
        )

        current = self.service.current_user(registered["access_token"])

        self.assertEqual(current["email"], "doctor@example.com")
        self.assertEqual(current["role"], "doctor")

    def test_refresh_rotates_refresh_token_and_returns_new_access_token(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name="Doctor One",
        )

        refreshed = self.service.refresh(refresh_token=registered["refresh_token"])

        self.assertIn("access_token", refreshed)
        self.assertIn("refresh_token", refreshed)
        self.assertNotEqual(refreshed["refresh_token"], registered["refresh_token"])
        current = self.service.current_user(refreshed["access_token"])
        self.assertEqual(current["email"], "doctor@example.com")

    def test_refresh_rejects_access_token(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(AuthError, "Refresh token is required."):
            self.service.refresh(refresh_token=registered["access_token"])

    def test_logout_revokes_session_for_current_access_token(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        self.service.logout(token=registered["access_token"])

        with self.assertRaisesRegex(AuthError, "Session has been revoked."):
            self.service.current_user(registered["access_token"])

        with self.assertRaisesRegex(AuthError, "Session has been revoked."):
            self.service.refresh(refresh_token=registered["refresh_token"])

    def test_request_password_reset_returns_token_without_email_sender(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        result = self.service.request_password_reset(email="doctor@example.com")

        self.assertEqual(
            result["detail"],
            "If that email exists, a password reset token has been issued.",
        )
        self.assertIsNotNone(result["reset_token"])
        self.assertIsNotNone(result["expires_at"])

    def test_request_password_reset_sends_email_when_sender_is_configured(self):
        sender = FakePasswordResetEmailSender()
        self.service.password_reset_email_sender = sender
        self.service.password_reset_url_base = "http://localhost:5173/reset-password"
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        result = self.service.request_password_reset(email="doctor@example.com")

        self.assertEqual(
            result["detail"],
            "If that email exists, a password reset link has been sent.",
        )
        self.assertIsNone(result["reset_token"])
        self.assertEqual(sender.sent[0]["recipient_email"], "doctor@example.com")
        self.assertIn("http://localhost:5173/reset-password?token=", sender.sent[0]["reset_url"])

    def test_request_password_reset_hides_unknown_email(self):
        result = self.service.request_password_reset(email="missing@example.com")

        self.assertEqual(
            result["detail"],
            "If that email exists, a password reset token has been issued.",
        )
        self.assertIsNone(result["reset_token"])
        self.assertIsNone(result["expires_at"])

    def test_reset_password_updates_hash_and_revokes_existing_sessions(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )
        reset_request = self.service.request_password_reset(email="doctor@example.com")

        result = self.service.reset_password(
            token=reset_request["reset_token"],
            new_password="newsecretpass",
        )

        self.assertEqual(result["detail"], "Password has been reset successfully.")
        with self.assertRaisesRegex(AuthError, "Session has been revoked."):
            self.service.current_user(registered["access_token"])
        relogin = self.service.login(email="doctor@example.com", password="newsecretpass")
        self.assertIn("access_token", relogin)

    def test_reset_password_rejects_reused_token(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )
        reset_request = self.service.request_password_reset(email="doctor@example.com")
        self.service.reset_password(
            token=reset_request["reset_token"],
            new_password="newsecretpass",
        )

        with self.assertRaisesRegex(ValueError, "already been used"):
            self.service.reset_password(
                token=reset_request["reset_token"],
                new_password="anotherpass",
            )

    def test_require_admin_rejects_non_admin_user(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(AuthError, "Admin access is required"):
            self.service.require_admin(registered["access_token"])

    def test_seed_admin_creates_admin_when_missing(self):
        result = self.service.seed_admin(
            email="admin@example.com",
            password="secretpass",
            full_name="Admin User",
        )

        self.assertEqual(result["email"], "admin@example.com")
        self.assertEqual(result["role"], "admin")

    def test_seed_admin_rejects_existing_non_admin_user(self):
        self.service.register_doctor(
            email="admin@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(ValueError, "Refusing to promote automatically"):
            self.service.seed_admin(
                email="admin@example.com",
                password="secretpass",
                full_name=None,
            )


class PasswordHasherTests(unittest.TestCase):
    def test_hash_and_verify_password_round_trip(self):
        hasher = PasswordHasher()
        stored_hash = hasher.hash_password("secretpass")

        self.assertTrue(hasher.verify_password("secretpass", stored_hash))
        self.assertFalse(hasher.verify_password("wrongpass", stored_hash))

    def test_hash_password_rejects_short_passwords(self):
        hasher = PasswordHasher()

        with self.assertRaisesRegex(ValueError, "at least 8 characters"):
            hasher.hash_password("short")


class TokenServiceTests(unittest.TestCase):
    def test_issue_and_parse_token_round_trip(self):
        service = TokenService("test-secret", ttl_seconds=3600, refresh_ttl_seconds=7200)
        token = service.issue_access_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": "Doctor One",
                "role": "doctor",
            },
            session_id="session-1",
        )

        user = service.parse_token(token)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(user.email, "doctor@example.com")
        self.assertEqual(user.role, "doctor")
        self.assertEqual(user.session_id, "session-1")
        self.assertEqual(user.token_type, "access")

    def test_parse_token_rejects_invalid_signature(self):
        service = TokenService("test-secret", ttl_seconds=3600, refresh_ttl_seconds=7200)
        token = service.issue_access_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": None,
                "role": "doctor",
            },
            session_id="session-1",
        )

        bad_token = f"{token.rsplit('.', 1)[0]}.bad-signature"
        with self.assertRaisesRegex(AuthError, "Invalid bearer token signature."):
            service.parse_token(bad_token)

    def test_parse_token_rejects_expired_token(self):
        service = TokenService("test-secret", ttl_seconds=-1, refresh_ttl_seconds=7200)
        token = service.issue_access_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": None,
                "role": "doctor",
            },
            session_id="session-1",
        )

        with self.assertRaisesRegex(AuthError, "Bearer token has expired."):
            service.parse_token(token)


if __name__ == "__main__":
    unittest.main()
