from __future__ import annotations

from contextlib import contextmanager

from .config import DatabaseSettings


class Database:
    def __init__(self, settings: DatabaseSettings) -> None:
        self.settings = settings

    @contextmanager
    def connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except Exception as exc:
            raise RuntimeError(
                "PostgreSQL support requires the `psycopg` package. Install backend dependencies first."
            ) from exc

        connection = psycopg.connect(self.settings.database_url, row_factory=dict_row)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @contextmanager
    def transaction(self):
        with self.connect() as connection:
            with connection.transaction():
                yield connection

    def ping(self) -> None:
        with self.connect() as connection:
            connection.execute("SELECT 1")
