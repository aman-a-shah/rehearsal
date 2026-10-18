import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  LoaderCircle,
  Play,
  X,
} from "lucide-react";
import { request } from "../useWorkspace";
import {
  REPAIRS,
  type Repair,
  type Sweep,
  type Trial,
  type Workspace,
} from "../types";

const repairs: Repair[] = ["rollback", "bypass", "cache"];

export function BoundaryTests({
  data,
  onTrial,
}: {
  data: Workspace;
  onTrial: (trial: Trial) => void;
}) {
  const [limit, setLimit] = useState(
    Number(data.context.values["worker:cache_max_age"]),
  );
  const [result, setResult] = useState<Sweep | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const stale =
    result &&
    (result.cache_max_age !== limit ||
      result.context_hash !== data.context.fingerprint);
  const valid = Number.isInteger(limit) && limit >= 0 && limit <= 86400;
  async function run() {
    setPending(true);
    setError("");
    try {
      setResult(
        await request<Sweep>("/simulations/sweep", { cache_max_age: limit }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `rehearsal-boundary-tests-${result?.created_at}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="boundary-tests">
      <header className="boundary-heading">
        <div>
          <span className="eyebrow">Experiment suite</span>
          <h2>Boundary tests</h2>
          <p>
            Replay every repair across cache ages and provenance requirements,
            using one frozen service snapshot.
          </p>
        </div>
        <span className="status-tag neutral">Hypothetical</span>
      </header>
      <div className="suite-toolbar">
        <label htmlFor="suite-limit">
          Maximum cache age
          <input
            id="suite-limit"
            type="number"
            min="0"
            max="86400"
            step="1"
            value={Number.isNaN(limit) ? "" : limit}
            onChange={(e) =>
              setLimit(e.target.value === "" ? NaN : Number(e.target.value))
            }
          />
          <span>seconds</span>
        </label>
        <span className="suite-method">
          At the boundary · ±1 second · fresh & aged cache
        </span>
        <button
          className="primary"
          disabled={pending || !valid}
          onClick={() => void run()}
        >
          {pending ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Play size={12} />
          )}{" "}
          {pending ? "Executing suite…" : "Run boundary tests"}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <p className="notice" role="status">
          Inputs or company evidence changed. Run the suite again to refresh
          these results.
        </p>
      )}
      {result ? (
        <div
          className={stale ? "suite-results stale-results" : "suite-results"}
        >
          <div className="suite-summary">
            <div>
              <strong>{result.summary.scenarios}</strong>
              <span>scenarios</span>
            </div>
            <div>
              <strong>{result.summary.trials}</strong>
              <span>executed trials</span>
            </div>
            <div>
              <strong>{result.summary.checks}</strong>
              <span>requirement checks</span>
            </div>
            <span className="mono">
              {(result.duration_ms / 1000).toFixed(2)}s local execution
            </span>
            <button
              className="text-button"
              onClick={download}
              disabled={!!stale}
            >
              <Download size={14} />
              Export results
            </button>
          </div>
          <div className="boundary-table-wrap">
            <table className="boundary-table">
              <caption className="sr-only">
                Repair eligibility across hypothetical cache age and provenance
                conditions
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cache age</th>
                  <th scope="col">Alder provenance</th>
                  {repairs.map((r) => (
                    <th scope="col" key={r}>
                      {REPAIRS[r].short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.cases.map((scenario, i) => (
                  <tr
                    key={i}
                    className={
                      scenario.assumptions.cache_age === result.cache_max_age
                        ? "boundary-row"
                        : ""
                    }
                  >
                    <th scope="row">
                      <code>{scenario.assumptions.cache_age}s</code>
                      {scenario.assumptions.cache_age ===
                        result.cache_max_age && (
                        <span className="boundary-marker">At limit</span>
                      )}
                    </th>
                    <td>
                      {scenario.assumptions.requires_provenance
                        ? "Required"
                        : "Optional"}
                    </td>
                    {scenario.trials.map((trial) => (
                      <td key={trial.repair}>
                        <button
                          className={`suite-cell ${trial.passed ? "passed" : "failed"}`}
                          onClick={() => onTrial(trial)}
                          aria-label={`${scenario.assumptions.cache_age} seconds, ${scenario.assumptions.requires_provenance ? "required" : "optional"} provenance, ${REPAIRS[trial.repair].short}: ${trial.passed ? "eligible" : "rejected"}`}
                        >
                          {trial.passed ? <Check size={14} /> : <X size={14} />}
                          <span>{trial.passed ? "Eligible" : "Rejected"}</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="suite-coverage">
            <h3>Eligible scenarios by repair</h3>
            {repairs.map((repair) => (
              <div key={repair}>
                <span>{REPAIRS[repair].short}</span>
                <span className="coverage-track">
                  <span
                    style={{
                      width: `${(result.summary.eligible[repair] / result.summary.scenarios) * 100}%`,
                    }}
                  />
                </span>
                <code>
                  {result.summary.eligible[repair]} / {result.summary.scenarios}
                </code>
              </div>
            ))}
          </div>
          <p className="suite-note">
            Select a result to inspect its output and checks. These trials test
            policy conditions; they do not measure model accuracy or change the
            active service.
          </p>
        </div>
      ) : (
        <div className="suite-introduction">
          <div className="boundary-illustration" aria-hidden="true">
            <span>FRESH</span>
            <i />
            <i />
            <i />
            <b>POLICY LIMIT</b>
            <i />
            <i />
            <span>AGED</span>
          </div>
          <h3>Test the freshness limit</h3>
          <p>
            Test the cache at its age limit and one second beyond it. Repeat
            with provenance required or optional.
          </p>
          <div>
            <span>One frozen snapshot</span>
            <span>Three competing repairs</span>
            <span>Inspectable output for every case</span>
          </div>
        </div>
      )}
    </section>
  );
}
