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


class AuthServiceTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.users = FakeUsers()
        self.password_hasher = PasswordHasher()
        self.token_service = TokenService("test-secret", ttl_seconds=3600)
        self.service = AuthService(
            self.database,
            users=self.users,
            password_hasher=self.password_hasher,
            token_service=self.token_service,
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

    def test_login_rejects_wrong_password(self):
        self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name=None,
        )

        with self.assertRaisesRegex(AuthError, "Invalid email or password."):
            self.service.login(email="doctor@example.com", password="wrongpass")

    def test_current_user_resolves_user_from_token(self):
        registered = self.service.register_doctor(
            email="doctor@example.com",
            password="secretpass",
            full_name="Doctor One",
        )

        current = self.service.current_user(registered["access_token"])

        self.assertEqual(current["email"], "doctor@example.com")
        self.assertEqual(current["role"], "doctor")

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
        service = TokenService("test-secret", ttl_seconds=3600)
        token = service.issue_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": "Doctor One",
                "role": "doctor",
            }
        )

        user = service.parse_token(token)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(user.email, "doctor@example.com")
        self.assertEqual(user.role, "doctor")

    def test_parse_token_rejects_invalid_signature(self):
        service = TokenService("test-secret", ttl_seconds=3600)
        token = service.issue_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": None,
                "role": "doctor",
            }
        )

        bad_token = f"{token.rsplit('.', 1)[0]}.bad-signature"
        with self.assertRaisesRegex(AuthError, "Invalid bearer token signature."):
            service.parse_token(bad_token)

    def test_parse_token_rejects_expired_token(self):
        service = TokenService("test-secret", ttl_seconds=-1)
        token = service.issue_token(
            {
                "id": "user-1",
                "email": "doctor@example.com",
                "full_name": None,
                "role": "doctor",
            }
        )

        with self.assertRaisesRegex(AuthError, "Bearer token has expired."):
            service.parse_token(token)


if __name__ == "__main__":
    unittest.main()
