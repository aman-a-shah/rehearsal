import { ArrowUpRight, Check, Minus, X } from "lucide-react";
import { REPAIRS, type Run, type Repair, type Trial } from "../types";

const groups = [
  { id: "available", label: "Availability", keys: ["available"] },
  { id: "integrity", label: "Data integrity", keys: ["integrity"] },
  { id: "provenance", label: "Provenance", keys: ["provenance"] },
  { id: "freshness", label: "Freshness", keys: ["cache_age", "cache_allowed"] },
  { id: "control", label: "No regression", keys: ["control"] },
];
const mutations: Record<Repair, string> = {
  rollback: "worker.version → 1",
  bypass: "enrichment → bypass",
  cache: "enrichment → verified cache",
};

export function Experiments({
  run,
  running,
  onTrial,
  trials: inputTrials,
  compact = false,
}: {
  run?: Run | null;
  running?: boolean;
  onTrial: (trial: Trial) => void;
  trials?: Trial[];
  compact?: boolean;
}) {
  const trials = inputTrials || run?.trials || [];
  return (
    <section
      className={`experiments ${compact ? "compact" : ""}`}
      aria-labelledby="experiments-title"
    >
      <div className="section-bar">
        <div>
          <span className="section-index">02</span>
          <h2 id="experiments-title">Repair comparison</h2>
          <span className="small-muted">
            Results from isolated service trials
          </span>
        </div>
        <span className="mono small-muted">{trials.length}/3 tested</span>
      </div>
      <div className="comparison-scroll">
        <div className="experiment-table">
          <div className="experiment-head">
            <span>Candidate</span>
            {groups.map((g) => (
              <span key={g.id}>{g.label}</span>
            ))}
            <span>Decision</span>
          </div>
          {(["rollback", "bypass", "cache"] as Repair[]).map((kind, index) => {
            const trial = trials.find((t) => t.repair === kind);
            return (
              <button
                key={kind}
                className={`experiment-row ${trial?.passed ? "passing" : ""}`}
                disabled={!trial}
                onClick={() => trial && onTrial(trial)}
              >
                <span className="experiment-name">
                  <span className="row-number">0{index + 1}</span>
                  <span>
                    <strong>{REPAIRS[kind].name}</strong>
                    <small>{mutations[kind]}</small>
                  </span>
                </span>
                {groups.map((group) => {
                  const checks = trial?.checks.filter((c) =>
                    group.keys.includes(c.key),
                  );
                  const pass = checks?.every((c) => c.passed);
                  return (
                    <span
                      className="matrix-cell"
                      key={group.id}
                      data-label={group.label}
                    >
                      {!trial ? (
                        <span className="unrun-line" aria-label="Not tested">
                          —
                        </span>
                      ) : !checks?.length ? (
                        <span className="matrix-na" title="Not applicable">
                          <Minus size={14} />
                          <span className="sr-only">Not applicable</span>
                        </span>
                      ) : (
                        <span
                          className={`matrix-check ${pass ? "pass" : "fail"}`}
                          title={
                            checks
                              .filter((c) => !c.passed)
                              .map((c) => c.title)
                              .join(", ") || "All checks passed"
                          }
                        >
                          {pass ? <Check size={13} /> : <X size={13} />}
                          <span className="sr-only">
                            {pass ? "Passed" : "Failed"}
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}
                <span className="verdict">
                  {trial ? (
                    <>
                      <span
                        className={`status-tag ${trial.passed ? "success" : "rejected"}`}
                      >
                        {trial.passed ? "Eligible" : "Rejected"}
                      </span>
                      <ArrowUpRight size={13} />
                    </>
                  ) : (
                    <span className="small-muted">
                      {running ? "In progress" : "Not tested"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {trials.some(
        (t) =>
          t.repair === "bypass" && !t.passed && t.exports.alder?.status === 200,
      ) && (
        <div className="experiment-insight">
          <span className="insight-marker">!</span>
          <span>
            <strong>Bypass drops Alder’s required provenance.</strong> Its HTTP
            200 response still fails the customer’s requirement.
          </span>
          <button
            className="text-button"
            onClick={() => onTrial(trials.find((t) => t.repair === "bypass")!)}
          >
            Inspect output <ArrowUpRight size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
