"""Counterfactuals use the same executable verifier, without granting authority."""

import copy
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from .domain import Repair
from .workload import rehearse


@contextmanager
def incident_snapshot(engine):
    with TemporaryDirectory(prefix="rehearsal-counterfactual-") as folder:
        with engine.lock:
            context = copy.deepcopy(engine.graph.context())
            snapshot = engine.service.clone(Path(folder) / "snapshot.sqlite")
        yield snapshot, context


def evaluate(snapshot, original_context, cache_max_age, requires_provenance, cache_age, observed_at):
    started = time.perf_counter()
    context = copy.deepcopy(original_context)
    context["values"]["worker:cache_max_age"] = cache_max_age
    context["values"]["alder:requires_provenance"] = requires_provenance
    with TemporaryDirectory(prefix="rehearsal-case-") as folder:
        scenario = snapshot.clone(Path(folder) / "scenario.sqlite")
        state = scenario.read()
        # Evaluate the original incident even if a repair has since been applied.
        state["worker_version"] = 2
        for account in state["accounts"].values():
            account["mode"] = "live"
        state["cache"]["timestamp"] = observed_at - cache_age
        scenario.write(state)
        with ThreadPoolExecutor(max_workers=3) as pool:
            trials = list(pool.map(
                lambda repair: rehearse(scenario, context, repair, checked_at=observed_at),
                list(Repair),
            ))
    eligible = [t["repair"] for t in trials if t["passed"]]
    return {
        "hypothetical": True,
        "created_at": observed_at,
        "context_hash": original_context["fingerprint"],
        "assumptions": {
            "cache_max_age": cache_max_age,
            "requires_provenance": requires_provenance,
            "cache_age": cache_age,
        },
        "trials": [{**trial, "hypothetical": True} for trial in trials],
        "eligible": eligible,
        "recommendation": next((r for r in ("cache", "bypass", "rollback") if r in eligible), None),
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def simulate(engine, cache_max_age, requires_provenance, cache_age):
    with incident_snapshot(engine) as (snapshot, context):
        return evaluate(snapshot, context, cache_max_age, requires_provenance, cache_age, time.time())


def sweep(engine, cache_max_age):
    """Replay boundary and representative cases against one frozen input snapshot."""
    started = time.perf_counter()
    observed_at = time.time()
    ages = sorted({0, 720, max(0, cache_max_age - 1), cache_max_age,
                   min(86400, cache_max_age + 1), min(86400, cache_max_age * 2)})
    with incident_snapshot(engine) as (snapshot, context):
        cases = [
            evaluate(snapshot, context, cache_max_age, provenance, age, observed_at)
            for provenance in (True, False)
            for age in ages
        ]
    return {
        "hypothetical": True,
        "created_at": observed_at,
        "context_hash": context["fingerprint"],
        "cache_max_age": cache_max_age,
        "ages": ages,
        "cases": cases,
        "summary": {
            "scenarios": len(cases),
            "trials": sum(len(case["trials"]) for case in cases),
            "checks": sum(len(trial["checks"]) for case in cases for trial in case["trials"]),
            "eligible": {str(repair): sum(repair in case["eligible"] for case in cases) for repair in Repair},
        },
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }
