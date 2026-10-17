import pytest

from server.domain import Problem
from server.engine import Engine
from server.workload import exports


@pytest.fixture
def engine(tmp_path):
    instance = Engine(tmp_path)
    instance.start()
    yield instance
    instance.graph.close()


def prepare(engine):
    run = engine.create_run("guided")
    engine.tool(run["id"], "inspect_context")
    for repair in ("rollback", "bypass", "cache"):
        engine.tool(run["id"], "rehearse_repair", {"repair": repair})
    engine.tool(run["id"], "recommend_repair", {"repair": "cache", "reason": "Every check passed."})
    return engine.get_run(run["id"])


def test_real_graph_trial_and_durable_action(engine):
    run = prepare(engine)
    assert run["context"]["affected"] == ["alder", "beacon"]
    rollback, bypass, cache = run["trials"]
    assert rollback["scope"] == ["alder", "beacon", "cedar"]
    assert rollback["exports"]["cedar"]["status"] == 409
    assert bypass["exports"]["alder"]["status"] == 200
    assert not bypass["passed"] and "provenance_id" not in bypass["exports"]["alder"]["body"]
    assert cache["passed"]
    assert exports(engine.service)["alder"]["status"] == 502
    receipt = engine.approve(run["id"], "nia", run["proposal"]["digest"])
    assert receipt["verified"] and receipt["graph_synced"]
    assert exports(engine.service)["alder"]["status"] == 200
    engine.approve(run["id"], "nia", run["proposal"]["digest"])
    assert engine.service.read()["mutation_count"] == 1
    assert engine.graph.query("MATCH (d:Decision)-[:CITES]->(s:Source) RETURN count(s)")[0][0] == 10


def test_current_owner_required(engine):
    run = prepare(engine)
    with pytest.raises(Problem, match="accountable owner"):
        engine.approve(run["id"], "mira", run["proposal"]["digest"])
    assert engine.service.read()["mutation_count"] == 0


def test_reviewed_policy_invalidates_proposal(engine):
    run = prepare(engine)
    change = engine.propose_policy(600)
    with pytest.raises(Problem, match="awaiting review"):
        engine.approve(run["id"], "nia", run["proposal"]["digest"])
    with pytest.raises(Problem, match="Policy reviewer"):
        engine.review_policy(change["id"], "nia", True)
    engine.review_policy(change["id"], "reviewer", True)
    with pytest.raises(Problem, match="evidence changed"):
        engine.approve(run["id"], "nia", run["proposal"]["digest"])
    updated = engine.create_run("guided")
    results = [engine.tool(updated["id"], "rehearse_repair", {"repair": r}) for r in ("rollback", "bypass", "cache")]
    assert not any(r["passed"] for r in results)
    assert len(engine.graph.source_list(history=True)) == 11


def test_reject_change_preserves_original_evidence(engine):
    run = prepare(engine)
    change = engine.propose_policy(600)
    engine.review_policy(change["id"], "reviewer", False)
    assert engine.approve(run["id"], "nia", run["proposal"]["digest"])["verified"]


def test_tampered_trial_blocked(engine):
    run = prepare(engine)
    run["trials"][2]["exports"]["alder"]["body"]["amount_cents"] = 1
    engine.journal.put("run", run)
    with pytest.raises(Problem, match="trial evidence changed"):
        engine.approve(run["id"], "nia", run["proposal"]["digest"])


def test_runtime_change_blocked(engine):
    run = prepare(engine)
    runtime = engine.service.read()
    runtime["cache"]["timestamp"] -= 300
    engine.service.write(runtime)
    with pytest.raises(Problem, match="export service changed"):
        engine.approve(run["id"], "nia", run["proposal"]["digest"])


def test_incomplete_graph_blocks_context(engine):
    engine.graph.query("MATCH (:Entity {id:'alder'})-[r:USES]->() DELETE r", write=True)
    with pytest.raises(Problem, match="dependency map"):
        engine.create_run("guided")


def test_graph_failure_after_execution_does_not_duplicate_effect(engine, monkeypatch):
    run = prepare(engine)
    original = engine.graph.record_decision
    def fail(receipt):
        raise Problem("graph_unavailable", "Disconnected")
    monkeypatch.setattr(engine.graph, "record_decision", fail)
    first = engine.approve(run["id"], "nia", run["proposal"]["digest"])
    assert first["verified"] and not first["graph_synced"]
    monkeypatch.setattr(engine.graph, "record_decision", original)
    second = engine.approve(run["id"], "nia", run["proposal"]["digest"])
    assert second["graph_synced"] and engine.service.read()["mutation_count"] == 1
