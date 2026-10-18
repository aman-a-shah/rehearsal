"""Provider contract and counterfactual isolation tests. No paid inference."""
import asyncio
import json

import httpx
import pytest

from server.agent import Runner, make_mcp
from server.engine import Engine
from server.simulation import simulate
from server.domain import fingerprint


@pytest.fixture
def core(tmp_path, monkeypatch):
    monkeypatch.setenv("REHEARSAL_PROVIDER", "backboard")
    monkeypatch.setenv("BACKBOARD_API_KEY", "contract-test-key")
    monkeypatch.delenv("BACKBOARD_ASSISTANT_ID", raising=False)
    monkeypatch.setenv("REHEARSAL_RUN_BUDGET_USD", "1")
    engine = Engine(tmp_path)
    engine.start()
    yield engine
    engine.graph.close()


def tool_response(name, args, n=1):
    return {
        "status": "REQUIRES_ACTION", "thread_id": "thread-contract", "run_id": "provider-run-contract", "assistant_id": "assistant-contract",
        "tool_calls": [{"id": f"call-{n}", "type": "function", "function": {"name": name, "arguments": json.dumps({**args, "run_id": "wrong-id"})}}],
        "input_tokens": 20, "output_tokens": 10, "cost_usd": .01, "model_name": "contract-model",
    }


@pytest.mark.asyncio
async def test_backboard_calls_actual_mcp_and_uses_stateful_tool_outputs(core):
    sequence = [("inspect_context", {}), ("read_source", {"source_key": "alder-agreement"}),
                ("rehearse_repair", {"repair": "rollback"}), ("rehearse_repair", {"repair": "bypass"}),
                ("rehearse_repair", {"repair": "cache"}), ("recommend_repair", {"repair": "cache", "reason": "Verified against alder-agreement and cache-policy."})]
    requests = []

    def handler(request):
        requests.append((request.url.path, json.loads(request.content)))
        if len(requests) > 1:
            payload = json.loads(request.content)
            # Emulate the live provider: an assistant has no persisted tools when
            # they were supplied only on the initial message.
            if payload.get("tools") != requests[0][1]["tools"]:
                return httpx.Response(200, json={"status": "COMPLETED", "thread_id": "thread-contract", "content": "I will now test the repairs."})
            assert request.url.params["stream"] == "false"
        name, args = sequence[len(requests) - 1]
        return httpx.Response(200, json=tool_response(name, args, len(requests)))

    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    current = core.get_run(run["id"])
    assert current["status"] == "awaiting_approval"
    assert current["usage"]["input_tokens"] == 120
    assert current["usage"]["output_tokens"] == 60
    assert current["usage"]["cost_usd"] == pytest.approx(.06)
    assert requests[0][0] == "/api/threads/messages"
    assert requests[0][1]["memory"] == "Readonly"
    assert requests[0][1]["tools"][0]["type"] == "function"
    assert requests[1][0] == "/api/threads/thread-contract/runs/provider-run-contract/submit-tool-outputs"
    assert "affected" in json.loads(requests[1][1]["tool_outputs"][0]["output"])
    assert core.service.read()["mutation_count"] == 0
    assert runner.backboard.assistant_id == "assistant-contract"
    core.reset()
    assert core.journal.all("integration")[0]["assistant_id"] == "assistant-contract"


