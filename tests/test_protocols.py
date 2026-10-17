import asyncio
import json
import socket
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from server.agent import Runner, make_mcp
from server.api import create_app
from server.domain import Problem
from server.engine import Engine
from server.workload import rehearse
from server.domain import Repair


@pytest.fixture
def core(tmp_path):
    engine = Engine(tmp_path)
    engine.start()
    yield engine
    engine.graph.close()


def prepare(engine):
    run = engine.create_run("guided")
    for repair in ("rollback", "bypass", "cache"):
        engine.tool(run["id"], "rehearse_repair", {"repair": repair})
    engine.tool(
        run["id"], "recommend_repair", {"repair": "cache", "reason": "Verified output."}
    )
    return engine.get_run(run["id"])


def test_expiry_and_graph_loss_block_new_execution(core, monkeypatch):
    run = prepare(core)
    monkeypatch.setattr(
        "server.engine.time.time", lambda: run["proposal"]["expires_at"] + 1
    )
    with pytest.raises(Problem, match="expired"):
        core.approve(run["id"], "nia", run["proposal"]["digest"])
    assert core.service.read()["mutation_count"] == 0


def test_graph_unavailable_blocks_even_a_valid_proposal(core, monkeypatch):
    run = prepare(core)

    def unavailable(*args, **kwargs):
        raise Problem("graph_unavailable", "Company context unavailable")

    monkeypatch.setattr(core.graph, "query", unavailable)
    with pytest.raises(Problem, match="unavailable"):
        core.approve(run["id"], "nia", run["proposal"]["digest"])
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.parametrize(
    "age,expected", [(899, True), (900, True), (901, False), (-1, False)]
)
def test_cache_boundaries(core, monkeypatch, age, expected):
    now = 1800000000.0
    monkeypatch.setattr("server.workload.time.time", lambda: now)
    state = core.service.read()
    state["cache"]["timestamp"] = now - age
    core.service.write(state)
    result = rehearse(core.service, core.graph.context(), Repair.CACHE)
    assert result["passed"] is expected


def test_corrupt_cache_is_rejected(core):
    state = core.service.read()
    state["cache"]["records"]["alder"] = "another-customer"
    core.service.write(state)
    assert not rehearse(core.service, core.graph.context(), Repair.CACHE)["passed"]


def test_restart_preserves_decision_and_does_not_reapply(tmp_path):
    first = Engine(tmp_path)
    first.start()
    run = prepare(first)
    first.approve(run["id"], "nia", run["proposal"]["digest"])
    first.graph.close()
    second = Engine(tmp_path)
    try:
        second.start()
        assert second.get_run(run["id"])["status"] == "completed"
        assert second.service.read()["mutation_count"] == 1
        assert second.service.receipt(run["id"])["verified"]
    finally:
        second.graph.close()


def test_execution_receipt_recovers_after_interrupted_journal_write(core, monkeypatch):
    run = prepare(core)
    save = core.journal.put

    def interrupted(kind, record):
        if kind == "run" and record["status"] == "completed":
            raise OSError("simulated interruption after the service committed")
        return save(kind, record)

    monkeypatch.setattr(core.journal, "put", interrupted)
    with pytest.raises(OSError):
        core.approve(run["id"], "nia", run["proposal"]["digest"])
    assert core.service.read()["mutation_count"] == 1
    assert core.get_run(run["id"])["status"] == "awaiting_approval"
    monkeypatch.setattr(core.journal, "put", save)
    core.start()
    assert core.get_run(run["id"])["status"] == "completed"
    assert core.service.read()["mutation_count"] == 1


def test_concurrent_approval_requests_apply_only_once(core):
    run = prepare(core)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda _: core.approve(run["id"], "nia", run["proposal"]["digest"]),
                range(2),
            )
        )
    assert all(result["verified"] for result in results)
    assert core.service.read()["mutation_count"] == 1


def test_policy_acceptance_can_resume_after_journal_interruption(core, monkeypatch):
    change = core.propose_policy(600)
    save = core.journal.put

    def interrupted(kind, record):
        if kind == "change" and record["status"] == "accepted":
            raise OSError("simulated disk interruption")
        return save(kind, record)

    monkeypatch.setattr(core.journal, "put", interrupted)
    with pytest.raises(OSError):
        core.review_policy(change["id"], "reviewer", True)
    assert core.pending_changes()[0]["status"] == "applying"
    with pytest.raises(Problem, match="Resume acceptance"):
        core.review_policy(change["id"], "reviewer", False)
    monkeypatch.setattr(core.journal, "put", save)
    assert core.review_policy(change["id"], "reviewer", True)["status"] == "accepted"
    assert core.graph.context()["revision"] == 2
    assert core.graph.context()["values"]["worker:cache_max_age"] == 600


