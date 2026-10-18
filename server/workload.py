"""Real HTTP handlers run against each trial's own SQLite database."""

import asyncio
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .domain import Repair, fingerprint
from .storage import ExportDatabase


class EnrichmentRequest(BaseModel):
    account_id: str


def workload(database: ExportDatabase, trace=None, origin=None):
    service = FastAPI()
    enrichment = FastAPI()

    @enrichment.post("/resolve")
    def resolve(body: EnrichmentRequest):
        account = database.read()["accounts"].get(body.account_id)
        if not account:
            return JSONResponse({"error": "account_not_found"}, 404)
        return {"provenance_id": account["provenance"]}

    @service.get("/exports/{account_id}")
    async def export(account_id: str):
        state = database.read()
        account = state["accounts"].get(account_id)
        if not account:
            return JSONResponse({"error": "account_not_found"}, 404)
        if state["worker_version"] == 1 and state["schema_version"] != 1:
            return JSONResponse(
                {
                    "error": "incompatible_schema",
                    "message": "Worker v1 cannot read schema v2.",
                },
                409,
            )
        body = {
            "account_id": account_id,
            "amount_cents": account["amount_cents"],
            "currency": account["currency"],
        }
        if account["tier"] == "rich":
            if account["mode"] == "live":
                # The actual injected defect: the upstream expects account_id, but v2 sends account.
                payload = {
                    (
                        "account" if state["worker_version"] == 2 else "account_id"
                    ): account_id
                }
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=enrichment),
                    base_url="http://enrichment",
                ) as client:
                    started = time.perf_counter()
                    response = await client.post("/resolve", json=payload)
                    if trace is not None:
                        trace.append({
                            "id": f"resolve:{account_id}",
                            "parent_id": f"export:{account_id}",
                            "customer": account_id,
                            "service": "enrichment-api",
                            "method": "POST", "path": "/resolve",
                            "start_ms": round((started - origin) * 1000, 3),
                            "duration_ms": round((time.perf_counter() - started) * 1000, 3),
                            "status": response.status_code,
                            "request": payload,
                            "response": response.json(),
                        })
                if response.status_code != 200:
                    return JSONResponse(
                        {
                            "error": "enrichment_failed",
                            "upstream_status": response.status_code,
                            "message": "The enrichment request used an invalid field.",
                        },
                        502,
                    )
                body.update(response.json())
            elif account["mode"] == "cache":
                body["provenance_id"] = state["cache"]["records"].get(account_id)
        return body

    return service


async def collect(database, trace=None):
    origin = time.perf_counter()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=workload(database, trace, origin)), base_url="http://exports"
    ) as client:
        outputs = {}
        for customer in sorted(database.read()["accounts"]):
            started = time.perf_counter()
            response = await client.get(f"/exports/{customer}")
            outputs[customer] = {
                "status": response.status_code,
                "body": response.json(),
            }
            if trace is not None:
                trace.append({
                    "id": f"export:{customer}", "parent_id": None,
                    "customer": customer, "service": "export-worker",
                    "method": "GET", "path": f"/exports/{customer}",
                    "start_ms": round((started - origin) * 1000, 3),
                    "duration_ms": round((time.perf_counter() - started) * 1000, 3),
                    "status": response.status_code,
                    "request": None, "response": response.json(),
                })
        return outputs


def exports(database, trace=None):
    return asyncio.run(collect(database, trace))


def rehearse(database, context, repair: Repair, *, checked_at=None):
    start = time.perf_counter()
    original = database.read()
    before_trace, after_trace = [], []
    before = exports(database, before_trace)
    with TemporaryDirectory(prefix="rehearsal-trial-") as directory:
        isolated = database.clone(Path(directory) / "export.sqlite")
        isolated.write(database.changed(isolated.read(), repair, context["affected"]))
        after = exports(isolated, after_trace)
    checks = []

    def check(key, title, passed, expected, actual, customer=None):
        checks.append(
            {
                "key": key,
                "title": title,
                "passed": bool(passed),
                "customer": customer,
                "expected": expected,
                "actual": actual,
            }
        )

    check(
        "schema",
        "Schema matches company records",
        original["schema_version"] == context["values"]["worker:schema_version"],
        context["values"]["worker:schema_version"],
        original["schema_version"],
    )
    if repair == "cache":
        age = (time.time() if checked_at is None else checked_at) - original["cache"]["timestamp"]
        maximum = context["values"]["worker:cache_max_age"]
        check(
            "cache_allowed",
            "Cached enrichment is permitted",
            context["values"]["worker:cache_allowed"],
            True,
            context["values"]["worker:cache_allowed"],
        )
        check(
            "cache_age",
            "Cache meets freshness policy",
            0 <= age <= maximum,
            f"0–{maximum} seconds",
            round(age, 1),
        )
    for customer, result in after.items():
        account, body = original["accounts"][customer], result["body"]
        check(
            "available",
            "Export responds successfully",
            result["status"] == 200,
            200,
            result["status"],
            customer,
        )
        expected = {
            "account_id": customer,
            "amount_cents": account["amount_cents"],
            "currency": account["currency"],
        }
        actual = {key: body.get(key) for key in expected}
        check(
            "integrity",
            "Original report is preserved",
            expected == actual,
            expected,
            actual,
            customer,
        )
        if context["values"][f"{customer}:requires_provenance"]:
            check(
                "provenance",
                "Required provenance is present",
                body.get("provenance_id") == account["provenance"],
                account["provenance"],
                body.get("provenance_id"),
                customer,
            )
        if customer not in context["affected"]:
            check(
                "control",
                "Unaffected customer stays healthy",
                result == before[customer],
                before[customer],
                result,
                customer,
            )
    return {
        "repair": str(repair),
        "passed": all(c["passed"] for c in checks),
        "checks": checks,
        "exports": after,
        "artifact_hash": fingerprint(after),
        "before": before,
        "trace": {
            "before": sorted(before_trace, key=lambda span: span["start_ms"]),
            "after": sorted(after_trace, key=lambda span: span["start_ms"]),
        },
        "scope": context["footprint"] if repair == "rollback" else context["affected"],
        "duration_ms": round((time.perf_counter() - start) * 1000, 1),
    }