@pytest.mark.asyncio
async def test_backboard_missing_provider_run_stops_before_local_tools(core):
    data = tool_response("inspect_context", {})
    data.pop("run_id")
    runner = Runner(core, make_mcp(core), httpx.MockTransport(lambda _: httpx.Response(200, json=data)))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "error"
    assert "pending tool run" in result["message"]
    assert result["events"] == []
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
async def test_cumulative_provider_calls_reuse_outputs_without_reexecuting_tools(core):
    sequence = [("inspect_context", {}), ("read_source", {"source_key": "alder-agreement"}),
                ("read_source", {"source_key": "schema"}), ("rehearse_repair", {"repair": "rollback"}),
                ("rehearse_repair", {"repair": "bypass"}), ("rehearse_repair", {"repair": "cache"}),
                ("recommend_repair", {"repair": "cache", "reason": "Verified against alder-agreement and cache-policy."})]
    prior_calls, submitted = [], {}
    count = 0

    def handler(request):
        nonlocal count
        if count:
            outputs = json.loads(request.content)["tool_outputs"]
            assert len(outputs) == len(prior_calls)
            for item in outputs:
                if item["tool_call_id"] in submitted:
                    assert item["output"] == submitted[item["tool_call_id"]]
                submitted[item["tool_call_id"]] = item["output"]
        name, args = sequence[count]
        count += 1
        response = tool_response(name, args, count)
        prior_calls.extend(response["tool_calls"])
        response["tool_calls"] = list(prior_calls)
        return httpx.Response(200, json=response)

    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "awaiting_approval"
    assert len(result["events"]) == len(sequence)
    assert [event["tool"] for event in result["events"]] == [name for name, _ in sequence]
    assert count == 7
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
async def test_reused_provider_call_id_cannot_change_its_arguments(core):
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        return httpx.Response(200, json=tool_response(
            "read_source", {"source_key": "alder-agreement" if count == 1 else "schema"}, 1
        ))
    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "error"
    assert "changed an already completed tool call" in result["message"]
    assert len(result["events"]) == 1
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 402, 422, 429, 503])
async def test_backboard_failure_is_visible_and_never_silently_runs_demo(core, status):
    runner = Runner(core, make_mcp(core), httpx.MockTransport(lambda _: httpx.Response(status, json={"secret": "do not expose"})))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "error"
    assert "Backboard" in result["message"]
    assert "do not expose" not in result["message"]
    assert result["trials"] == []
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
async def test_reported_cost_budget_stops_before_tools_execute(core):
    data = tool_response("inspect_context", {})
    data["cost_usd"] = 1.01
    runner = Runner(core, make_mcp(core), httpx.MockTransport(lambda _: httpx.Response(200, json=data)))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "error"
    assert "cost limit" in result["message"]
    assert result["events"] == []
    assert result["usage"]["cost_usd"] == 1.01


@pytest.mark.asyncio
async def test_turn_limit_never_requests_an_unrecorded_thirteenth_response(core):
    count = 0

    def handler(request):
        nonlocal count
        count += 1
        return httpx.Response(200, json=tool_response("inspect_context", {}, count))

    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert count == 12
    assert result["usage"]["turns"] == 12
    assert result["usage"]["cost_usd"] == pytest.approx(.12)
    assert result["status"] == "error"
    assert "turn limit" in result["message"]
    assert core.service.read()["mutation_count"] == 0


def test_invalid_budget_configuration_uses_safe_default(core, monkeypatch):
    for value in ("invalid", "", "nan", "inf", "0", "-1"):
        monkeypatch.setenv("REHEARSAL_RUN_BUDGET_USD", value)
        assert Runner(core, make_mcp(core)).backboard.budget == 1.0


@pytest.mark.asyncio
async def test_unknown_tool_never_executes_and_is_reported_to_provider(core):
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        if count == 1:
            return httpx.Response(200, json=tool_response("approve_repair", {}))
        payload = json.loads(request.content)
        assert "unknown_tool" in payload["tool_outputs"][0]["output"]
        return httpx.Response(200, json={"status": "COMPLETED", "content": "done", "thread_id": "thread-contract"})
    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    assert core.get_run(run["id"])["status"] == "error"
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
async def test_verified_memory_records_negative_evidence_and_is_idempotent(core):
    run = core.create_run("guided")
    for repair in ("rollback", "bypass", "cache"):
        await asyncio.to_thread(core.tool, run["id"], "rehearse_repair", {"repair": repair})
    core.tool(run["id"], "recommend_repair", {"repair": "cache", "reason": "Checked."})
    run = core.get_run(run["id"])
    receipt = await asyncio.to_thread(core.approve, run["id"], "nia", run["proposal"]["digest"])
    requests = []
    def handler(request):
        requests.append(request)
        if request.url.path == "/api/assistants":
            return httpx.Response(200, json={"assistant_id": "a-memory"})
        lesson = json.loads(json.loads(request.content)["content"])
        assert lesson["verified_repair"] == "cache"
        assert len(lesson["rejected_repairs"]) == 2
        assert lesson["requirements"]["alder:requires_provenance"] is True
        return httpx.Response(200, json={"memory_id": "m-1"})
    runner = Runner(core, make_mcp(core), httpx.MockTransport(handler))
    await runner.backboard.remember(receipt)
    await runner.backboard.remember(receipt)
    assert len(requests) == 2
    assert core.get_run(run["id"])["memory_sync"] == "saved"
    assert core.get_run(run["id"])["memory_id"] == "m-1"


