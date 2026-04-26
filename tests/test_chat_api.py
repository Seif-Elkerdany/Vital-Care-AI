import unittest
from datetime import datetime, timezone
from uuid import uuid4

from backend_api.db.services import ChatService


class ChatServiceSerializationTests(unittest.TestCase):
    def setUp(self):
        self.service = object.__new__(ChatService)

    def test_public_thread_serializes_uuid_fields_to_strings(self):
        thread = {
            "id": uuid4(),
            "user_id": uuid4(),
            "title": "Thread title",
            "summary": "Thread summary",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "deleted_at": None,
        }

        result = self.service._public_thread(thread)

        self.assertIsInstance(result["id"], str)
        self.assertIsInstance(result["user_id"], str)
        self.assertEqual(result["title"], "Thread title")

    def test_public_message_serializes_uuid_fields_to_strings(self):
        message = {
            "id": uuid4(),
            "thread_id": uuid4(),
            "role": "user",
            "content": "Hello",
            "created_at": datetime.now(timezone.utc),
        }

        result = self.service._public_message(message)

        self.assertIsInstance(result["id"], str)
        self.assertIsInstance(result["thread_id"], str)
        self.assertEqual(result["role"], "user")
        self.assertEqual(result["content"], "Hello")


if __name__ == "__main__":
    unittest.main()
