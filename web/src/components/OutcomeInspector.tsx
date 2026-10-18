import { useState } from "react";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
import { type Output, type RequestSpan, type Trial, titleCase } from "../types";

function JsonCode({
  value,
  other,
  side,
}: {
  value: Record<string, unknown>;
  other?: Record<string, unknown>;
  side?: "before" | "after";
}) {
  const comparison = new Set(
    other ? JSON.stringify(other, null, 2).split("\n") : [],
  );
  return (
    <pre className="response-code" tabIndex={0}>
      {JSON.stringify(value, null, 2)
        .split("\n")
        .map((line, i) => (
          <span
            key={i}
            className={
              other && !comparison.has(line)
                ? `code-line ${side}-change`
                : "code-line"
            }
          >
            <span className="line-number" aria-hidden="true">
              {i + 1}
            </span>
            <code>{line || " "}</code>
            {"\n"}
          </span>
        ))}
    </pre>
  );
}

function RequestTrace({ spans }: { spans: RequestSpan[] }) {
  if (!spans.length)
    return (
      <p className="inspector-empty">
        No HTTP trace was recorded for this historical trial.
      </p>
    );
  const start = Math.min(...spans.map((s) => s.start_ms));
  const duration =
    Math.max(...spans.map((s) => s.start_ms + s.duration_ms)) - start;
  return (
    <div className="request-trace">
      <div className="trace-axis">
        <span>Request / service</span>
        <span>
          0 ms <span>{duration.toFixed(2)} ms</span>
        </span>
        <span>Status</span>
      </div>
      {spans.map((span) => (
        <details className="trace-span" key={span.id}>
          <summary>
            <span
              className={span.parent_id ? "span-name child-span" : "span-name"}
            >
              <ChevronDown size={11} />
              <code>
                {span.method} {span.path}
              </code>
              <small>{span.service}</small>
            </span>
            <span className="span-track">
              <span
                className={`span-bar ${span.status >= 400 ? "failed" : "passed"}`}
                style={{
                  marginLeft: `${((span.start_ms - start) / Math.max(duration, 0.001)) * 100}%`,
                  width: `${Math.max(1, (span.duration_ms / Math.max(duration, 0.001)) * 100)}%`,
                }}
              >
                {span.duration_ms.toFixed(2)} ms
              </span>
            </span>
            <code className={span.status >= 400 ? "bad-text" : "good-text"}>
              {span.status}
            </code>
          </summary>
          <div className="span-payloads">
            {span.request && (
              <div>
                <h4>Request body</h4>
                <JsonCode value={span.request} />
              </div>
            )}
            <div>
              <h4>Response body</h4>
              <JsonCode value={span.response} />
            </div>
          </div>
        </details>
      ))}
      <p className="trace-footnote">
        Recorded from the actual local HTTP handlers. Expand a request to
        inspect its payload.
      </p>
    </div>
  );
}

export function OutcomeInspector({
  trial,
  outputs,
}: {
  trial?: Trial;
  outputs: Record<string, Output>;
}) {
  const [customer, setCustomer] = useState("alder");
  const [tab, setTab] = useState<"output" | "trace" | "checks">("output");
  const [phase, setPhase] = useState<"before" | "after">("before");
  const before = trial?.before[customer] || outputs[customer];
  const after = trial?.exports[customer];
  const checks =
    trial?.checks.filter((c) => !c.customer || c.customer === customer) || [];
  return (
    <section
      className="outcome-inspector"
      aria-label="Response inspector"
      tabIndex={0}
    >
      <header className="inspector-toolbar">
        <div className="inspector-views" aria-label="Evidence display">
          {(
            [
              ["output", "Output diff"],
              ["trace", "HTTP trace"],
              ["checks", "Checks"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              disabled={!trial && id !== "output"}
            >
              {label}
              {id === "checks" && trial && <span>{checks.length}</span>}
            </button>
          ))}
        </div>
        <label className="customer-select">
          <span>Customer</span>
          <select
            aria-label="Inspect customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            {Object.keys(outputs).map((id) => (
              <option key={id} value={id}>
                {titleCase(id)}
              </option>
            ))}
          </select>
        </label>
      </header>
      {tab === "output" ? (
        <div className={`output-comparison ${after ? "" : "baseline-only"}`}>
          <div className="output-pane">
            <div className="output-pane-label">
              <span>
                {after ? "Before repair" : "Current response"}{" "}
                <code>GET /exports/{customer}</code>
              </span>
              <b className={before.status === 200 ? "good-text" : "bad-text"}>
                HTTP {before.status}
              </b>
            </div>
            <JsonCode value={before.body} other={after?.body} side="before" />
          </div>
          {after && (
            <div className="output-pane">
              <div className="output-pane-label">
                <span>
                  After repair <ArrowRight size={12} />
                </span>
                <b className={after.status === 200 ? "good-text" : "bad-text"}>
                  HTTP {after.status}
                </b>
              </div>
              <JsonCode value={after.body} other={before.body} side="after" />
            </div>
          )}
        </div>
      ) : tab === "trace" ? (
        <>
          <div className="trace-phase">
            <div className="segmented">
              <button
                aria-pressed={phase === "before"}
                onClick={() => setPhase("before")}
              >
                Before repair
              </button>
              <button
                aria-pressed={phase === "after"}
                onClick={() => setPhase("after")}
              >
                After repair
              </button>
            </div>
            <span>Measured execution · {titleCase(customer)}</span>
          </div>
          <RequestTrace
            spans={
              trial?.trace?.[phase].filter((s) => s.customer === customer) || []
            }
          />
        </>
      ) : (
        <div className="inline-checks">
          {checks.map((check, i) => (
            <details key={i}>
              <summary>
                <span className={check.passed ? "good-text" : "bad-text"}>
                  {check.passed ? <Check size={14} /> : <X size={14} />}
                </span>
                <span>{check.title}</span>
                <small>{check.passed ? "Passed" : "Failed"}</small>
              </summary>
              <div>
                <p>
                  Expected <code>{JSON.stringify(check.expected)}</code>
                </p>
                <p>
                  Observed <code>{JSON.stringify(check.actual)}</code>
                </p>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
