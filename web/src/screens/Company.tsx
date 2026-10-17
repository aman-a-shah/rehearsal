import { useId, useState } from "react";
import {
  ArrowRight,
  FileText,
  MessageSquare,
  Search,
  ShieldCheck,
  Ticket,
  UserRound,
  Clock3,
} from "lucide-react";
import { PEOPLE, type Workspace, type Source, type Person } from "../types";

export function PolicyEditor({
  data,
  person,
  busy,
  onPropose,
  onReview,
  onIdentity,
}: {
  data: Workspace;
  person: Person;
  busy: boolean;
  onPropose: (age: number) => void;
  onReview: (id: string, accept: boolean) => void;
  onIdentity: (person: Person) => void;
}) {
  const [age, setAge] = useState("600");
  const inputId = useId();
  const pending = data.changes[0];
  const valid = /^\d+$/.test(age) && Number(age) <= 86400;
  return (
    <section className="policy-editor" aria-label="Review cache policy">
      <div className="policy-icon">
        <Clock3 size={21} />
      </div>
      <h3>
        Change a fact.
        <br />
        Change the decision.
      </h3>
      <p>
        The outage stays the same. Tightening the freshness policy can make the
        previously passing repair ineligible.
      </p>
      <div className="policy-current">
        <span>Current maximum cache age</span>
        <strong>
          {String(data.context.values["worker:cache_max_age"])}
          <small>seconds</small>
        </strong>
      </div>
      {pending ? (
        <div className="pending-policy">
          <span className="status-tag incident">
            {pending.status === "applying"
              ? "Acceptance in progress"
              : "Awaiting review"}
          </span>
          <h4>Proposed revision</h4>
          <div className="policy-diff">
            <span>{pending.previous_age}s</span>
            <ArrowRight size={16} />
            <strong>{pending.max_age}s</strong>
          </div>
          <p>
            This submitted revision is fixed. Existing approvals are paused
            until it is reviewed.
          </p>
          {person !== "reviewer" ? (
            <button
              className="secondary full-width"
              onClick={() => onIdentity("reviewer")}
              disabled={busy}
            >
              <UserRound size={15} /> Switch to Policy reviewer
            </button>
          ) : (
            <div className="review-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => onReview(pending.id, true)}
              >
                {pending.status === "applying"
                  ? "Resume acceptance"
                  : "Accept revision"}
              </button>
              <button
                className="secondary"
                disabled={busy || pending.status === "applying"}
                onClick={() => onReview(pending.id, false)}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onPropose(Number(age));
          }}
        >
          <label htmlFor={inputId}>Proposed maximum age</label>
          <div className="unit-input">
            <input
              id={inputId}
              type="number"
              min="0"
              max="86400"
              step="1"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
            />
            <span>seconds</span>
          </div>
          <button
            className="secondary full-width"
            type="submit"
            disabled={
              busy ||
              !valid ||
              Number(age) === data.context.values["worker:cache_max_age"]
            }
          >
            Propose policy revision <ArrowRight size={15} />
          </button>
          <p className="fine-print">
            A policy reviewer must accept the revision.
          </p>
        </form>
      )}
    </section>
  );
}

type Props = {
  data: Workspace;
  person: Person;
  busy: boolean;
  onSource: (source: Source) => void;
  onPropose: (age: number) => void;
  onReview: (id: string, accept: boolean) => void;
  onIdentity: (person: Person) => void;
};

export function Company(props: Props) {
  const { data, onSource } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const sources = data.context.sources.filter(
    (s) =>
      (filter === "all" || s.kind === filter) &&
      `${s.title} ${s.author} ${s.text}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const owner = PEOPLE[String(data.context.values["worker:owner"])];
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">
          Company context · Revision {data.context.revision}
        </p>
        <h1>The facts behind the decision.</h1>
        <p>
          Agreements set the constraints. People hold the authority. Every
          decision has a source.
        </p>
      </header>
      <div className="context-facts">
        <button
          onClick={() =>
            onSource(data.context.sources.find((s) => s.key === "ownership")!)
          }
        >
          <span className="fact-icon">
            <UserRound size={19} />
          </span>
          <div>
            <small>Accountable owner</small>
            <strong>{owner?.name || "Unknown"}</strong>
            <p>Expertise is separate from approval.</p>
          </div>
          <ArrowRight size={16} />
        </button>
        <button
          onClick={() =>
            onSource(
              data.context.sources.find((s) => s.key === "alder-agreement")!,
            )
          }
        >
          <span className="fact-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <small>Alder's commitment</small>
            <strong>Provenance required</strong>
            <p>A successful response is not enough.</p>
          </div>
          <ArrowRight size={16} />
        </button>
        <button
          onClick={() =>
            onSource(
              data.context.sources.find((s) => s.key === "cache-policy")!,
            )
          }
        >
          <span className="fact-icon">
            <Clock3 size={19} />
          </span>
          <div>
            <small>Verified cache policy</small>
            <strong>
              {String(data.context.values["worker:cache_max_age"])} seconds
            </strong>
            <p>Freshness is checked before execution.</p>
          </div>
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="company-grid">
        <section className="source-library panel">
          <div className="section-bar">
            <h2>Connected records</h2>
            <span className="small-muted">
              {data.context.sources.length} sources
            </span>
          </div>
          <div className="source-toolbar">
            <div className="search-field">
              <Search size={15} />
              <input
                aria-label="Search company sources"
                placeholder="Search agreements, people, decisions…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filter-tabs">
              {[
                ["all", "All records"],
                ["document", "Documents"],
                ["ticket", "Tickets"],
                ["chat", "Chats"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="source-list">
            {sources.map((source) => {
              const Icon =
                source.kind === "chat"
                  ? MessageSquare
                  : source.kind === "ticket"
                    ? Ticket
                    : FileText;
              return (
                <button
                  className="source-row"
                  key={source.id}
                  onClick={() => onSource(source)}
                >
                  <span className={`source-icon ${source.kind}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{source.title}</strong>
                    <small>
                      {source.author} · Revision {source.revision}
                    </small>
                  </div>
                  <span
                    className={`source-authority ${source.authoritative ? "authoritative" : ""}`}
                  >
                    {source.authoritative ? "Authoritative" : "Context"}
                  </span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
            {!sources.length && (
              <div className="empty-inline">
                <Search size={24} />
                <strong>No matching records</strong>
                <p>Try a customer name or clear the filter.</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </section>
        <aside className="panel policy-panel">
          <PolicyEditor {...props} />
        </aside>
      </div>
    </>
  );
}
