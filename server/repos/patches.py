"""Exact edits and immutable evidence. Model prose cannot authorize a patch."""

import difflib
from pathlib import PurePosixPath

from ..domain import Problem
from .snapshot import MAX_FILE, SECRET, digest, editable, is_test, safe_path


def apply_edits(files, edits, allowed):
    if not isinstance(edits, list) or not 1 <= len(edits) <= 12:
        raise Problem("patch_size", "A repair must contain 1–12 precise source edits.", 422)
    changed = {}
    for edit in edits:
        if not isinstance(edit, dict):
            raise Problem("patch_format", "The generated patch has an invalid format.", 422)
        path = safe_path(edit.get("path"))
        if path not in files or path not in allowed or not editable(path):
            raise Problem("patch_scope", "The generated patch edits a protected or unconnected file: " + path, 422)
        search, replace = edit.get("search"), edit.get("replace")
        if not isinstance(search, str) or not search or not isinstance(replace, str) or search == replace or len(replace) > 24000:
            raise Problem("patch_format", "The generated patch must contain nonempty, bounded, exact edits.", 422)
        content = changed.get(path, files[path])
        if content.count(search) != 1:
            raise Problem("patch_context", "An edit did not uniquely match the imported source: " + path, 422)
        result = content.replace(search, replace, 1)
        if len(result.encode()) > MAX_FILE or SECRET.search(result):
            raise Problem("patch_content", "The generated patch contains unsupported content.", 422)
        changed[path] = result
    if all(files[p] == c for p, c in changed.items()):
        raise Problem("empty_patch", "The generated patch makes no source changes.", 422)
    return changed


def regression_file(files, proposed, runtime, directory):
    path = safe_path(proposed.get("path"))
    content = proposed.get("content")
    if (path in files or not is_test(path) or any(p.startswith(".") for p in PurePosixPath(path).parts)
        or (directory and not path.startswith(directory + "/"))
        or not isinstance(content, str) or not 1 <= len(content) <= 16000 or SECRET.search(content)
        or (runtime == "python" and not path.endswith(".py"))
        or (runtime == "node" and PurePosixPath(path).suffix not in {".js", ".ts", ".mjs", ".cjs", ".tsx"})):
        raise Problem("regression_scope", "The generated regression must be a new test file inside this project.", 422)
    return {path: content}


def unified_patch(files, changes):
    result = []
    for path, content in sorted(changes.items()):
        before = files.get(path, "")
        # All generated edits use UTF-8 text. Preserve missing final newlines in git-compatible diffs.
        lines = difflib.unified_diff(before.splitlines(keepends=True), content.splitlines(keepends=True),
                                     fromfile="a/" + path if path in files else "/dev/null", tofile="b/" + path)
        chunks = []
        for line in lines:
            chunks.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
        if chunks:
            result.append(f"diff --git a/{path} b/{path}\n" + ("new file mode 100644\n" if path not in files else "") + "".join(chunks))
    return "".join(result)


def review_digest(project, run, candidate):
    return digest({"snapshot": project["digest"], "sha": project.get("sha"), "run_id": run["id"],
                   "test_command": run["test_command"], "setup_command": run["setup_command"], "directory": run["directory"],
                   "changes": candidate["changes"], "trial": candidate.get("trial"), "verification": candidate.get("verification")})


def test_count(result):
    import re
    text = result.get("output", "")
    for pattern in (r"Ran (\d+) tests?", r"(?:#|ℹ) tests (\d+)", r"Tests:\s*[^\n]*?(\d+) total", r"Tests\s+[^\n]*?\((\d+)\)"):
        matches = re.findall(pattern, text)
        if matches:
            return int(matches[-1])
    # pytest summary; using the last matching line avoids counting progress twice.
    for line in reversed(text.splitlines()):
        counts = re.findall(r"\b(\d+) (?:passed|failed|skipped|xfailed|xpassed|errors?)\b", line)
        if counts:
            return sum(map(int, counts))
    return None


def test_passed(result, minimum=1):
    return (result.get("stage") == "test" and result.get("exit_code") == 0 and not result.get("timed_out")
            and (test_count(result) or 0) >= minimum)


def assertion_failure(result):
    """Require recognizable test failures, not missing dependencies, collection errors, or a broken shell."""
    if result.get("stage") != "test" or result.get("exit_code") in {None, 0, 124, 126, 127, 137, 143} or result.get("timed_out"):
        return False
    text = result.get("output", "")
    import re
    return bool(re.search(r"AssertionError|AssertionFailed|ERR_ASSERTION|\bFAIL(?:ED)?\b|\bnot ok\b|\bfailing\b", text))
