import { useState } from "react";
import {
  Check,
  X,
  ArrowRight,
  FileText,
  Download,
  ShieldCheck,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import {
  PEOPLE,
  REPAIRS,
  titleCase,
  type Trial,
  type Workspace,
  type Run,
  type Person,
  type Source,
} from "../types";

export function TrialEvidence({
  trial,
  onSource,
}: {
  trial: Trial;
  onSource: (key: string) => void;
}) {
  const [customer, setCustomer] = useState("alder");
  const [showBaseline, setShowBaseline] = useState(false);
  const output = trial.exports[customer];
  return (
    <>
      {trial.hypothetical && (
        <div className="callout">
          <strong>Hypothetical experiment</strong>
          <p>
            These results use the experiment’s stated assumptions. They cannot
            authorize an active-service change.
          </p>
        </div>
      )}
      <div className={`evidence-verdict ${trial.passed ? "passed" : "failed"}`}>
        {trial.passed ? <ShieldCheck size={22} /> : <X size={22} />}
        <div>
          <strong>
            {trial.passed
              ? "Every requirement passed"
              : "This repair is not eligible"}
          </strong>
          <p>
            {trial.checks.filter((c) => c.passed).length} of{" "}
            {trial.checks.length} checks passed · {trial.duration_ms} ms
          </p>
        </div>
      </div>
      <div className="evidence-facts">
        <div>
          <span>Action scope</span>
          <strong>{trial.scope.map(titleCase).join(", ")}</strong>
        </div>
        <div>
          <span>Execution</span>
          <strong>Isolated service copy</strong>
        </div>
      </div>
      <h3>Actual exported output</h3>
      <div className="segmented" aria-label="Customer export">
        {Object.keys(trial.exports).map((id) => (
          <button
            key={id}
            aria-pressed={customer === id}
            onClick={() => setCustomer(id)}
          >
            {titleCase(id)}
          </button>
        ))}
      </div>
      <button
        className="text-button baseline-toggle"
        aria-pressed={showBaseline}
        onClick={() => setShowBaseline(!showBaseline)}
      >
        {showBaseline ? "Hide baseline output" : "Compare with baseline output"}
        <ArrowRight size={13} />
      </button>
      {showBaseline && (
        <div className="code-window baseline-window">
          <div>
            <span>Before repair · /exports/{customer}</span>
            <span>HTTP {trial.before[customer].status}</span>
          </div>
          <pre>{JSON.stringify(trial.before[customer].body, null, 2)}</pre>
        </div>
      )}
      <div className="code-window">
        <div>
          <span>GET /exports/{customer}</span>
          <span className={output.status === 200 ? "good-text" : "bad-text"}>
            HTTP {output.status}
          </span>
        </div>
        <pre>{JSON.stringify(output.body, null, 2)}</pre>
      </div>
      {trial.repair === "bypass" &&
        customer === "alder" &&
        trial.checks.some(
          (check) =>
            check.customer === customer &&
            check.key === "provenance" &&
            !check.passed,
        ) && (
          <div className="callout warning">
            <strong>Alder’s report is missing required provenance.</strong>
            <p>
              <code>provenance_id</code> is absent from the actual export.
            </p>
            <button
              className="text-button"
              onClick={() => onSource("alder-agreement")}
            >
              Read Alder's agreement <ArrowRight size={14} />
            </button>
          </div>
        )}
      <h3>Checks for {titleCase(customer)}</h3>
      <div className="check-list">
        {trial.checks
          .filter((c) => !c.customer || c.customer === customer)
          .map((c, i) => (
            <details key={`${c.key}-${i}`}>
              <summary>
                <span className={c.passed ? "good-text" : "bad-text"}>
                  {c.passed ? <Check size={15} /> : <X size={15} />}
                </span>
                <span>{c.title}</span>
                <small>{c.passed ? "Passed" : "Failed"}</small>
              </summary>
              <dl>
                <dt>Expected</dt>
                <dd>
                  <code>{JSON.stringify(c.expected)}</code>
                </dd>
                <dt>Observed</dt>
                <dd>
                  <code>{JSON.stringify(c.actual)}</code>
                </dd>
              </dl>
            </details>
          ))}
      </div>
      <p className="small-muted hash">
        Artifact SHA-256 · {trial.artifact_hash}
      </p>
    </>
  );
}

export function ApprovalReview({
  data,
  run,
  person,
  now,
  busy,
  onApprove,
  onIdentity,
  onSource,
}: {
  data: Workspace;
  run: Run;
  person: Person;
  now: number;
  busy: boolean;
  onApprove: () => void;
  onIdentity: (id: Person) => void;
  onSource: (key: string) => void;
}) {
  const proposal = run.proposal!;
  const owner = PEOPLE[proposal.owner];
  const seconds = Math.max(0, Math.ceil(proposal.expires_at - now));
  const stale =
    proposal.context_hash !== data.context.fingerprint ||
    data.changes.length > 0;
  const trial = run.trials.find((t) => t.repair === proposal.repair)!;
  const done = run.status === "completed";
  return (
    <>
      <div className="review-hero">
        <span className="review-icon">
          {done ? <CheckCircle2 size={28} /> : <ShieldCheck size={28} />}
        </span>
        <h3>{done ? "Recovery verified" : REPAIRS[proposal.repair].name}</h3>
        <p>
          {done
            ? "The executed repair and its evidence are saved in the decision log."
            : "You are approving the exact repair and output tested in this rehearsal."}
        </p>
      </div>
      <div className="review-stats">
        <div>
          <strong>{trial.scope.length}</strong>
          <span>customers in scope</span>
        </div>
        <div>
          <strong>{trial.checks.length}</strong>
          <span>checks passed</span>
        </div>
        <div>
          <strong>r{run.context.revision}</strong>
          <span>company evidence</span>
        </div>
      </div>
      <h3>What will change</h3>
      <p className="body-copy">
        {proposal.repair === "cache"
          ? "Alder and Beacon will use verified cached provenance. Their original account, amount, and currency remain intact. Cedar’s basic export stays unchanged."
          : proposal.repair === "bypass"
            ? "Affected rich exports will skip enrichment. The current agreements allow the resulting output."
            : "The export worker will return to version 1. Every customer on that worker is included in the checks."}
      </p>
      <div className="review-sources">
        {["alder-agreement", "cache-policy", "ownership"].map((key) => (
          <button key={key} onClick={() => onSource(key)}>
            <FileText size={16} />
            <span>{run.context.sources.find((s) => s.key === key)?.title}</span>
            <ArrowRight size={14} />
          </button>
        ))}
      </div>
      <div className="owner-box">
        <span className="avatar">{owner?.initials || "?"}</span>
        <div>
          <strong>{owner?.name || proposal.owner}</strong>
          <small>Accountable service owner</small>
        </div>
        <ShieldCheck size={18} />
      </div>
      {!done && (
        <>
          {stale ? (
            <div className="callout warning">
              <strong>Evidence changed. Approval is unavailable.</strong>
              <p>
                Review any pending policy revision, then run a new rehearsal.
              </p>
            </div>
          ) : seconds === 0 ? (
            <div className="callout warning">
              <strong>This proposal has expired.</strong>
              <p>
                Run a new rehearsal to verify the current cache and
                requirements.
              </p>
            </div>
          ) : (
            <p className="expiry">
              <Clock3 size={14} /> Evidence will be rechecked on approval.{" "}
              {seconds}s remaining.
            </p>
          )}
          {person !== proposal.owner && (
            <div className="callout">
              <strong>Approval belongs to {owner?.name}.</strong>
              <p>Your current demo identity cannot approve this repair.</p>
              <button
                className="text-button"
                onClick={() => onIdentity(proposal.owner as Person)}
              >
                Switch demo identity to {owner?.name}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <button
            className="primary full-width"
            disabled={
              busy || stale || seconds === 0 || person !== proposal.owner
            }
            onClick={onApprove}
          >
            <ShieldCheck size={16} />
            {busy ? "Rechecking and applying…" : "Approve and apply repair"}
          </button>
          <p className="fine-print">
            Applies only to this synthetic local export service.
          </p>
        </>
      )}
      <a
        className="download-link"
        href={`/api/runs/${run.id}/evidence`}
        download
      >
        <Download size={15} /> Download rehearsal evidence
      </a>
    </>
  );
}

export function SourceContent({ source }: { source: Source }) {
  return (
    <>
      <div className="source-meta">
        <span
          className={`status-tag ${source.authoritative ? "success" : "neutral"}`}
        >
          {source.authoritative ? "Authoritative record" : "Supporting context"}
        </span>
        <span>Revision {source.revision}</span>
      </div>
      <div className="document-paper">
        <span className="document-author">
          {source.author} · {titleCase(source.kind)}
        </span>
        <p>{source.text}</p>
      </div>
      <div className="callout">
        <strong>
          {source.authoritative
            ? "This record can constrain the repair."
            : "Context does not grant authority."}
        </strong>
        <p>
          {source.authoritative
            ? "The proposal is bound to this source revision. A reviewed change requires a fresh rehearsal."
            : "A chat or incident note can explain a workaround, but cannot override an agreement, operating policy, or current owner."}
        </p>
      </div>
      <p className="small-muted hash">Source SHA-256 · {source.hash}</p>
    </>
  );
}
