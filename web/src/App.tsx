import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Code2,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Layers3,
  Menu,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Drawer } from "./components/Drawer";
import {
  ApprovalReview,
  SourceContent,
  TrialEvidence,
} from "./components/Evidence";
import { Incident } from "./screens/Incident";
import { Company, PolicyEditor } from "./screens/Company";
import { Decisions, DecisionContent } from "./screens/Decisions";
import { request, useWorkspace } from "./useWorkspace";
import {
  PEOPLE,
  REPAIRS,
  titleCase,
  type Page,
  type Person,
  type Trial,
  type Source,
  type Receipt,
  type Run,
} from "./types";

type Panel =
  | { type: "trial"; trial: Trial }
  | { type: "source"; source: Source; historical?: boolean }
  | { type: "node"; id: string }
  | { type: "receipt"; receipt: Receipt }
  | { type: "approval" | "trace" | "help" | "reset" };
const pages: { id: Page; name: string; icon: typeof Activity }[] = [
  { id: "incident", name: "Incident room", icon: Activity },
  { id: "context", name: "Company context", icon: GitBranch },
  { id: "decisions", name: "Decision log", icon: History },
];
function readPage(): Page {
  const hash = window.location.hash.slice(1);
  return pages.some((p) => p.id === hash) ? (hash as Page) : "incident";
}

