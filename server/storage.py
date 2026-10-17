"""Local journal and working export service. Configuration and receipts commit together."""

import json
import sqlite3
import time
from pathlib import Path

from .domain import Problem, fingerprint


class Journal:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT PRIMARY KEY, body TEXT NOT NULL)"
            )

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def put(self, kind, record):
        with self.connect() as db:
            db.execute(
                "INSERT INTO records VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                (kind, record["id"], json.dumps(record)),
            )
        return record

    def get(self, kind, id):
        with self.connect() as db:
            row = db.execute(
                "SELECT body FROM records WHERE kind=? AND id=?", (kind, id)
            ).fetchone()
        if not row:
            raise Problem("not_found", "That record could not be found.", 404)
        return json.loads(row[0])

    def all(self, kind):
        with self.connect() as db:
            rows = db.execute(
                "SELECT body FROM records WHERE kind=? ORDER BY rowid DESC", (kind,)
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def clear(self):
        with self.connect() as db:
            db.execute("DELETE FROM records")


class ExportDatabase:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS runtime (id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY,body TEXT NOT NULL)"
            )
            if not db.execute("SELECT id FROM runtime").fetchone():
                db.execute(
                    "INSERT INTO runtime VALUES(1,?)", (json.dumps(self.initial()),)
                )

    @staticmethod
    def initial():
        return {
            "revision": 1,
            "worker_version": 2,
            "schema_version": 2,
            "mutation_count": 0,
            "accounts": {
                key: {
                    "tier": tier,
                    "amount_cents": amount,
                    "currency": "CAD",
                    "mode": "live",
                    "provenance": f"verified-{key}-001",
                }
                for key, tier, amount in [
                    ("alder", "rich", 42500),
                    ("beacon", "rich", 78000),
                    ("cedar", "basic", 12500),
                ]
            },
            "cache": {
                "timestamp": time.time() - 720,
                "records": {key: f"verified-{key}-001" for key in ["alder", "beacon"]},
            },
        }

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def read(self):
        with self.connect() as db:
            return json.loads(
                db.execute("SELECT body FROM runtime WHERE id=1").fetchone()[0]
            )

    def write(self, state):
        with self.connect() as db:
            db.execute("UPDATE runtime SET body=? WHERE id=1", (json.dumps(state),))

    def reset(self):
        with self.connect() as db:
            db.execute(
                "UPDATE runtime SET body=? WHERE id=1", (json.dumps(self.initial()),)
            )
            db.execute("DELETE FROM receipts")

    def clone(self, destination):
        with self.connect() as source, sqlite3.connect(destination) as target:
            source.backup(target)
        return ExportDatabase(destination)

    @staticmethod
    def changed(state, repair, affected):
        result = json.loads(json.dumps(state))
        if repair == "rollback":
            result["worker_version"] = 1
        else:
            for customer in affected:
                result["accounts"][customer]["mode"] = repair
        return result

    def receipt(self, run_id):
        with self.connect() as db:
            row = db.execute(
                "SELECT body FROM receipts WHERE id=?", (run_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def receipts(self):
        with self.connect() as db:
            return [
                json.loads(r[0])
                for r in db.execute("SELECT body FROM receipts ORDER BY rowid DESC")
            ]

    def apply(self, run_id, expected_hash, repair, affected, receipt):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute(
                "SELECT body FROM receipts WHERE id=?", (run_id,)
            ).fetchone()
            if previous:
                return json.loads(previous[0])
            state = json.loads(
                db.execute("SELECT body FROM runtime WHERE id=1").fetchone()[0]
            )
            if fingerprint(state) != expected_hash:
                raise Problem(
                    "runtime_changed",
                    "The export service changed. Run a new rehearsal.",
                )
            updated = self.changed(state, repair, affected)
            updated["revision"] += 1
            updated["mutation_count"] += 1
            receipt.update(
                runtime_revision=updated["revision"], verified=False, graph_synced=False
            )
            db.execute("UPDATE runtime SET body=? WHERE id=1", (json.dumps(updated),))
            db.execute(
                "INSERT INTO receipts VALUES(?,?)", (run_id, json.dumps(receipt))
            )
        return receipt

    def update_receipt(self, receipt):
        with self.connect() as db:
            db.execute(
                "UPDATE receipts SET body=? WHERE id=?",
                (json.dumps(receipt), receipt["run_id"]),
            )
