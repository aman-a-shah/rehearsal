"""Durable tenant records, hashed sessions, encrypted GitHub credentials, atomic quotas."""

import hashlib
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from ..domain import Problem
from ..security import positive_int


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "repositories.sqlite"
        key = os.getenv("REHEARSAL_SESSION_KEY", "")
        if not key:
            if os.getenv("REHEARSAL_PUBLIC") == "1":
                self.cipher = None
            else:
                keypath = self.directory / "session.key"
                if not keypath.exists():
                    try:
                        fd = os.open(keypath, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        with os.fdopen(fd, "wb") as f:
                            f.write(Fernet.generate_key())
                    except FileExistsError:
                        pass
                key = keypath.read_text().strip()
        if key:
            self.cipher = Fernet(key.encode())
        with self.connect() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS records(kind TEXT, id TEXT, user_id TEXT NOT NULL, payload TEXT NOT NULL, at REAL NOT NULL, PRIMARY KEY(kind,id));
            CREATE INDEX IF NOT EXISTS records_user ON records(user_id,kind,at);
            CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS oauth(hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS repo_usage(kind TEXT, identity TEXT, at REAL);
            CREATE INDEX IF NOT EXISTS repo_usage_window ON repo_usage(kind,identity,at);
            """)
        for path in (self.path, Path(str(self.path) + "-wal"), Path(str(self.path) + "-shm")):
            if path.exists():
                os.chmod(path, 0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    def put(self, kind, record):
        if kind == "project":
            return self.put_project(record)
        with self.connect() as db:
            db.execute("INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,at=excluded.at",
                       (kind, record["id"], record["user_id"], json.dumps(record), time.time()))

    def put_project(self, record):
        encoded = json.dumps(record)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            size = db.execute("SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) FROM records WHERE kind='project'").fetchone()[0]
            own = db.execute("SELECT count(*) FROM records WHERE kind='project' AND user_id=?", (record["user_id"],)).fetchone()[0]
            if size + len(encoded.encode()) > 128 * 1024 * 1024 or own >= 8:
                raise Problem("storage_limit", "Repository storage is full. Delete an unused repository before importing another.", 429)
            db.execute("INSERT INTO records VALUES('project',?,?,?,?)", (record["id"], record["user_id"], encoded, time.time()))

    def get(self, kind, id, user_id=None):
        with self.connect() as db:
            row = db.execute("SELECT payload,user_id FROM records WHERE kind=? AND id=?", (kind, id)).fetchone()
        if not row or (user_id is not None and row["user_id"] != user_id):
            raise Problem("not_found", "This record is not available in your workspace.", 404)
        return json.loads(row["payload"])

    def all(self, kind, user_id=None):
        with self.connect() as db:
            rows = db.execute("SELECT payload FROM records WHERE kind=?" + (" AND user_id=?" if user_id is not None else "") + " ORDER BY at DESC",
                              (kind, user_id) if user_id is not None else (kind,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def delete_project(self, id, user_id):
        self.get("project", id, user_id)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM records WHERE kind='run' AND user_id=? AND json_extract(payload,'$.project_id')=?", (user_id, id))
            db.execute("DELETE FROM records WHERE kind='project' AND id=? AND user_id=?", (id, user_id))

    def encrypt(self, value):
        if not self.cipher:
            raise Problem("auth_configuration", "The server needs REHEARSAL_SESSION_KEY before GitHub sign-in can be enabled.", 503)
        return self.cipher.encrypt(value.encode()).decode()

    def decrypt(self, value):
        try:
            return self.cipher.decrypt(value.encode()).decode()
        except (InvalidToken, AttributeError):
            raise Problem("session_expired", "Reconnect GitHub to continue.", 401)

    def session(self, user_id):
        token = secrets.token_urlsafe(40)
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time() + 86400 * 7))
        return token

    def user(self, token):
        with self.connect() as db:
            row = db.execute("SELECT user_id FROM sessions WHERE hash=? AND expires>?", (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
        if not row:
            raise Problem("sign_in", "Start a workspace or sign in with GitHub to continue.", 401)
        return self.get("user", row[0])

    def logout(self, token):
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE hash=?", (hashlib.sha256(token.encode()).hexdigest(),))

    def oauth_start(self, payload):
        state = secrets.token_urlsafe(40)
        with self.connect() as db:
            db.execute("DELETE FROM oauth WHERE expires<?", (time.time(),))
            db.execute("INSERT INTO oauth VALUES(?,?,?)", (hashlib.sha256(state.encode()).hexdigest(), self.encrypt(json.dumps(payload)), time.time() + 600))
        return state

    def oauth_consume(self, state):
        hashed = hashlib.sha256(state.encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM oauth WHERE hash=? AND expires>?", (hashed, time.time())).fetchone()
            db.execute("DELETE FROM oauth WHERE hash=?", (hashed,))
        if not row:
            raise Problem("oauth_state", "The GitHub sign-in expired. Please start again.", 400)
        return json.loads(self.decrypt(row[0]))

    def reserve(self, kind, identity, limit, window=86400):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._reserve(db, kind, identity, limit, window)

    def _reserve(self, db, kind, identity, limit, window=86400):
        now = time.time()
        db.execute("DELETE FROM repo_usage WHERE at<?", (now - 86400 * 2,))
        count = db.execute("SELECT count(*) FROM repo_usage WHERE kind=? AND identity=? AND at>?", (kind, identity, now - window)).fetchone()[0]
        if count >= limit:
            raise Problem("repository_quota", "This workspace's usage allowance is exhausted. Try again after the rolling quota resets.", 429)
        db.execute("INSERT INTO repo_usage VALUES(?,?,?)", (kind, identity, now))

    def enqueue(self, run, user, peer):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            active = db.execute("SELECT count(*) FROM records WHERE kind='run' AND json_extract(payload,'$.status') IN ('queued','running')").fetchone()[0]
            own = db.execute("SELECT count(*) FROM records WHERE kind='run' AND user_id=? AND json_extract(payload,'$.status') IN ('queued','running')", (user["id"],)).fetchone()[0]
            if own or active >= 4:
                raise Problem("run_busy", "A rehearsal is already running. Wait for it to finish before starting another.", 409)
            self._reserve(db, "run", "global", positive_int("REHEARSAL_REPO_RUNS_PER_DAY", 12))
            self._reserve(db, "run-hour", "global", positive_int("REHEARSAL_REPO_RUNS_PER_HOUR", 4), 3600)
            self._reserve(db, "run-user", user["id"], 3 if user.get("github_id") else positive_int("REHEARSAL_REPO_GUEST_RUNS_PER_DAY", 1))
            self._reserve(db, "run-peer", peer, positive_int("REHEARSAL_REPO_PEER_RUNS_PER_DAY", 4))
            db.execute("INSERT INTO records VALUES('run',?,?,?,?)", (run["id"], user["id"], json.dumps(run), time.time()))

    def claim_run(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM records WHERE kind='run' AND json_extract(payload,'$.status')='queued' ORDER BY at LIMIT 1").fetchone()
            if not row:
                return None
            run = json.loads(row[0])
            run.update(status="running", started_at=time.time())
            db.execute("UPDATE records SET payload=? WHERE kind='run' AND id=?", (json.dumps(run), run["id"]))
            return run

    def allowance(self, user, peer):
        now = time.time()
        constraints = [("run", "global", positive_int("REHEARSAL_REPO_RUNS_PER_DAY", 12), 86400),
                       ("run-hour", "global", positive_int("REHEARSAL_REPO_RUNS_PER_HOUR", 4), 3600),
                       ("run-user", user["id"], 3 if user.get("github_id") else positive_int("REHEARSAL_REPO_GUEST_RUNS_PER_DAY", 1), 86400),
                       ("run-peer", peer, positive_int("REHEARSAL_REPO_PEER_RUNS_PER_DAY", 4), 86400)]
        remaining, resets = [], []
        with self.connect() as db:
            for kind, identity, limit, window in constraints:
                used, first = db.execute("SELECT count(*),min(at) FROM repo_usage WHERE kind=? AND identity=? AND at>?", (kind, identity, now - window)).fetchone()
                remaining.append(max(0, limit - used))
                if used >= limit:
                    resets.append(first + window)
        return {"remaining": min(remaining), "available_after": max(resets) if resets else None}
