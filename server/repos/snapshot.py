"""Untrusted archives are data. Never extract them or execute repository code here."""

import hashlib
import io
import json
import re
import stat
import zipfile
from pathlib import PurePosixPath

from ..domain import Problem

MAX_ARCHIVE = 12 * 1024 * 1024
MAX_EXPANDED = 24 * 1024 * 1024
MAX_FILES = 1800
MAX_FILE = 512 * 1024
CODE_SUFFIXES = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", "coverage", ".terraform"}
SECRET_NAMES = {".npmrc", ".pypirc", "credentials", "id_rsa", "id_ed25519", "id_ecdsa", ".netrc"}
SECRET = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})")


def safe_path(path):
    if not isinstance(path, str) or not path or len(path) > 500 or "\\" in path or any(ord(c) < 32 for c in path):
        raise Problem("unsafe_path", "The repository contains an unsafe file path.", 422)
    parts = path.split("/")
    if path.startswith("/") or any(p in {"", ".", ".."} for p in parts) or ":" in parts[0]:
        raise Problem("unsafe_path", "Repository paths must stay inside the snapshot.", 422)
    return path


def excluded(path):
    parts = PurePosixPath(path).parts
    name = parts[-1].lower()
    return (bool(set(parts) & SKIP_DIRS) or name in SECRET_NAMES
            or (name.startswith(".env") and name not in {".env.example", ".env.sample", ".env.template"})
            or name.endswith((".pem", ".p12", ".pfx", ".key", ".sqlite", ".db", ".rdb")))


def unpack_archive(data, *, strip_root=True):
    if len(data) > MAX_ARCHIVE:
        raise Problem("archive_limit", "The compressed repository must be smaller than 12 MB.", 413)
    files, skipped, expanded = {}, [], 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_FILES * 2:
                raise Problem("file_limit", "This repository has too many entries. Upload a smaller project directory.", 413)
            roots = {i.filename.split("/")[0] for i in entries}
            prefix = next(iter(roots)) + "/" if strip_root and len(roots) == 1 and any("/" in i.filename for i in entries) else ""
            for entry in entries:
                full = entry.filename.rstrip("/")
                safe_path(full)
                mode = entry.external_attr >> 16
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR}):
                    raise Problem("archive_link", "Archive links and special files are unsupported. Upload ordinary files.", 422)
                if entry.is_dir():
                    continue
                name = entry.filename[len(prefix):] if prefix and entry.filename.startswith(prefix) else entry.filename
                safe_path(name)
                expanded += entry.file_size
                if expanded > MAX_EXPANDED or len(files) >= MAX_FILES:
                    raise Problem("repository_limit", "Use a project with at most 1,800 files and 24 MB of uncompressed content.", 413)
                if excluded(name) or entry.file_size > MAX_FILE:
                    skipped.append(name)
                    continue
                content = archive.read(entry)
                if len(content) > MAX_FILE:
                    raise Problem("file_limit", "An archive file exceeded its declared size.", 413)
                try:
                    text = content.decode("utf-8")
                except UnicodeDecodeError:
                    skipped.append(name)
                    continue
                if "\x00" in text or SECRET.search(text):
                    skipped.append(name)
                    continue
                if name in files:
                    raise Problem("duplicate_path", "The archive has duplicate file paths.", 422)
                files[name] = text
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, UnicodeError) as error:
        raise Problem("invalid_archive", "Upload an unencrypted ZIP containing ordinary project files.", 422) from error
    if not files:
        raise Problem("empty_repository", "No supported text files were found in the repository.", 422)
    return files, skipped


def digest(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def is_test(path):
    p = PurePosixPath(path)
    return (bool(set(p.parts) & {"tests", "test", "__tests__", "spec", "specs"})
            or p.name.startswith("test_") or bool(re.search(r"(?:[._](?:test|spec)|_test)\.", p.name)))


def editable(path):
    return (PurePosixPath(path).suffix in CODE_SUFFIXES and not is_test(path)
            and not any(p.startswith(".") for p in PurePosixPath(path).parts)
            and PurePosixPath(path).name not in {"setup.py", "conftest.py", "vite.config.ts", "vitest.config.ts", "jest.config.js", "eslint.config.js"}
            and not re.search(r"(?:^|/)(?:[^/]+\.)?config\.(?:js|ts|mjs|cjs)$", path)
            and not excluded(path))


def detect_project(files, directory=""):
    if directory:
        safe_path(directory)
    prefix = directory + "/" if directory else ""
    local = {p[len(prefix):]: c for p, c in files.items() if p.startswith(prefix)}
    if not local:
        raise Problem("project_directory", "That project directory is not in the repository.", 422)
    if "package.json" in local:
        try:
            package = json.loads(local["package.json"])
        except (ValueError, TypeError):
            raise Problem("invalid_manifest", "The package.json file is invalid.", 422)
        if not isinstance(package, dict) or not isinstance(package.get("scripts", {}), dict):
            raise Problem("invalid_manifest", "package.json and its scripts field must be JSON objects.", 422)
        scripts = package.get("scripts", {})
        setup = "npm ci --ignore-scripts" if "package-lock.json" in local else "npm install --ignore-scripts"
        if not package.get("dependencies") and not package.get("devDependencies"):
            setup = ""
        test = "npm test" if "test" in scripts else "node --test"
        return {"runtime": "node", "directory": directory, "setup_command": setup, "test_command": test}
    if any(p.endswith(".py") for p in local):
        setup = "python -m pip install -r requirements.txt" if "requirements.txt" in local else ""
        if "pyproject.toml" in local and not setup:
            setup = "python -m pip install -e '.[test]'"
        pytest_used = any("pytest" in c for p, c in local.items() if is_test(p) or p in {"pyproject.toml", "requirements.txt", "pytest.ini"})
        return {"runtime": "python", "directory": directory, "setup_command": setup,
                "test_command": "python -m pytest -q" if pytest_used else "python -m unittest discover -s tests -v"}
    raise Problem("unsupported_runtime", "Choose a Python or Node.js/TypeScript project directory for this version.", 422)


def public_project(project):
    return {k: v for k, v in project.items() if k not in {"files", "user_id", "graph_name"}}
