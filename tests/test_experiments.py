import pytest

from server.domain import Repair, fingerprint
from server.engine import Engine
from server.simulation import sweep
from server.workload import rehearse


@pytest.fixture
def core(tmp_path):
    engine = Engine(tmp_path)
    engine.start()
    yield engine
    engine.graph.close()


@pytest.mark.parametrize("repair,status", [("rollback", 409), ("bypass", 200), ("cache", 200)])
def test_request_traces_capture_actual_payloads_and_parent_timing(core, repair, status):
    trial = rehearse(core.service, core.graph.context(), Repair(repair))
    baseline = trial["trace"]["before"]
    assert len(baseline) == 5
    assert len(trial["trace"]["after"]) == 3
    upstream = next(span for span in baseline if span["id"] == "resolve:alder")
    parent = next(span for span in baseline if span["id"] == upstream["parent_id"])
    assert upstream["request"] == {"account": "alder"}
    assert upstream["status"] == 422
    assert upstream["response"]["detail"][0]["loc"] == ["body", "account_id"]
    assert parent["status"] == 502
    assert parent["response"] == trial["before"]["alder"]["body"]
    assert parent["start_ms"] <= upstream["start_ms"]
    assert parent["start_ms"] + parent["duration_ms"] >= upstream["start_ms"] + upstream["duration_ms"] - .002
    for span in trial["trace"]["after"]:
        assert span["status"] == status
        assert span["response"] == trial["exports"][span["customer"]]["body"]
        assert span["parent_id"] is None
    assert core.service.read()["mutation_count"] == 0


def test_boundary_suite_executes_consistent_cases_without_granting_authority(core):
    original_state = fingerprint(core.service.read())
    original_context = core.graph.context()["fingerprint"]
    report = sweep(core, 900)
    assert report["summary"]["scenarios"] == 12
    assert report["summary"]["trials"] == 36
    assert report["summary"]["checks"] == sum(len(t["checks"]) for c in report["cases"] for t in c["trials"])
    for case in report["cases"]:
        assert case["context_hash"] == original_context
        assert case["created_at"] == report["created_at"]
        age = case["assumptions"]["cache_age"]
        provenance = case["assumptions"]["requires_provenance"]
        assert ("cache" in case["eligible"]) == (age <= 900)
        assert ("bypass" in case["eligible"]) == (not provenance)
        assert "rollback" not in case["eligible"]
        assert all(t["hypothetical"] and t["trace"]["before"] for t in case["trials"])
    assert report["summary"]["eligible"] == {"rollback": 0, "bypass": 6, "cache": 8}
    assert core.graph.context()["fingerprint"] == original_context
    assert fingerprint(core.service.read()) == original_state
    assert core.journal.all("run") == []
    assert core.service.receipts() == []


def test_boundary_endpoint_requires_session_and_bounds_inputs(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from server.api import create_app

    monkeypatch.delenv("BACKBOARD_API_KEY", raising=False)
    app = create_app(Engine(tmp_path))
    # Exercise validation independently; rate-limit behavior has its own tests.
    monkeypatch.setattr(app.state.limits, "check", lambda *args: 0)
    with TestClient(app) as client:
        headers = {"X-Rehearsal-Request": "1"}
        assert client.post("/api/simulations/sweep", json={"cache_max_age": 900}, headers=headers).status_code == 401
        client.post("/api/session", json={"person": "nia"}, headers=headers)
        for invalid in (True, -1, 86401, "900"):
            assert client.post("/api/simulations/sweep", json={"cache_max_age": invalid}, headers=headers).status_code == 422
        result = client.post("/api/simulations/sweep", json={"cache_max_age": 0}, headers=headers)
        assert result.status_code == 200
        report = result.json()
        assert report["ages"] == [0, 1, 720]
        assert report["summary"]["scenarios"] == 6
