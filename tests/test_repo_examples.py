"""The substantial demo fixtures must fail for reproducible behavioral reasons."""
import subprocess
import sys
import uuid

import pytest

from server.graph import CompanyGraph
from server.repos.codegraph import CodeGraph, extract
from server.repos.examples import EXAMPLES
from server.repos.patches import test_count as count_tests
from server.repos.snapshot import digest


@pytest.mark.parametrize("name,count,failures", [("python-orders", 46, 9), ("node-events", 37, 8)])
def test_service_examples_have_real_reproducible_failures(tmp_path, name, count, failures):
    example = EXAMPLES[name]
    for path, source in example["files"].items():
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source)
    command = [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"] if example["runtime"] == "python" else ["node", "--test"]
    result = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=30)
    output = result.stdout + result.stderr
    assert result.returncode == 1
    assert count_tests({"output": output}) == count
    assert f"failures={failures}" in output or f"# fail {failures}" in output
    assert "ModuleNotFoundError" not in output and "ERR_MODULE_NOT_FOUND" not in output


@pytest.mark.parametrize("name,root,dependent", [
    ("python-orders", "commerce/discounts.py", "tests/test_refunds.py"),
    ("node-events", "src/domain/order.js", "test/replay.test.js"),
])
def test_service_graph_reaches_root_cause_and_distant_regressions(tmp_path, name, root, dependent):
    example = EXAMPLES[name]
    files = example["files"]
    data = extract(files)
    assert 28 <= len(data["nodes"]) <= 30
    assert len(data["edges"]) >= 30
    connector = CompanyGraph(tmp_path / "graph")
    graph = CodeGraph(connector, {"id": uuid.uuid4().hex, "digest": digest(files), "files": files})
    try:
        graph.build(data)
        context = graph.context(example["incident"], dependent + " AssertionError")
        assert root in context["editable"]
        assert dependent in context["affected_tests"]
        assert all(not path.startswith(("test/", "tests/")) for path in context["editable"])
        assert any("IMPORTS*0..8" in query["query"] for query in context["queries"])
        assert len(context["files"]) >= 20
    finally:
        connector.close()
