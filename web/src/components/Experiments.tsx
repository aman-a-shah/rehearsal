import {
  ArrowUpRight,
  Check,
  Database,
  History,
  LoaderCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { REPAIRS, type Run, type Repair, type Trial } from "../types";

const icons = { rollback: History, bypass: SlidersHorizontal, cache: Database };

export function Experiments({
  run,
  running,
  onTrial,
}: {
  run: Run | null;
  running: boolean;
  onTrial: (trial: Trial) => void;
}) {
  const kinds: Repair[] = ["rollback", "bypass", "cache"];
  return (
    <section className="experiments" aria-labelledby="experiments-title">
      <div className="section-bar">
        <div>
          <h2 id="experiments-title">Three options. Test every promise.</h2>
          <p>Each repair runs on its own copy of the export service.</p>
        </div>
        <span className="small-muted">
          {run?.trials.length || 0} / 3 tested
        </span>
      </div>
      <div className="experiment-table">
        <div className="experiment-head">
          <span>Candidate repair</span>
          <span>HTTP response</span>
          <span>Customer promises</span>
          <span>Verdict</span>
        </div>
        {kinds.map((kind, index) => {
          const trial = run?.trials.find((t) => t.repair === kind);
          const Icon = icons[kind];
          const affected = run?.context.affected || ["alder", "beacon"];
          const responsesOk =
            trial && affected.every((id) => trial.exports[id]?.status === 200);
          const promisesOk =
            trial &&
            trial.checks
              .filter((c) =>
                [
                  "provenance",
                  "integrity",
                  "cache_age",
                  "cache_allowed",
                ].includes(c.key),
              )
              .every((c) => c.passed);
          const working =
            running && !trial && index === (run?.trials.length || 0);
          return (
            <button
              key={kind}
              className={`experiment-row ${trial?.passed ? "passing" : ""}`}
              onClick={() => trial && onTrial(trial)}
              disabled={!trial}
            >
              <span className="experiment-name">
                <span className="row-number">0{index + 1}</span>
                <span className="repair-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{REPAIRS[kind].name}</strong>
                  <small>{REPAIRS[kind].description}</small>
                </span>
              </span>
              <span className="result-cell" data-label="HTTP">
                {trial ? (
                  <>
                    <i className={responsesOk ? "good-dot" : "bad-dot"} />
                    {responsesOk ? "200 OK" : "409 · Incompatible"}
                  </>
                ) : (
                  <span className="untested">Not tested</span>
                )}
              </span>
              <span className="result-cell" data-label="Promises">
                {trial ? (
                  <>
                    <span className={promisesOk ? "good-text" : "bad-text"}>
                      {promisesOk ? <Check size={14} /> : <X size={14} />}
                    </span>
                    {promisesOk
                      ? "Preserved"
                      : kind === "bypass"
                        ? "Provenance missing"
                        : kind === "cache"
                          ? "Policy not satisfied"
                          : "Output unavailable"}
                  </>
                ) : (
                  <span className="untested">Not tested</span>
                )}
              </span>
              <span className="verdict">
                {trial ? (
                  <>
                    <span
                      className={`status-tag ${trial.passed ? "success" : "neutral"}`}
                    >
                      {trial.passed ? "Recommended" : "Rejected"}
                    </span>
                    <ArrowUpRight size={15} />
                  </>
                ) : working ? (
                  <span className="working">
                    <LoaderCircle className="spin" size={15} /> Testing
                  </span>
                ) : (
                  <span className="muted">Pending</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {run?.trials.some(
        (t) =>
          t.repair === "bypass" && !t.passed && t.exports.alder?.status === 200,
      ) && (
        <p className="experiment-insight">
          <span className="insight-mark">!</span>
          <span>
            <strong>A healthy response can still break a promise.</strong>{" "}
            Bypassing enrichment returns HTTP 200, but removes the provenance
            Alder requires.
          </span>
        </p>
      )}
    </section>
  );
}
