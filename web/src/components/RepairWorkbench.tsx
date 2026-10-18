import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  FileText,
  GitBranch,
  Play,
  X,
} from "lucide-react";
import { ImpactMap } from "./ImpactMap";
import { OutcomeInspector } from "./OutcomeInspector";
import {
  PEOPLE,
  REPAIRS,
  type Repair,
  type Run,
  type Trial,
  type Workspace,
} from "../types";

const repairs: Repair[] = ["rollback", "bypass", "cache"];
const changes: Record<Repair, { before: string; after: string }> = {
  rollback: { before: "worker.version = 2", after: "worker.version = 1" },
  bypass: {
    before: 'enrichment.mode = "live"',
    after: 'enrichment.mode = "bypass"',
  },
  cache: {
    before: 'enrichment.mode = "live"',
    after: 'enrichment.mode = "cache"',
  },
};
const groups = [
  { title: "Availability", keys: ["available"] },
  { title: "Original report data", keys: ["integrity"] },
  { title: "Required provenance", keys: ["provenance"] },
  { title: "Cache freshness", keys: ["cache_age", "cache_allowed"] },
  { title: "Unaffected customers", keys: ["control"] },
];

export function RepairWorkbench({
  data,
  run,
  running,
  now,
  onTrial,
  onNode,
  onSource,
  onTrace,
  onGraphTrace,
  onRun,
}: {
  data: Workspace;
  run: Run | null;
  running: boolean;
  now: number;
  onTrial: (trial: Trial) => void;
  onNode: (id: string, trial?: Trial) => void;
  onSource: (id: string) => void;
  onTrace: () => void;
  onGraphTrace: () => void;
  onRun: () => void;
}) {
  const [selected, setSelected] = useState<Repair | "baseline">("baseline");
  useEffect(() => {
    setSelected("baseline");
  }, [run?.id]);
  useEffect(() => {
    if (run?.status === "completed") setSelected("baseline");
    else if (run?.proposal) setSelected(run.proposal.repair);
  }, [run?.proposal, run?.status]);
  const trial = run?.trials.find((t) => t.repair === selected);
  const broken = Object.values(data.exports).filter(
    (o) => o.status !== 200,
  ).length;
  const failed = trial?.checks.filter((c) => !c.passed) || [];
  const passed = trial ? trial.checks.length - failed.length : 0;
  const age = Math.max(0, Math.floor(now - data.runtime.cache.timestamp));
  const limit = Number(data.context.values["worker:cache_max_age"]);
  const selectedTitle =
    selected === "baseline" ? "Active service" : REPAIRS[selected].name;
  return (
    <div className="repair-studio">
      <aside className="branch-rail" aria-label="Repair branches">
        <div className="panel-caption">
          <span>Repair branches</span>
          <span className="mono">{run?.trials.length || 0}/3</span>
        </div>
        <button
          className={`branch-row baseline-branch ${selected === "baseline" ? "selected" : ""}`}
          aria-pressed={selected === "baseline"}
          onClick={() => setSelected("baseline")}
        >
          <span className="branch-icon">
            <Circle size={14} />
          </span>
          <span>
            <strong>Active service</strong>
            <small>
              {broken ? `${broken} exports failing` : "Recovery verified"}
            </small>
          </span>
          <span className={`branch-led ${broken ? "failed" : "passed"}`} />
        </button>
        <div className="branch-divider">
          <span>Isolated trials</span>
        </div>
        {repairs.map((repair, i) => {
          const result = run?.trials.find((t) => t.repair === repair);
          const failureCount =
            result?.checks.filter((c) => !c.passed).length || 0;
          return (
            <button
              key={repair}
              className={`branch-row ${selected === repair ? "selected" : ""}`}
              aria-pressed={selected === repair}
              disabled={!result}
              onClick={() => setSelected(repair)}
              title={REPAIRS[repair].name}
            >
              <span className="branch-index">0{i + 1}</span>
              <span>
                <strong>{REPAIRS[repair].short}</strong>
                <small>
                  {result
                    ? result.passed
                      ? "All requirements pass"
                      : `${failureCount} ${failureCount === 1 ? "check" : "checks"} failed`
                    : running
                      ? "Waiting for result"
                      : "Not tested"}
                </small>
              </span>
              <span
                className={`branch-led ${result ? (result.passed ? "passed" : "failed") : ""}`}
              />
            </button>
          );
        })}
        <div className="branch-rail-note">
          <GitBranch size={14} />
          <p>Each branch runs against its own copy of the service.</p>
        </div>
        <div className="branch-run-summary">
          <span className="panel-caption">Investigator</span>
          <strong>
            {run?.mode === "live" ? "Backboard agent" : "Guided demo"}
          </strong>
          <span>
            {running
              ? "Executing tools…"
              : run
                ? `${run.events.length} tool calls recorded`
                : "Ready to investigate"}
          </span>
          {run?.usage && (
            <span className="mono">
              {(
                run.usage.input_tokens + run.usage.output_tokens
              ).toLocaleString()}{" "}
              tokens ·{" "}
              {run.usage.cost_usd != null
                ? `$${run.usage.cost_usd.toFixed(3)}`
                : "cost unavailable"}
            </span>
          )}
          <button onClick={onTrace}>
            Execution log <ArrowUpRight size={12} />
          </button>
        </div>
      </aside>
      <div className="studio-center">
        <div className="canvas-context">
          <span>
            <i className={trial ? "preview-dot" : "bad-dot"} />
            {trial ? "Trial preview" : "Observed state"}
            <span className="canvas-slash">/</span>
            <strong>{selectedTitle}</strong>
          </span>
          <span className="mono">
            context r{run?.context.revision || data.context.revision}
          </span>
        </div>
        <ImpactMap
          data={data}
          trial={trial}
          onNode={(id) => onNode(id, trial)}
          onTrace={onGraphTrace}
        />
        <OutcomeInspector
          key={trial?.repair || "baseline"}
          trial={trial}
          outputs={data.exports}
        />
      </div>
      <aside className="verifier-panel" aria-label="Verification result">
        <div className="panel-caption">
          <span>Verification</span>
          <span className="mono">
            {trial ? `${passed}/${trial.checks.length}` : "—"}
          </span>
        </div>
        <div
          className={`verification-heading ${trial ? (trial.passed ? "passed" : "failed") : ""}`}
        >
          <span className="verification-symbol">
            {trial ? (
              trial.passed ? (
                <Check size={22} />
              ) : (
                <X size={22} />
              )
            ) : (
              <span>!</span>
            )}
          </span>
          <h2>
            {trial
              ? trial.passed
                ? "Eligible for approval"
                : "Repair rejected"
              : broken
                ? "Customer impact confirmed"
                : "Recovery verified"}
          </h2>
          <p>
            {trial
              ? trial.passed
                ? "The exported report passes the current checks."
                : trial.repair === "bypass"
                  ? "Alder’s report is missing required provenance."
                  : trial.repair === "rollback"
                    ? "The older worker cannot read the current schema."
                    : "The cache does not meet the current requirements."
              : broken
                ? "Alder and Beacon cannot export. Cedar is the unaffected control."
                : "The approved change is active. Its receipt is in the decision log."}
          </p>
        </div>
        {trial ? (
          <>
            <div
              className="check-meter"
              aria-label={`${passed} of ${trial.checks.length} checks passed`}
            >
              {trial.checks.map((c, i) => (
                <span
                  key={i}
                  className={c.passed ? "passed" : "failed"}
                  title={c.title}
                />
              ))}
            </div>
            <div className="requirement-list">
              {groups.map((group) => {
                const checks = trial.checks.filter((c) =>
                  group.keys.includes(c.key),
                );
                const pass = checks.every((c) => c.passed);
                return (
                  <div key={group.title}>
                    <span>{group.title}</span>
                    <span
                      className={
                        !checks.length
                          ? "muted"
                          : pass
                            ? "good-text"
                            : "bad-text"
                      }
                    >
                      {checks.length ? (
                        pass ? (
                          <Check size={14} />
                        ) : (
                          <X size={14} />
                        )
                      ) : (
                        "—"
                      )}
                      <span className="sr-only">
                        {checks.length
                          ? pass
                            ? "Passed"
                            : "Failed"
                          : "Not applicable"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mutation-preview">
              <h3>Tested change</h3>
              <code className="removed">− {changes[trial.repair].before}</code>
              <code className="added">+ {changes[trial.repair].after}</code>
            </div>
            <button className="evidence-open" onClick={() => onTrial(trial)}>
              Open full evidence <ArrowUpRight size={14} />
            </button>
          </>
        ) : (
          <>
            <dl className="incident-facts">
              <div>
                <dt>Affected customers</dt>
                <dd>{broken} / 3</dd>
              </div>
              <div>
                <dt>Cache age / limit</dt>
                <dd className={age > limit ? "bad-text" : ""}>
                  {Math.floor(age / 60)}m / {Math.floor(limit / 60)}m
                </dd>
              </div>
              <div>
                <dt>Accountable owner</dt>
                <dd>
                  {PEOPLE[String(data.context.values["worker:owner"])]?.name}
                </dd>
              </div>
            </dl>
            {!run && (
              <button
                className="evidence-open"
                disabled={running || data.changes.length > 0}
                onClick={onRun}
              >
                <Play size={12} />
                Test the three repairs <ArrowRight size={13} />
              </button>
            )}
          </>
        )}
        <div className="verifier-sources">
          <h3>Current constraints</h3>
          {[
            ["alder-agreement", "Provenance is required"],
            ["cache-policy", `Cache age ≤ ${limit} seconds`],
            ["schema", "Worker must support schema v2"],
          ].map(([key, label], i) => (
            <button key={key} onClick={() => onSource(key)}>
              <span className="source-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{label}</span>
              <FileText size={13} />
            </button>
          ))}
        </div>
        <p className="verifier-footnote">
          {trial
            ? "Isolated preview. Owner approval required to apply."
            : "Actual output · synthetic Harbor workspace"}
        </p>
      </aside>
    </div>
  );
}
