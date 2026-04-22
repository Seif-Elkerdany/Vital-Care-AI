from __future__ import annotations

from pathlib import Path

from .config import get_database_settings
from .connection import Database


MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def apply_migrations(database: Database) -> list[str]:
    applied_names: list[str] = []
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    with database.transaction() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )

    with database.connect() as connection:
        applied = {
            row["name"]
            for row in connection.execute("SELECT name FROM schema_migrations").fetchall()
        }

        for migration_file in migration_files:
            if migration_file.name in applied:
                continue
            sql = migration_file.read_text(encoding="utf-8")
            with connection.transaction():
                connection.execute(sql)
                connection.execute(
                    "INSERT INTO schema_migrations (name) VALUES (%s)",
                    (migration_file.name,),
                )
            applied_names.append(migration_file.name)

    return applied_names


def main() -> None:
    settings = get_database_settings(required=True)
    database = Database(settings)
    applied = apply_migrations(database)
    if not applied:
        print("No pending migrations.")
        return

    print("Applied migrations:")
    for name in applied:
        print(f"- {name}")


if __name__ == "__main__":
    main()
