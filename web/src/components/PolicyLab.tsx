import { useState } from "react";
import {
  ArrowRight,
  Check,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { request } from "../useWorkspace";
import { Experiments } from "./Experiments";
import { REPAIRS, type Simulation, type Trial, type Workspace } from "../types";

export function PolicyLab({
  data,
  onTrial,
  onSource,
}: {
  data: Workspace;
  onTrial: (trial: Trial) => void;
  onSource: (key: string) => void;
}) {
  const defaultLimit = Number(data.context.values["worker:cache_max_age"]);
  const defaultProvenance = Boolean(
    data.context.values["alder:requires_provenance"],
  );
  const [limit, setLimit] = useState(defaultLimit);
  const [age, setAge] = useState(720);
  const [provenance, setProvenance] = useState(defaultProvenance);
  const [result, setResult] = useState<Simulation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const changed =
    result &&
    (result.assumptions.cache_max_age !== limit ||
      result.assumptions.cache_age !== age ||
      result.assumptions.requires_provenance !== provenance);
  const valid = [limit, age].every(
    (v) => Number.isInteger(v) && v >= 0 && v <= 86400,
  );
  async function simulate() {
    if (!valid) return;
    setPending(true);
    setError("");
    try {
      setResult(
        await request<Simulation>("/simulations", {
          cache_max_age: limit,
          cache_age: age,
          requires_provenance: provenance,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="policy-lab">
      <div className="lab-heading">
        <div>
          <span className="eyebrow">Policy experiments</span>
          <h2>Policy lab</h2>
          <p>
            Test the same incident with a different cache limit or provenance
            requirement.
          </p>
        </div>
        <span className="status-tag neutral">
          <FlaskConical size={13} />
          Hypothetical
        </span>
      </div>
      <div className="scenario-presets" aria-label="Scenario presets">
        <span>Start with a scenario</span>
        <button
          disabled={pending}
          onClick={() => {
            setLimit(defaultLimit);
            setAge(720);
            setProvenance(defaultProvenance);
          }}
        >
          <span>01</span>Current requirements
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setLimit(600);
            setAge(720);
            setProvenance(true);
          }}
        >
          <span>02</span>Stricter freshness
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setLimit(600);
            setAge(720);
            setProvenance(false);
          }}
        >
          <span>03</span>Optional provenance
        </button>
      </div>
      <div className="lab-controls">
        <div className="lab-control">
          <label htmlFor="lab-limit">
            Maximum cache age <span>Policy constraint</span>
          </label>
          <div className="lab-number">
            <input
              id="lab-limit"
              type="number"
              min={0}
              max={86400}
              value={Number.isNaN(limit) ? "" : limit}
              onChange={(e) => setLimit(e.target.valueAsNumber)}
              disabled={pending}
            />
            <span>seconds</span>
          </div>
          <input
            type="range"
            aria-label="Adjust maximum cache age"
            min={0}
            max={1800}
            step={30}
            value={Math.min(1800, limit || 0)}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={pending}
          />
          <div className="range-labels">
            <span>0 min</span>
            <span>30 min</span>
          </div>
        </div>
        <div className="lab-control">
          <label htmlFor="lab-age">
            Simulated cache age <span>Service condition</span>
          </label>
          <div className="lab-number">
            <input
              id="lab-age"
              type="number"
              min={0}
              max={86400}
              value={Number.isNaN(age) ? "" : age}
              onChange={(e) => setAge(e.target.valueAsNumber)}
              disabled={pending}
            />
            <span>seconds</span>
          </div>
          <input
            type="range"
            aria-label="Adjust simulated cache age"
            min={0}
            max={1800}
            step={30}
            value={Math.min(1800, age || 0)}
            onChange={(e) => setAge(Number(e.target.value))}
            disabled={pending}
          />
          <div className="range-labels">
            <span>Fresh</span>
            <span>30 min</span>
          </div>
        </div>
        <div className="lab-control">
          <label htmlFor="lab-provenance">
            Alder’s provenance <span>Customer requirement</span>
          </label>
          <label className="checkbox-option">
            <input
              id="lab-provenance"
              type="checkbox"
              checked={provenance}
              disabled={pending}
              onChange={(e) => setProvenance(e.target.checked)}
            />
            <span>Require verified provenance</span>
          </label>
          <p className="small-muted">
            Provenance identifies where the report data came from.
          </p>
          <button
            className="text-button"
            onClick={() => onSource("alder-agreement")}
          >
            Read current agreement <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="lab-action">
        <p>
          <FlaskConical size={15} />
          Simulation only. Company policy and the active service stay unchanged.
        </p>
        <button
          className="primary"
          disabled={pending || !valid}
          onClick={() => void simulate()}
        >
          {pending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <FlaskConical size={15} />
          )}
          {pending ? "Running isolated trials…" : "Run simulation"}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {result ? (
        <div className={`simulation-result ${changed ? "outdated" : ""}`}>
          <div
            className={`simulation-verdict ${result.eligible.length ? "positive" : "negative"}`}
            role="status"
          >
            <span className="simulation-count">
              {result.eligible.length}
              <small>/ 3</small>
            </span>
            <div>
              <h3>
                {result.eligible.length
                  ? `${result.eligible.length === 1 ? "One repair is" : `${result.eligible.length} repairs are`} eligible under these conditions.`
                  : "No repair satisfies these conditions."}
              </h3>
              <p>
                {changed
                  ? "Inputs changed. Run the simulation again to update these results."
                  : result.recommendation
                    ? `${REPAIRS[result.recommendation].name} passes the executable checks.`
                    : "All three repairs failed a requirement. The service owner needs another option."}
              </p>
            </div>
            <span className="mono small-muted">{result.duration_ms} ms</span>
          </div>
          <Experiments trials={result.trials} onTrial={onTrial} compact />
          <div className="simulation-meta">
            <span>
              {result.trials.reduce((n, t) => n + t.checks.length, 0)} checks
              executed · no model inference
            </span>
            <button
              className="text-button"
              onClick={() => {
                setLimit(defaultLimit);
                setAge(720);
                setProvenance(defaultProvenance);
                setResult(null);
              }}
            >
              <RotateCcw size={13} />
              Reset experiment
            </button>
          </div>
        </div>
      ) : (
        <div className="lab-empty">
          <span className="empty-crosshair">
            <FlaskConical size={23} />
          </span>
          <div>
            <h3>Try a stricter cache limit</h3>
            <p>
              Try a 600-second freshness limit with a 720-second cache. Then
              remove the provenance requirement and compare.
            </p>
          </div>
          <Check size={17} />
        </div>
      )}
    </section>
  );
}
