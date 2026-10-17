"""Small shared vocabulary. All authority checks live on the server."""

import hashlib
import json
from enum import StrEnum
from typing import Any


class Repair(StrEnum):
    ROLLBACK = "rollback"
    BYPASS = "bypass"
    CACHE = "cache"


REPAIRS = {
    "rollback": {"title": "Roll back the worker", "description": "Return the export service to its previous release."},
    "bypass": {"title": "Bypass enrichment", "description": "Skip the failing dependency and restore the response."},
    "cache": {"title": "Use the verified cache", "description": "Keep the complete export using verified provenance."},
}


class Problem(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
