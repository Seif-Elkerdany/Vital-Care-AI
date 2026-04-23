import types
import unittest

try:
    from fastapi.testclient import TestClient
    from backend_api.STT.api import create_app as create_stt_app
except Exception:
    TestClient = None
    create_stt_app = None


@unittest.skipIf(
    TestClient is None or create_stt_app is None,
    "FastAPI test client unavailable",
)
class AuthApiTests(unittest.TestCase):
    class FakeSTTService:
        def start_hotkey_listener(self):
            return None

        def stop_hotkey_listener(self):
            return None

        def latest(self):
            return None

        def status(self):
            return types.SimpleNamespace(
                recording=False,
                transcribing=False,
                last_event="idle",
                last_error=None,
                latest_text=None,
            )

        def toggle_recording(self):
            return "idle"

        def list_items(self, limit=20):
            del limit
            return []

        def process_text_input(self, text):
            del text
            raise NotImplementedError

        def generate_steps(self, text):
            del text
            raise RuntimeError("not configured")

        def latest_response_audio(self):
            return None

        def latest_response_audio_mp3(self):
            return None

    class FakeAuthService:
        def __init__(self):
            self.current_user_calls = []
            self.login_calls = []
            self.register_calls = []
            self.refresh_calls = []
            self.logout_calls = []
            self.password_reset_request_calls = []
            self.password_reset_confirm_calls = []
            self.valid_tokens = {
                "doctor-token": {
                    "id": "doctor-1",
                    "email": "doctor@example.com",
                    "full_name": "Doctor One",
                    "role": "doctor",
                    "created_at": None,
                    "updated_at": None,
                },
                "admin-token": {
                    "id": "admin-1",
                    "email": "admin@example.com",
                    "full_name": "Admin User",
                    "role": "admin",
                    "created_at": None,
                    "updated_at": None,
                },
            }

        def register_doctor(self, *, email, password, full_name):
            self.register_calls.append((email, password, full_name))
            return {
                "access_token": "doctor-token",
                "refresh_token": "doctor-refresh-token",
                "token_type": "bearer",
                "user": {
                    "id": "doctor-1",
                    "email": email,
                    "full_name": full_name,
                    "role": "doctor",
                    "created_at": None,
                    "updated_at": None,
                },
            }

        def login(self, *, email, password):
            self.login_calls.append((email, password))
            if email == "doctor@example.com" and password == "secretpass":
                return {
                    "access_token": "doctor-token",
                    "refresh_token": "doctor-refresh-token",
                    "token_type": "bearer",
                    "user": dict(self.valid_tokens["doctor-token"]),
                }
            raise self._auth_error("Invalid email or password.")

        def refresh(self, *, refresh_token):
            self.refresh_calls.append(refresh_token)
            if refresh_token != "doctor-refresh-token":
                raise self._auth_error("Refresh token is invalid.")
            return {
                "access_token": "doctor-token-2",
                "refresh_token": "doctor-refresh-token-2",
                "token_type": "bearer",
                "user": dict(self.valid_tokens["doctor-token"]),
            }

        def current_user(self, token):
            self.current_user_calls.append(token)
            user = self.valid_tokens.get(token)
            if user is None:
                raise self._auth_error("Invalid bearer token signature.")
            return dict(user)

        def logout(self, *, token):
            self.logout_calls.append(token)
            if token == "revoked-token":
                raise self._auth_error("Session has been revoked.")

        def request_password_reset(self, *, email):
            self.password_reset_request_calls.append(email)
            return {
                "detail": "If that email exists, a password reset link has been sent.",
                "reset_token": None,
                "expires_at": "2026-04-21T13:00:00Z",
            }

        def reset_password(self, *, token, new_password):
            self.password_reset_confirm_calls.append((token, new_password))
            if token != "reset-token-1":
                raise ValueError("Password reset token is invalid.")
            return {"detail": "Password has been reset successfully."}

        @staticmethod
        def _auth_error(message):
            from backend_api.db.security import AuthError

            return AuthError(message)

    class FakeInvitationService:
        def __init__(self):
            self.accept_calls = []
            self.create_calls = []

        def accept_invitation(self, *, token, email, password, full_name):
            self.accept_calls.append((token, email, password, full_name))
            if token != "invite-token":
                raise ValueError("Invitation token is invalid.")
            return {
                "id": "admin-2",
                "email": email,
                "full_name": full_name,
                "role": "admin",
            }

        def create_invitation(self, *, admin_user_id, email, expires_in_hours):
            self.create_calls.append((admin_user_id, email, expires_in_hours))
            return {
                "invitation_id": "invite-1",
                "email": email,
                "expires_at": "2026-04-24T12:00:00Z",
                "created_at": "2026-04-21T12:00:00Z",
                "invitation_token": "invite-token",
            }

    class FakeChatService:
        def create_thread(self, *, user_id, title, summary):
            return {
                "id": "thread-1",
                "user_id": user_id,
                "title": title,
                "summary": summary,
                "created_at": "2026-04-21T12:00:00Z",
                "updated_at": "2026-04-21T12:00:00Z",
                "deleted_at": None,
            }

        def list_threads(self, *, user_id):
            del user_id
            return []

        def list_messages(self, *, user_id, thread_id):
            del user_id, thread_id
            return []

        def run_rag_turn(self, *, user_id, thread_id, content):
            del user_id, thread_id, content
            raise NotImplementedError

    def make_client(self):
        self.auth_service = self.FakeAuthService()
        self.invitation_service = self.FakeInvitationService()
        self.chat_service = self.FakeChatService()
        app = create_stt_app(
            self.FakeSTTService(),
            auth_service=self.auth_service,
            invitation_service=self.invitation_service,
            chat_service=self.chat_service,
        )
        return TestClient(app)

    def test_login_returns_bearer_token_and_user_payload(self):
        client = self.make_client()

        response = client.post(
            "/auth/login",
            json={"email": "doctor@example.com", "password": "secretpass"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["access_token"], "doctor-token")
        self.assertEqual(payload["refresh_token"], "doctor-refresh-token")
        self.assertEqual(payload["token_type"], "bearer")
        self.assertEqual(payload["user"]["role"], "doctor")
        self.assertEqual(
            self.auth_service.login_calls,
            [("doctor@example.com", "secretpass")],
        )

    def test_login_rejects_invalid_credentials(self):
        client = self.make_client()

        response = client.post(
            "/auth/login",
            json={"email": "doctor@example.com", "password": "wrongpass"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid email or password.")

    def test_me_requires_bearer_token(self):
        client = self.make_client()

        response = client.get("/auth/me")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json()["detail"],
            "Bearer authentication is required.",
        )

    def test_me_returns_authenticated_user_for_valid_token(self):
        client = self.make_client()

        response = client.get(
            "/auth/me",
            headers={"Authorization": "Bearer doctor-token"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["email"], "doctor@example.com")
        self.assertEqual(payload["role"], "doctor")
        self.assertEqual(self.auth_service.current_user_calls[-1], "doctor-token")

    def test_refresh_returns_rotated_tokens(self):
        client = self.make_client()

        response = client.post(
            "/auth/refresh",
            json={"refresh_token": "doctor-refresh-token"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["access_token"], "doctor-token-2")
        self.assertEqual(payload["refresh_token"], "doctor-refresh-token-2")
        self.assertEqual(self.auth_service.refresh_calls, ["doctor-refresh-token"])

    def test_logout_revokes_current_session(self):
        client = self.make_client()

        response = client.post(
            "/auth/logout",
            headers={"Authorization": "Bearer doctor-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["detail"], "Logged out successfully.")
        self.assertEqual(self.auth_service.logout_calls, ["doctor-token"])

    def test_password_reset_request_sends_email_without_exposing_token(self):
        client = self.make_client()

        response = client.post(
            "/auth/password-reset/request",
            json={"email": "doctor@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["detail"], "If that email exists, a password reset link has been sent.")
        self.assertIsNone(payload["reset_token"])
        self.assertEqual(
            self.auth_service.password_reset_request_calls,
            ["doctor@example.com"],
        )

    def test_password_reset_confirm_updates_password(self):
        client = self.make_client()

        response = client.post(
            "/auth/password-reset/confirm",
            json={"token": "reset-token-1", "new_password": "newsecretpass"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["detail"], "Password has been reset successfully.")
        self.assertEqual(
            self.auth_service.password_reset_confirm_calls,
            [("reset-token-1", "newsecretpass")],
        )

    def test_admin_route_forbids_non_admin_users(self):
        client = self.make_client()

        response = client.post(
            "/admin/invitations",
            headers={"Authorization": "Bearer doctor-token"},
            json={"email": "new-admin@example.com", "expires_in_hours": 48},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Admin access is required.")

    def test_admin_route_accepts_admin_users(self):
        client = self.make_client()

        response = client.post(
            "/admin/invitations",
            headers={"Authorization": "Bearer admin-token"},
            json={"email": "new-admin@example.com", "expires_in_hours": 48},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["email"], "new-admin@example.com")
        self.assertEqual(
            self.invitation_service.create_calls,
            [("admin-1", "new-admin@example.com", 48)],
        )

    def test_accept_admin_invitation_logs_in_new_admin(self):
        client = self.make_client()

        response = client.post(
            "/auth/admin-invitations/accept",
            json={
                "token": "invite-token",
                "email": "doctor@example.com",
                "password": "secretpass",
                "full_name": "Doctor One",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["access_token"], "doctor-token")
        self.assertEqual(payload["refresh_token"], "doctor-refresh-token")
        self.assertEqual(
            self.invitation_service.accept_calls,
            [("invite-token", "doctor@example.com", "secretpass", "Doctor One")],
        )
        self.assertEqual(
            self.auth_service.login_calls[-1],
            ("doctor@example.com", "secretpass"),
        )


if __name__ == "__main__":
    unittest.main()
