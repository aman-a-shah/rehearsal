import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  History,
  ListTodo,
} from "lucide-react";
import {
  PEOPLE,
  REPAIRS,
  titleCase,
  type Receipt,
  type Source,
  type Run,
} from "../types";

export function Decisions({
  receipts,
  onIncident,
  onReceipt,
  runs,
  onRun,
}: {
  receipts: Receipt[];
  onIncident: () => void;
  onReceipt: (receipt: Receipt) => void;
  runs: Run[];
  onRun: (run: Run) => void;
}) {
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Decision log</p>
        <h1>Decision log</h1>
        <p>
          The repair, its approver, the evidence, and the customer outcome. Kept
          together.
        </p>
      </header>
      {receipts.length ? (
        <div className="decision-list">
          {receipts.map((receipt) => (
            <button
              className="decision-row panel"
              key={receipt.run_id}
              onClick={() => onReceipt(receipt)}
            >
              <span
                className={`decision-icon ${receipt.verified ? "" : "warning"}`}
              >
                <CheckCircle2 size={24} />
              </span>
              <div>
                <span className="decision-date">
                  {new Date(receipt.approved_at * 1000).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <h2>{REPAIRS[receipt.repair].name}</h2>
                <p>
                  {receipt.scope.map(titleCase).join(" & ")} · Approved by{" "}
                  {PEOPLE[receipt.owner]?.name || receipt.owner}
                </p>
              </div>
              <span
                className={`status-tag ${receipt.verified ? "success" : "incident"}`}
              >
                {receipt.verified ? "Verified recovery" : "Needs review"}
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-illustration">
            <span />
            <span />
            <span>
              <History size={28} />
            </span>
          </div>
          <h2>No approved repairs yet</h2>
          <p>
            Run a rehearsal and approve a passing repair. Its source records and
            verified outcome will appear here.
          </p>
          <button className="primary" onClick={onIncident}>
            Open the incident <ArrowRight size={16} />
          </button>
        </div>
      )}
      {runs.length > 0 && (
        <section className="run-archive">
          <div className="section-bar">
            <div>
              <h2>Rehearsal history</h2>
              <span className="small-muted">
                Completed, blocked, and interrupted investigations
              </span>
            </div>
            <span className="mono small-muted">{runs.length} runs</span>
          </div>
          <div className="archive-table">
            <div className="archive-head">
              <span>Investigation</span>
              <span>Mode</span>
              <span>Tests</span>
              <span>Outcome</span>
            </div>
            {runs.map((run) => (
              <button
                key={run.id}
                className="archive-row"
                onClick={() => onRun(run)}
              >
                <span>
                  <strong className="mono">{run.id.slice(0, 12)}</strong>
                  <small>
                    {new Date(run.created_at * 1000).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · context r{run.context.revision}
                  </small>
                </span>
                <span>
                  {run.mode === "live" ? "Live agent" : "Guided demo"}
                </span>
                <span>{run.trials.length}/3</span>
                <span
                  className={`status-tag ${run.status === "completed" ? "success" : run.status === "blocked" || run.status === "error" ? "incident" : "neutral"}`}
                >
                  {(
                    {
                      awaiting_approval: "Awaiting approval",
                      completed: "Verified",
                      blocked: "No eligible repair",
                      error: "Stopped",
                      queued: "Queued",
                      running: "Running",
                      interrupted: "Interrupted",
                    } as Record<string, string>
                  )[run.status] || run.status}
                  <ArrowRight size={12} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function DecisionContent({
  receipt,
  onSource,
}: {
  receipt: Receipt;
  onSource: (source: Source) => void;
}) {
  return (
    <>
      <div className="evidence-verdict passed">
        <CheckCircle2 size={24} />
        <div>
          <strong>
            {receipt.verified
              ? "Recovery verified"
              : "Execution requires review"}
          </strong>
          <p>{receipt.summary}</p>
        </div>
      </div>
      <div className="evidence-facts">
        <div>
          <span>Approved by</span>
          <strong>{PEOPLE[receipt.owner]?.name || receipt.owner}</strong>
        </div>
        <div>
          <span>Applied at</span>
          <strong>
            {new Date(receipt.approved_at * 1000).toLocaleString()}
          </strong>
        </div>
        <div>
          <span>Company context</span>
          <strong>Revision {receipt.context_revision}</strong>
        </div>
        <div>
          <span>Graph decision record</span>
          <strong>
            {receipt.graph_synced ? "Saved" : "Synchronization pending"}
          </strong>
        </div>
      </div>
      <h3>Verified customer output</h3>
      <div className="customer-outcomes">
        {Object.entries(receipt.exports || {}).map(([id, output]) => (
          <div key={id}>
            <span className="customer-avatar">{titleCase(id)[0]}</span>
            <strong>{titleCase(id)}</strong>
            <span className={output.status === 200 ? "good-text" : "bad-text"}>
              HTTP {output.status}
            </span>
            <small>
              {output.body.provenance_id
                ? "Provenance retained"
                : "Basic export preserved"}
            </small>
          </div>
        ))}
      </div>
      <div className="follow-up">
        <ListTodo size={20} />
        <div>
          <strong>Follow-up assigned to {PEOPLE[receipt.owner]?.name}</strong>
          <p>{receipt.follow_up}</p>
          <span className="status-tag neutral">Open</span>
        </div>
      </div>
      <h3>Evidence at the time of approval</h3>
      <p className="small-muted">
        These are the saved source revisions used by this decision.
      </p>
      <div className="review-sources">
        {receipt.sources
          .filter((s) => s.authoritative)
          .map((source) => (
            <button key={source.id} onClick={() => onSource(source)}>
              <FileText size={15} />
              <span>{source.title}</span>
              <small>r{source.revision}</small>
              <ArrowRight size={13} />
            </button>
          ))}
      </div>
      <a
        className="download-link"
        href={`/api/runs/${receipt.run_id}/evidence`}
        download
      >
        <Download size={15} /> Download evidence bundle
      </a>
    </>
  );
}
