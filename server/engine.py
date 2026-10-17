"""One locked workflow coordinates graph evidence, trials, review, and durable execution."""

import threading
import time
import uuid
from pathlib import Path

from .domain import Problem, Repair, REPAIRS, fingerprint
from .graph import CompanyGraph
from .storage import Journal, ExportDatabase
from .workload import exports, rehearse


class Engine:
    def __init__(self, directory: Path, graph=None):
        self.directory = Path(directory)
        self.graph = graph or CompanyGraph(directory)
        self.journal = Journal(directory / "journal.sqlite")
        self.service = ExportDatabase(directory / "exports.sqlite")
        self.lock = threading.RLock()

    def start(self):
        with self.lock:
            self.graph.seed()
            for run in self.journal.all("run"):
                if run["status"] in {"queued", "running"}:
                    run.update(
                        status="interrupted",
                        message="The server restarted. Start a new rehearsal.",
                    )
                    self.journal.put("run", run)
            for receipt in self.service.receipts():
                self.reconcile(receipt)

    def pending_changes(self):
        return [
            r
            for r in self.journal.all("change")
            if r["status"] in {"pending", "applying"}
        ]

    def overview(self):
        with self.lock:
            context = self.graph.context()
            return {
                "context": context,
                "diagram": self.graph.diagram(),
                "exports": exports(self.service),
                "runtime": self.service.read(),
                "runs": self.journal.all("run"),
                "decisions": self.service.receipts(),
                "changes": self.pending_changes(),
                "repairs": REPAIRS,
                "trace": list(self.graph.trace),
            }

    def get_run(self, id):
        with self.lock:
            return self.journal.get("run", id)

    def create_run(self, mode):
        with self.lock:
            if any(
                r["status"] in {"queued", "running"} for r in self.journal.all("run")
            ):
                raise Problem("run_busy", "A rehearsal is already running.")
            if self.pending_changes():
                raise Problem(
                    "pending_review",
                    "Review the pending company policy before starting a rehearsal.",
                )
            context = self.graph.context()
            run = {
                "id": "run_" + uuid.uuid4().hex[:12],
                "created_at": time.time(),
                "mode": mode,
                "status": "queued",
                "context": context,
                "runtime_hash": fingerprint(self.service.read()),
                "trials": [],
                "events": [],
                "recommendation": None,
                "proposal": None,
            }
            return self.journal.put("run", run)

    def assert_current(self, run):
        if self.pending_changes():
            raise Problem(
                "pending_review",
                "A company policy is awaiting review. Approval is paused.",
            )
        context = self.graph.context()
        if context["fingerprint"] != run["context"]["fingerprint"]:
            raise Problem(
                "stale_evidence",
                "Company evidence changed. Run a new rehearsal before approving.",
            )
        if fingerprint(self.service.read()) != run["runtime_hash"]:
            raise Problem(
                "runtime_changed", "The export service changed. Run a new rehearsal."
            )
        return context

    def tool(self, run_id, name, arguments=None):
        with self.lock:
            run = self.get_run(run_id)
            if run["status"] not in {"queued", "running"}:
                raise Problem(
                    "run_finished", "This rehearsal has already reached its decision."
                )
            run["status"] = "running"
            started = time.perf_counter()
            arguments = arguments or {}
            try:
                self.assert_current(run)
                if name == "inspect_context":
                    result = run["context"]
                elif name == "read_source":
                    result = next(
                        (
                            s
                            for s in run["context"]["sources"]
                            if s["key"] == arguments.get("source_key")
                        ),
                        None,
                    )
                    if result is None:
                        raise Problem(
                            "source_missing", "That source does not exist.", 404
                        )
                elif name == "rehearse_repair":
                    try:
                        repair = Repair(arguments.get("repair"))
                    except (ValueError, TypeError):
                        raise Problem(
                            "invalid_repair", "Choose rollback, bypass, or cache.", 400
                        )
                    result = next(
                        (t for t in run["trials"] if t["repair"] == repair), None
                    )
                    if result is None:
                        result = rehearse(self.service, run["context"], repair)
                        run["trials"].append(result)
                elif name == "recommend_repair":
                    selected = arguments.get("repair")
                    if len(run["trials"]) != len(Repair):
                        raise Problem(
                            "incomplete_trials",
                            "Compare all three repairs before recommending one.",
                        )
                    if selected is not None and not any(
                        t["repair"] == selected and t["passed"] for t in run["trials"]
                    ):
                        raise Problem(
                            "unsafe_repair", "That repair did not pass its checks."
                        )
                    reason = str(arguments.get("reason", ""))[:2000]
                    run["recommendation"] = {"repair": selected, "reason": reason}
                    run["status"] = "awaiting_approval" if selected else "blocked"
                    if selected:
                        trial = next(
                            t for t in run["trials"] if t["repair"] == selected
                        )
                        proposal = {
                            "repair": selected,
                            "owner": run["context"]["values"]["worker:owner"],
                            "context_hash": run["context"]["fingerprint"],
                            "runtime_hash": run["runtime_hash"],
                            "trial_hash": fingerprint(trial),
                            "expires_at": time.time() + 120,
                        }
                        proposal["digest"] = fingerprint(proposal)
                        run["proposal"] = proposal
                    result = {
                        "status": run["status"],
                        "recommendation": run["recommendation"],
                    }
                else:
                    raise Problem("unknown_tool", "That tool is unavailable.", 400)
                run["events"].append(
                    {
                        "tool": name,
                        "arguments": arguments,
                        "status": "ok",
                        "at": time.time(),
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    }
                )
                self.journal.put("run", run)
                return result
            except Problem as error:
                run["events"].append(
                    {
                        "tool": name,
                        "arguments": arguments,
                        "status": "error",
                        "message": error.message,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                        "at": time.time(),
                    }
                )
                self.journal.put("run", run)
                raise

    def fail_run(self, id, message):
        with self.lock:
            run = self.get_run(id)
            if run["status"] in {"queued", "running"}:
                run.update(status="error", message=message)
                self.journal.put("run", run)

    def approve(self, id, person, digest):
        with self.lock:
            receipt = self.service.receipt(id)
            if receipt:
                return self.reconcile(receipt)
            run = self.get_run(id)
            proposal = run.get("proposal")
            if run["status"] != "awaiting_approval" or not proposal:
                raise Problem(
                    "no_proposal", "This rehearsal has no repair awaiting approval."
                )
            if person != proposal["owner"]:
                raise Problem(
                    "owner_required",
                    "Only the current accountable owner may approve this repair.",
                    403,
                )
            if (
                digest != proposal["digest"]
                or fingerprint({k: v for k, v in proposal.items() if k != "digest"})
                != digest
            ):
                raise Problem(
                    "proposal_changed", "The proposal changed. Reopen its review."
                )
            if time.time() >= proposal["expires_at"]:
                raise Problem(
                    "approval_expired", "This proposal expired. Run a fresh rehearsal."
                )
            context = self.assert_current(run)
            if person != context["values"]["worker:owner"]:
                raise Problem("owner_changed", "The accountable owner changed.", 403)
            trial = next(t for t in run["trials"] if t["repair"] == proposal["repair"])
            if fingerprint(trial) != proposal["trial_hash"]:
                raise Problem(
                    "evidence_changed",
                    "The trial evidence changed. Run a fresh rehearsal.",
                )
            fresh = rehearse(self.service, context, Repair(proposal["repair"]))
            if not fresh["passed"] or fresh["artifact_hash"] != trial["artifact_hash"]:
                raise Problem(
                    "recheck_failed",
                    "The repair no longer passes its checks. Run a fresh rehearsal.",
                )
            receipt = {
                "run_id": id,
                "repair": proposal["repair"],
                "owner": person,
                "approved_at": time.time(),
                "summary": f"{REPAIRS[proposal['repair']]['title']} restored the promised exports.",
                "sources": context["sources"],
                "context_revision": context["revision"],
                "proposal_digest": digest,
                "expected_exports": fresh["exports"],
                "scope": fresh["scope"],
                "follow_up": "Fix the worker's live enrichment request and retire the temporary workaround.",
            }
            receipt = self.service.apply(
                id,
                run["runtime_hash"],
                proposal["repair"],
                context["affected"],
                receipt,
            )
            return self.reconcile(receipt)

    def reconcile(self, receipt):
        # A durable target-side receipt wins over an interrupted journal/graph write.
        if not receipt["verified"]:
            actual = exports(self.service)
            receipt["exports"] = actual
            receipt["verified"] = actual == receipt["expected_exports"]
            receipt["verification_status"] = (
                "passed" if receipt["verified"] else "needs_review"
            )
            self.service.update_receipt(receipt)
        if not receipt["graph_synced"]:
            try:
                self.graph.record_decision(receipt)
                receipt["graph_synced"] = True
                self.service.update_receipt(receipt)
            except Problem:
                pass
        run = self.get_run(receipt["run_id"])
        run.update(
            status="completed" if receipt["verified"] else "needs_review",
            receipt=receipt,
        )
        self.journal.put("run", run)
        return receipt

    def propose_policy(self, maximum):
        with self.lock:
            if self.pending_changes():
                raise Problem(
                    "pending_review", "Review the existing proposed revision first."
                )
            context = self.graph.context()
            source = next(s for s in context["sources"] if s["key"] == "cache-policy")
            change = {
                "id": "change_" + uuid.uuid4().hex[:12],
                "status": "pending",
                "max_age": maximum,
                "previous_age": context["values"]["worker:cache_max_age"],
                "source_revision": source["revision"],
                "context_revision": context["revision"],
                "created_at": time.time(),
            }
            return self.journal.put("change", change)

    def review_policy(self, id, person, accept):
        with self.lock:
            if person != "reviewer":
                raise Problem(
                    "reviewer_required",
                    "Switch to Policy reviewer to review company policy.",
                    403,
                )
            change = self.journal.get("change", id)
            if change["status"] not in {"pending", "applying"}:
                return change
            if not accept and change["status"] == "applying":
                raise Problem(
                    "resume_required",
                    "This revision has started applying. Resume acceptance to finish it.",
                )
            if accept:
                change["status"] = "applying"
                self.journal.put("change", change)
                self.graph.accept_policy(change)
            change["status"] = "accepted" if accept else "rejected"
            return self.journal.put("change", change)

    def reset(self):
        with self.lock:
            if any(
                r["status"] in {"running", "queued"} for r in self.journal.all("run")
            ):
                raise Problem(
                    "run_busy", "Wait for the active rehearsal before resetting."
                )
            self.graph.seed(reset=True)
            self.service.reset()
            self.journal.clear()