@pytest.mark.parametrize("limit,provenance,age,eligible", [
    (900, True, 720, ["cache"]), (600, True, 720, []),
    (600, False, 720, ["bypass"]), (900, True, 900, ["cache"]),
    (900, True, 901, []),
])
def test_counterfactual_changes_decision_without_mutating_authority(core, limit, provenance, age, eligible):
    before = fingerprint(core.service.read())
    context = core.graph.context()["fingerprint"]
    result = simulate(core, limit, provenance, age)
    assert result["eligible"] == eligible
    assert len(result["trials"]) == 3
    assert result["hypothetical"] is True
    assert "proposal" not in result
    assert fingerprint(core.service.read()) == before
    assert core.graph.context()["fingerprint"] == context
    assert core.journal.all("run") == []
    assert core.service.receipts() == []


def test_simulation_and_event_stream_api_contract(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from server.api import create_app
    monkeypatch.delenv("BACKBOARD_API_KEY", raising=False)
    core = Engine(tmp_path)
    with TestClient(create_app(core)) as client:
        headers = {"X-Rehearsal-Request": "1"}
        body = {"cache_max_age": 600, "requires_provenance": True, "cache_age": 720}
        assert client.post("/api/simulations", json=body, headers=headers).status_code == 401
        client.post("/api/session", json={"person": "nia"}, headers=headers)
        response = client.post("/api/simulations", json=body, headers=headers)
        assert response.status_code == 200
        assert response.json()["eligible"] == []
        assert response.json()["trials"][0]["hypothetical"] is True
        for invalid in ({"cache_max_age": True}, {"cache_age": -1}, {"requires_provenance": "false"}):
            assert client.post("/api/simulations", json={**body, **invalid}, headers=headers).status_code == 422
        run = core.create_run("guided")
        core.fail_run(run["id"], "Stopped for stream contract test")
        with client.stream("GET", f"/api/runs/{run['id']}/events") as response:
            assert response.headers["content-type"].startswith("text/event-stream")
            lines = list(response.iter_lines())
            event = json.loads(next(line[6:] for line in lines if line.startswith("data: ")))
            assert event["status"] == "error"
            assert event["id"] == run["id"]
        assert client.get("/api/runs/unknown/events").status_code == 404
        assert core.service.read()["mutation_count"] == 0


def test_connection_authenticates_without_exposing_key(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from server.api import create_app
    monkeypatch.delenv("BACKBOARD_API_KEY", raising=False)
    monkeypatch.setenv("REHEARSAL_PROVIDER", "backboard")
    token = "test-operator-token-with-at-least-32-characters"
    monkeypatch.setenv("REHEARSAL_OPERATOR_TOKEN", token)
    calls = []
    def handler(request):
        calls.append(request)
        assert request.url.path == "/api/assistants"
        assert request.headers["X-API-Key"] == "private-contract-key"
        return httpx.Response(200, json=[])
    core = Engine(tmp_path)
    app = create_app(core, lambda engine, mcp: Runner(engine, mcp, httpx.MockTransport(handler)))
    with TestClient(app) as client:
        headers = {"X-Rehearsal-Request": "1"}
        client.post("/api/session", json={"person": "nia"}, headers=headers)
        assert client.post("/api/operator/login", json={"token": token}, headers=headers).status_code == 200
        connected = client.post("/api/connections/backboard", headers=headers, json={"api_key": "private-contract-key", "model": "contract-model", "llm_provider": "anthropic"})
        assert connected.status_code == 200
        assert connected.json()["available"] is True
        assert connected.json()["model"] == "contract-model"
        assert "private-contract-key" not in connected.text
        assert "private-contract-key" not in client.get("/api/workspace").text
        assert len(calls) == 1
        assert core.journal.all("integration") == [{"id": "backboard", "assistant_id": None}]
