import { ArrowUpRight, Check, Circle, Download, X } from "lucide-react";
import { REPAIRS, type Repair, type Run } from "../types";

export function eventLabel(event: Run["events"][number]) {
  const args = event.arguments as { repair?: Repair; source_key?: string };
  if (event.tool === "inspect_context")
    return "Read customer dependencies and requirements";
  if (event.tool === "read_source") return `Read source: ${args.source_key}`;
  if (event.tool === "rehearse_repair")
    return `Tested ${args.repair ? REPAIRS[args.repair]?.name.toLowerCase() : "repair"}`;
  if (event.tool === "recommend_repair")
    return args.repair
      ? "Proposed a repair that passed every check"
      : "Escalated: no candidate meets the requirements";
  return event.tool;
}

export function RunTimeline({
  run,
  running,
  onTrace,
}: {
  run: Run | null;
  running: boolean;
  onTrace?: () => void;
}) {
  if (!run)
    return (
      <div className="timeline-empty">
        <Circle size={25} />
        <h2>No investigation yet</h2>
        <p>
          Run a rehearsal to see its tool calls, results, and recommendation.
        </p>
      </div>
    );
  return (
    <section className="run-timeline">
      <div className="section-bar">
        <div>
          <h2>Execution timeline</h2>
          <span className="small-muted">
            {run.mode === "live" ? "Live investigator" : "Guided demo"}
          </span>
        </div>
        <a
          className="text-button"
          href={`/api/runs/${run.id}/evidence`}
          download
        >
          <Download size={14} />
          Export evidence
        </a>
      </div>
      <div className="timeline-origin">
        <span className="timeline-point" />
        <div>
          <strong>Rehearsal started</strong>
          <p className="mono">{run.id}</p>
        </div>
        <time>
          {new Date(run.created_at * 1000).toLocaleTimeString([], {
            hour12: false,
          })}
        </time>
      </div>
      {run.events.map((event, index) => (
        <details className="timeline-event" key={index}>
          <summary>
            <span
              className={`timeline-point ${event.status === "ok" ? "ok" : "error"}`}
            >
              {event.status === "ok" ? <Check size={12} /> : <X size={12} />}
            </span>
            <div>
              <strong>{eventLabel(event)}</strong>
              <p>
                <code>{event.tool}</code>
                <span>{event.duration_ms} ms</span>
              </p>
            </div>
            <time>
              {new Date(event.at * 1000).toLocaleTimeString([], {
                hour12: false,
              })}
            </time>
          </summary>
          <div className="timeline-detail">
            <pre>{JSON.stringify(event.arguments, null, 2)}</pre>
            {event.message && <p>{event.message}</p>}
          </div>
        </details>
      ))}
      <div className="timeline-origin">
        <span className={`timeline-point ${running ? "active" : ""}`} />
        <div>
          <strong>
            {running
              ? "Investigation in progress…"
              : run.status === "completed"
                ? "Repair approved and recovery verified"
                : run.status === "awaiting_approval"
                  ? "Waiting for owner approval"
                  : run.status === "blocked"
                    ? "No repair meets the current requirements"
                    : "Investigation stopped"}
          </strong>
          <p>
            {run.recommendation?.reason ||
              run.message ||
              "Trials run on copies of the active service."}
          </p>
        </div>
      </div>
      {run.usage && (
        <div className="usage-strip">
          <span>
            {run.usage.provider || "Model"} / {run.usage.model}
          </span>
          <span>
            {(
              run.usage.input_tokens + run.usage.output_tokens
            ).toLocaleString()}{" "}
            tokens
          </span>
          <span>
            {run.usage.cost_usd != null
              ? `$${run.usage.cost_usd.toFixed(4)} reported`
              : "Cost not reported"}
          </span>
        </div>
      )}
      {run.memory_sync && (
        <p className="memory-status" role="status">
          {run.memory_sync === "saved"
            ? "Verified recovery saved to Backboard memory. Future investigations can recall this evidence."
            : run.memory_sync === "pending"
              ? "Saving the verified recovery to Backboard memory…"
              : "Recovery is saved locally. Backboard memory sync failed; retry approval to retry the sync."}
        </p>
      )}
      {onTrace && (
        <button className="text-button" onClick={onTrace}>
          Inspect full execution trace <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}
