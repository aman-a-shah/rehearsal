import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  FileText,
  LoaderCircle,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { ImpactMap } from "../components/ImpactMap";
import { Experiments } from "../components/Experiments";
import { PEOPLE, type Workspace, type Run, type Trial } from "../types";

type Props = {
  data: Workspace;
  run: Run | null;
  now: number;
  running: boolean;
  busy: boolean;
  onRun: (mode: "guided" | "live") => void;
  onTrial: (trial: Trial) => void;
  onSource: (key: string) => void;
  onNode: (id: string) => void;
  onTrace: () => void;
  onGraphTrace: () => void;
  onReview: () => void;
  onHelp: () => void;
  onDecisions: () => void;
};

export function Incident({
  data,
  run,
  now,
  running,
  busy,
  onRun,
  onTrial,
  onSource,
  onNode,
  onTrace,
  onGraphTrace,
  onReview,
  onHelp,
  onDecisions,
}: Props) {
  const [mode, setMode] = useState<"guided" | "live">("guided");
  const broken = Object.values(data.exports).filter(
    (e) => e.status !== 200,
  ).length;
  const resolved = broken === 0;
  const stale =
    !!run?.proposal &&
    (run.proposal.context_hash !== data.context.fingerprint ||
      data.changes.length > 0);
  const expired = !!run?.proposal && now >= run.proposal.expires_at;
  const ready =
    !!run?.proposal && run.status === "awaiting_approval" && !stale && !expired;
  const blocked = run?.status === "blocked";
  const owner = PEOPLE[String(data.context.values["worker:owner"])];
  const stage = resolved
    ? 4
    : ready || blocked || stale || expired
      ? 3
      : running
        ? 2
        : 1;
  return (
    <>
      <header className="page-heading">
        <div className="incident-kicker">
          <span className={`status-tag ${resolved ? "success" : "incident"}`}>
            <i className={resolved ? "good-dot" : "bad-dot"} />
            {resolved ? "Resolved" : "Active incident"}
          </span>
          <span>INC-204</span>
          <span className="slash">/</span>
          <span>Export worker</span>
        </div>
        <h1>
          {resolved
            ? "Exports restored. Promises kept."
            : "Rich exports are failing."}
        </h1>
        <p>
          {resolved
            ? "The repair is applied, the output is verified, and the decision is recorded."
            : "Find the repair that restores service without breaking a customer commitment."}
        </p>
      </header>
      <div className="workflow" aria-label="Rehearsal progress">
        {[
          "Understand the impact",
          "Rehearse the options",
          "Review the evidence",
          "Apply with approval",
        ].map((label, i) => (
          <div
            key={label}
            className={
              stage > i + 1 ? "complete" : stage === i + 1 ? "current" : ""
            }
          >
            <span className="step-number">
              {stage > i + 1 ? <Check size={12} /> : `0${i + 1}`}
            </span>
            <span>{label}</span>
            {i !== 3 && <ArrowRight size={13} className="step-arrow" />}
          </div>
        ))}
      </div>
      <div className="incident-grid">
        <div className="incident-main">
          <div className="impact-summary">
            <div>
              <strong>
                {broken}
                <span> / {Object.keys(data.exports).length}</span>
              </strong>
              <p>customers affected</p>
            </div>
            <div>
              <strong>3</strong>
              <p>bounded repair options</p>
            </div>
            <div>
              <strong>{owner?.name || "Unknown"}</strong>
              <p>accountable owner</p>
            </div>
            <span className="summary-caption">
              {resolved ? <CheckCircle2 size={17} /> : <Users size={17} />}
              {resolved
                ? "All customer exports healthy"
                : "Cedar is unaffected"}
            </span>
          </div>
          <ImpactMap data={data} onNode={onNode} onTrace={onGraphTrace} />
        </div>
        <aside className="response-panel panel">
          <div className="response-heading">
            <span className="agent-mark">
              <ShieldCheck size={20} />
            </span>
            <span>Rehearsal agent</span>
            <span className={`status-tag ${running ? "incident" : "neutral"}`}>
              {running ? "Working" : resolved ? "Complete" : "Ready"}
            </span>
          </div>
          <h2>
            {resolved
              ? "A verified recovery."
              : ready
                ? "One repair kept every promise."
                : blocked
                  ? "No safe repair found."
                  : "Prove it before you apply it."}
          </h2>
          <p>
            {resolved
              ? "The change and its source evidence are saved. A follow-up tracks the permanent fix."
              : ready
                ? "The proposed repair passed every required check. Your approval is next."
                : blocked
                  ? "The current company policy rules out every tested option. The service needs a different repair."
                  : "Follow the company graph, test three repairs, then put the evidence in front of the owner."}
          </p>
          <div className="agent-checklist">
            <div>
              <span className={run?.events.length ? "complete-check" : ""}>
                {run?.events.length ? <Check size={12} /> : "1"}
              </span>
              Trace the affected customers
            </div>
            <div>
              <span
                className={run?.trials.length === 3 ? "complete-check" : ""}
              >
                {run?.trials.length === 3 ? <Check size={12} /> : "2"}
              </span>
              Execute isolated repair trials
            </div>
            <div>
              <span className={resolved ? "complete-check" : ""}>
                {resolved ? <Check size={12} /> : "3"}
              </span>
              Wait for owner approval
            </div>
          </div>
          <div className="run-controls">
            <label htmlFor="run-mode">
              Execution mode
              <button
                className="text-button"
                aria-label="Details about execution modes"
                onClick={onHelp}
              >
                Details <ArrowUpRight size={12} />
              </button>
            </label>
            <select
              id="run-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "guided" | "live")}
              disabled={running || busy}
            >
              <option value="guided">Guided demo · real tools</option>
              <option value="live" disabled={!data.provider.available}>
                Live agent{data.provider.available ? "" : " · API key required"}
              </option>
            </select>
            {resolved ? (
              <button className="primary full-width" onClick={onDecisions}>
                Open decision log <ArrowRight size={16} />
              </button>
            ) : ready ? (
              <button className="primary full-width" onClick={onReview}>
                Review proposed repair <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="primary full-width"
                onClick={() => onRun(mode)}
                disabled={running || busy || data.changes.length > 0}
              >
                {running ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {running
                  ? "Testing the repairs…"
                  : run
                    ? "Run a fresh rehearsal"
                    : "Run rehearsal"}
              </button>
            )}
            <span className="run-footnote">
              {ready ? (
                <>
                  <Clock3 size={12} />
                  {Math.max(0, Math.ceil(run!.proposal!.expires_at - now))}s to
                  approve · rechecked before apply
                </>
              ) : mode === "guided" ? (
                "Fixed tool sequence. No model inference."
              ) : (
                `${data.provider.model} chooses the tool calls.`
              )}
            </span>
          </div>
        </aside>
      </div>
      {(stale || (expired && !resolved)) && (
        <div className="notice">
          <Clock3 size={17} />
          <div>
            <strong>
              {stale
                ? "The company evidence changed."
                : "This proposal has expired."}
            </strong>
            <span> Run a fresh rehearsal before approving a repair.</span>
          </div>
        </div>
      )}
      {run?.message && (
        <div className="notice">
          <span>{run.message}</span>
        </div>
      )}
      <Experiments run={run} running={running} onTrial={onTrial} />
      <div className="evidence-strip">
        <div>
          <FileText size={16} />
          <span>Grounded in company evidence</span>
        </div>
        <button onClick={() => onSource("alder-agreement")}>
          Alder agreement <ArrowUpRight size={13} />
        </button>
        <button onClick={() => onSource("cache-policy")}>
          Cache policy · r
          {data.context.sources.find((s) => s.key === "cache-policy")?.revision}{" "}
          <ArrowUpRight size={13} />
        </button>
        <button onClick={() => onSource("ownership")}>
          Current ownership <ArrowUpRight size={13} />
        </button>
      </div>
      {run && (
        <footer className="run-footer">
          <span>
            {run.mode === "guided" ? "Guided rehearsal" : "Live agent"} ·{" "}
            {run.events.length} tool calls ·{" "}
            {run.trials.reduce((n, t) => n + t.checks.length, 0)} recorded
            checks
          </span>
          <button className="text-button" onClick={onTrace}>
            <Code2 size={14} /> Inspect execution trace
          </button>
        </footer>
      )}
    </>
  );
}