@pytest.mark.asyncio
async def test_guided_runner_uses_official_mcp_and_stops_for_approval(core):
    runner = Runner(core, make_mcp(core))
    run = core.create_run("guided")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "awaiting_approval"
    assert [e["tool"] for e in result["events"]] == [
        "inspect_context",
        "rehearse_repair",
        "rehearse_repair",
        "rehearse_repair",
        "recommend_repair",
    ]
    assert core.service.read()["mutation_count"] == 0


@pytest.mark.asyncio
async def test_live_provider_contract_uses_results_and_records_tokens(
    core, monkeypatch
):
    monkeypatch.setenv("REHEARSAL_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-only-not-a-real-key")
    sequence = [
        ("inspect_context", {}),
        ("rehearse_repair", {"repair": "rollback"}),
        ("rehearse_repair", {"repair": "bypass"}),
        ("rehearse_repair", {"repair": "cache"}),
        (
            "recommend_repair",
            {"repair": "cache", "reason": "Verified provenance and fresh cache."},
        ),
    ]
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        name, args = sequence[len(seen) - 1]
        return httpx.Response(
            200,
            json={
                "model": "contract-test",
                "content": [
                    {
                        "type": "tool_use",
                        "id": f"call_{len(seen)}",
                        "name": name,
                        "input": {**args, "run_id": "wrong-run-id"},
                    }
                ],
                "usage": {"input_tokens": 20, "output_tokens": 10},
            },
        )

    runner = Runner(core, make_mcp(core), transport=httpx.MockTransport(handler))
    run = core.create_run("live")
    await runner.execute(run)
    result = core.get_run(run["id"])
    assert result["status"] == "awaiting_approval"
    assert result["usage"]["input_tokens"] == 100
    assert result["usage"]["output_tokens"] == 50
    assert seen[1]["messages"][-1]["content"][0]["type"] == "tool_result"
    assert core.service.read()["mutation_count"] == 0


def test_api_sessions_origins_and_invalid_policy_inputs(tmp_path):
    app = create_app(Engine(tmp_path))
    with TestClient(app) as client:
        headers = {"X-Rehearsal-Request": "1"}
        assert client.post("/api/session", json={"person": "nia"}).status_code == 403
        assert (
            client.post(
                "/api/session",
                json={"person": "nia"},
                headers={**headers, "Origin": "https://unrelated.example"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/runs", json={"mode": "guided"}, headers=headers
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/session", json={"person": "nia"}, headers=headers
            ).status_code
            == 200
        )
        assert (
            client.post(
                "/api/policy/propose", json={"max_age": True}, headers=headers
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/policy/propose", json={"max_age": -1}, headers=headers
            ).status_code
            == 422
        )
        assert client.get("/api/workspace").json()["context"]["affected"] == [
            "alder",
            "beacon",
        ]


@pytest.mark.asyncio
async def test_external_mcp_http_transport_lists_and_invokes_tools(tmp_path):
    engine = Engine(tmp_path)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(engine), log_level="error"))
    task = asyncio.create_task(server.serve(sockets=[listener]))
    try:
        async with asyncio.timeout(15):
            while not server.started:
                if task.done():
                    await task
                    pytest.fail("The HTTP server stopped before startup")
                await asyncio.sleep(0.05)
        run = engine.create_run("guided")
        async with streamable_http_client(f"http://127.0.0.1:{port}/mcp/") as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as client:
                await client.initialize()
                assert {tool.name for tool in (await client.list_tools()).tools} == {
                    "inspect_context",
                    "read_source",
                    "rehearse_repair",
                    "recommend_repair",
                }
                result = await client.call_tool(
                    "inspect_context", {"run_id": run["id"]}
                )
                assert not result.isError
                assert json.loads(result.content[0].text)["affected"] == [
                    "alder",
                    "beacon",
                ]
        assert engine.service.read()["mutation_count"] == 0
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 15)
        listener.close()