export default function App() {
  const workspace = useWorkspace();
  const {
    data,
    run,
    running,
    busy,
    error,
    setError,
    person,
    now,
    act,
    identify,
    refresh,
  } = workspace;
  const [page, setPage] = useState<Page>(readPage);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [traceTab, setTraceTab] = useState<"tools" | "queries">("tools");
  useEffect(() => {
    const listener = () => setPage(readPage());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  function navigate(next: Page) {
    window.location.hash = next;
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openSource(key: string) {
    const source = data?.context.sources.find((s) => s.key === key);
    if (source) setPanel({ type: "source", source });
  }
  const switchIdentity = (id: Person) => {
    void act(() => identify(id));
  };
  const propose = (age: number) => {
    void act(() => request("/policy/propose", { max_age: age }));
  };
  const reviewPolicy = (id: string, accept: boolean) => {
    void act(() => request(`/policy/${id}/review`, { accept }));
  };
  const start = (mode: "guided" | "live") => {
    void act(() => request<Run>("/runs", { mode }));
  };
  const approve = () => {
    if (run?.proposal)
      void act(() =>
        request(`/runs/${run.id}/approve`, { digest: run.proposal!.digest }),
      );
  };
  const graphTrace = () => {
    setTraceTab("queries");
    setPanel({ type: "trace" });
  };
  const toolTrace = () => {
    setTraceTab("tools");
    setPanel({ type: "trace" });
  };
  const currentPage = pages.find((p) => p.id === page)!;
  const currentSource =
    panel?.type === "source"
      ? panel.historical
        ? panel.source
        : data?.context.sources.find((s) => s.key === panel.source.key) ||
          panel.source
      : null;
  const node =
    panel?.type === "node"
      ? data?.diagram.nodes.find((n) => n.id === panel.id)
      : null;
  const panelTitle =
    panel?.type === "trial"
      ? REPAIRS[panel.trial.repair].name
      : currentSource
        ? currentSource.title
        : node
          ? node.name
          : panel?.type === "receipt"
            ? "Decision record"
            : panel?.type === "approval"
              ? "Review the proposed repair"
              : panel?.type === "trace"
                ? "An inspectable chain of evidence"
                : panel?.type === "reset"
                  ? "Reset the sample workspace?"
                  : "How Rehearsal works";
  const panelEyebrow =
    panel?.type === "trial"
      ? "Experiment evidence"
      : panel?.type === "source"
        ? "Company source"
        : panel?.type === "node"
          ? "Connected context"
          : panel?.type === "approval"
            ? "Owner approval"
            : panel?.type === "trace"
              ? "Under the hood"
              : "Rehearsal";
  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#incident"
          onClick={() => navigate("incident")}
        >
          <img src="/favicon.svg" alt="" />
          <span>
            rehearsal<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-identity">
          <span className="company-mark">H</span>
          <div>
            <strong>Harbor</strong>
            <small>Sample workspace</small>
          </div>
          <Layers3 size={15} />
        </div>
        <div className="nav-label">Workspace</div>
        <nav aria-label="Workspace navigation">
          {pages.map((item) => {
            const Icon = item.icon;
            return (
              <a
                href={`#${item.id}`}
                key={item.id}
                aria-current={page === item.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.id);
                }}
              >
                <Icon size={17} />
                <span>{item.name}</span>
                {item.id === "incident" && <span className="nav-count">1</span>}
                {item.id === "decisions" && !!data?.decisions.length && (
                  <span className="nav-count">{data.decisions.length}</span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">Current incident</div>
        <button className="incident-nav" onClick={() => navigate("incident")}>
          <span
            className={`incident-line ${data && Object.values(data.exports).every((e) => e.status === 200) ? "resolved" : ""}`}
          />
          <div>
            <strong>INC-204</strong>
            <span>Rich exports failing</span>
          </div>
          <ChevronRight size={14} />
        </button>
        <div className="sidebar-bottom">
          <div className="sample-note">
            <span className="sample-symbol">
              <Database size={15} />
            </span>
            <p>
              Real graph.
              <br />
              Synthetic company.
            </p>
          </div>
          <button
            className="sidebar-link"
            onClick={() => setPanel({ type: "help" })}
          >
            <CircleHelp size={16} />
            How it works
          </button>
          <button
            className="sidebar-link"
            onClick={() => setPanel({ type: "reset" })}
            disabled={running || busy}
          >
            <RotateCcw size={15} />
            Reset sample workspace
          </button>
          <div className="identity-picker">
            <span className="avatar">{PEOPLE[person].initials}</span>
            <div>
              <label htmlFor="demo-identity">Demo identity</label>
              <select
                id="demo-identity"
                value={person}
                onChange={(e) => switchIdentity(e.target.value as Person)}
                disabled={busy}
              >
                <option value="nia">Nia Chen · owner</option>
                <option value="mira">Mira Patel · expert</option>
                <option value="reviewer">Policy reviewer</option>
                <option value="owen">Owen Brooks · former owner</option>
              </select>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Harbor</span>
            <ChevronRight size={13} />
            <strong>{currentPage.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="graph-status">
              <i className={data ? "good-dot" : "neutral-dot"} />
              {data ? "FalkorDB connected" : "Connecting to workspace"}
            </span>
            <a
              href="https://github.com/aman-a-shah/rehearsal"
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              Source <ExternalLink size={13} />
            </a>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {error && (
            <div className="error-banner" role={panel ? undefined : "alert"}>
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading-workspace" aria-busy="true">
              <span className="eyebrow">Opening the workspace</span>
              <h1>Connecting the evidence.</h1>
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-map" />
              {error && (
                <button className="secondary" onClick={() => void act(refresh)}>
                  Retry connection
                </button>
              )}
            </div>
          ) : (
            <>
              {data.changes.length > 0 && page !== "context" && (
                <div className="pending-banner">
                  <FileText size={16} />
                  <span>
                    A company policy revision is awaiting review. Repair
                    approvals are paused.
                  </span>
                  <button
                    className="text-button"
                    onClick={() => navigate("context")}
                  >
                    Review revision <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {page === "incident" && (
                <Incident
                  data={data}
                  run={run}
                  now={now}
                  running={running}
                  busy={busy}
                  onRun={start}
                  onTrial={(trial) => setPanel({ type: "trial", trial })}
                  onSource={openSource}
                  onNode={(id) => setPanel({ type: "node", id })}
                  onTrace={toolTrace}
                  onGraphTrace={graphTrace}
                  onReview={() => setPanel({ type: "approval" })}
                  onHelp={() => setPanel({ type: "help" })}
                  onDecisions={() => navigate("decisions")}
                />
              )}
              {page === "context" && (
                <Company
                  data={data}
                  person={person}
                  busy={busy}
                  onSource={(source) => setPanel({ type: "source", source })}
                  onPropose={propose}
                  onReview={reviewPolicy}
                  onIdentity={switchIdentity}
                />
              )}
              {page === "decisions" && (
                <Decisions
                  receipts={data.decisions}
                  onIncident={() => navigate("incident")}
                  onReceipt={(receipt) =>
                    setPanel({ type: "receipt", receipt })
                  }
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>Test the repair. Keep the promise.</span>
          <span>A local workspace for evidence-led decisions.</span>
        </footer>
      </div>
      {panel && (
        <Drawer
          title={panelTitle}
          eyebrow={panelEyebrow}
          onClose={() => setPanel(null)}
          wide={panel.type === "trace"}
        >
          {error && (
            <div className="callout warning" role="alert">
              {error}
            </div>
          )}
          {panel.type === "trial" && (
            <TrialEvidence trial={panel.trial} onSource={openSource} />
          )}
          {currentSource && (
            <>
              <SourceContent source={currentSource} />
              {currentSource.key === "cache-policy" &&
                !("historical" in panel && panel.historical) &&
                data && (
                  <PolicyEditor
                    data={data}
                    person={person}
                    busy={busy}
                    onPropose={propose}
                    onReview={reviewPolicy}
                    onIdentity={switchIdentity}
                  />
                )}
            </>
          )}
          {panel.type === "approval" && data && run?.proposal && (
            <ApprovalReview
              data={data}
              run={run}
              person={person}
              now={now}
              busy={busy}
              onApprove={approve}
              onIdentity={switchIdentity}
              onSource={openSource}
            />
          )}
          {panel.type === "node" && node && data && (
            <>
              <div className="node-detail-heading">
                <span className="large-initial">{node.name[0]}</span>
                <div>
                  <span className="status-tag neutral">
                    {titleCase(node.kind)}
                  </span>
                  <p>Connected in the current FalkorDB context.</p>
                </div>
              </div>
              {data.exports[node.id] && (
                <>
                  <h3>Current export</h3>
                  <div className="code-window">
                    <div>
                      <span>GET /exports/{node.id}</span>
                      <span>HTTP {data.exports[node.id].status}</span>
                    </div>
                    <pre>
                      {JSON.stringify(data.exports[node.id].body, null, 2)}
                    </pre>
                  </div>
                </>
              )}
              <h3>Direct relationships</h3>
              <div className="relationship-list">
                {data.diagram.edges
                  .filter(
                    (edge) => edge.from === node.id || edge.to === node.id,
                  )
                  .map((edge, i) => (
                    <div key={i}>
                      <span>
                        {
                          data.diagram.nodes.find((n) => n.id === edge.from)
                            ?.name
                        }
                      </span>
                      <code>
                        {edge.type.replaceAll("_", " ").toLowerCase()}
                      </code>
                      <span>
                        {data.diagram.nodes.find((n) => n.id === edge.to)?.name}
                      </span>
                    </div>
                  ))}
              </div>
              {node.kind === "customer" && (
                <button
                  className="secondary full-width"
                  onClick={() => openSource(`${node.id}-agreement`)}
                >
                  Open customer agreement <ArrowRight size={15} />
                </button>
              )}
              <button className="text-button" onClick={graphTrace}>
                <Code2 size={15} />
                Inspect the graph queries
              </button>
            </>
          )}
          {panel.type === "receipt" && (
            <DecisionContent
              receipt={panel.receipt}
              onSource={(source) =>
                setPanel({ type: "source", source, historical: true })
              }
            />
          )}
          {panel.type === "trace" && data && (
            <>
              <div className="segmented">
                <button
                  aria-pressed={traceTab === "tools"}
                  onClick={() => setTraceTab("tools")}
                >
                  MCP tool calls
                </button>
                <button
                  aria-pressed={traceTab === "queries"}
                  onClick={() => setTraceTab("queries")}
                >
                  FalkorDB queries
                </button>
              </div>
              {traceTab === "tools" ? (
                <>
                  <p className="body-copy">
                    {run
                      ? run.mode === "guided"
                        ? "A fixed sequence using the actual MCP tools, graph queries, and export service. No model inference."
                        : "The live model selected these tools. Tool results come from the actual graph and export service."
                      : "Run a rehearsal to see its typed tool calls."}
                  </p>
                  <div className="tool-events">
                    {run?.events.map((event, i) => (
                      <details key={i}>
                        <summary>
                          <span className={`event-dot ${event.status}`} />
                          <code>{event.tool}</code>
                          <small>{event.duration_ms} ms</small>
                          <span>{event.status}</span>
                        </summary>
                        <pre>{JSON.stringify(event.arguments, null, 2)}</pre>
                        {event.message && <p>{event.message}</p>}
                      </details>
                    ))}
                  </div>
                  {run?.usage && (
                    <div className="callout">
                      {run.usage.model} · {run.usage.input_tokens} input tokens
                      · {run.usage.output_tokens} output tokens
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="body-copy">
                    Executed queries from the real FalkorDB context layer.
                    Parameters are bound by the server.
                  </p>
                  <div className="query-list">
                    {data.trace
                      .filter((t) => !t.write)
                      .slice(-14)
                      .map((trace, i) => (
                        <details key={i} open={i === 0}>
                          <summary>
                            <Database size={14} />
                            <span>
                              {trace.query.includes("CALLS*")
                                ? "Multi-hop customer impact"
                                : trace.query.includes("SUPPORTED_BY")
                                  ? "Source-backed requirements"
                                  : "Company graph read"}
                            </span>
                            <small>
                              {trace.rows} rows · {trace.duration_ms} ms
                            </small>
                          </summary>
                          <pre>{trace.query}</pre>
                          {Object.keys(trace.parameters || {}).length > 0 && (
                            <pre>
                              {JSON.stringify(trace.parameters, null, 2)}
                            </pre>
                          )}
                        </details>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
          {panel.type === "help" && (
            <>
              <div className="help-intro">
                <ShieldCheck size={30} />
                <h3>Confidence comes from the output.</h3>
                <p>
                  Rehearsal follows company evidence, runs possible repairs, and
                  brings the tested decision to the person who owns it.
                </p>
              </div>
              <ol className="help-steps">
                <li>
                  <strong>Understand the impact</strong>
                  <p>
                    FalkorDB follows dependencies from the failed enrichment
                    service to the customers that use it. Cedar shares the
                    worker but stays outside the outage.
                  </p>
                </li>
                <li>
                  <strong>Compare three real experiments</strong>
                  <p>
                    Each repair runs against a separate SQLite copy through
                    working HTTP handlers. Inspect the exported JSON, not just
                    the response status.
                  </p>
                </li>
                <li>
                  <strong>Approve the tested repair</strong>
                  <p>
                    The server rechecks the company evidence, owner, cache
                    freshness, and output before applying the change. A durable
                    receipt prevents a repeated mutation.
                  </p>
                </li>
                <li>
                  <strong>Change a company fact</strong>
                  <p>
                    In Company context, propose a 600-second cache policy and
                    accept it as Policy reviewer. An old proposal becomes stale,
                    and the next rehearsal must respect the new policy.
                  </p>
                </li>
              </ol>
              <div className="callout">
                <strong>Guided demo and live agent are different.</strong>
                <p>
                  The guided demo uses a fixed MCP tool sequence. To let a model
                  choose the calls, copy <code>.env.example</code> to{" "}
                  <code>.env</code>, set <code>ANTHROPIC_API_KEY</code>, and
                  restart the server.
                </p>
              </div>
              <p className="fine-print">
                All company records and identities are synthetic. This is a
                local single-process prototype with switchable demo identities.
                Trial isolation is application state isolation, not an
                operating-system sandbox.
              </p>
              <a
                className="download-link"
                href="https://github.com/aman-a-shah/rehearsal"
                target="_blank"
                rel="noreferrer"
              >
                <BookOpen size={16} /> Read the project documentation{" "}
                <ExternalLink size={13} />
              </a>
            </>
          )}
          {panel.type === "reset" && (
            <>
              <div className="reset-icon">
                <RotateCcw size={28} />
              </div>
              <p className="body-copy">
                This restores the original incident and the 900-second cache
                policy, refreshes the sample cache, and removes this workspace's
                rehearsal runs and decision log.
              </p>
              <p className="small-muted">
                Download any evidence you want to keep before resetting.
              </p>
              <div className="reset-actions">
                <button className="secondary" onClick={() => setPanel(null)}>
                  Keep workspace
                </button>
                <button
                  className="primary"
                  disabled={busy || running}
                  onClick={async () => {
                    if (await act(() => request("/reset", {}))) {
                      setPanel(null);
                      navigate("incident");
                    }
                  }}
                >
                  Reset workspace
                </button>
              </div>
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}
