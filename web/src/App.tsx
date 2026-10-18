import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Code2,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Menu,
  Search,
  Settings2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Connections } from "./screens/Connections";
import { Examples } from "./screens/Examples";
import { CommandMenu, type Command } from "./components/CommandMenu";
import { RunTimeline } from "./components/RunTimeline";
import { Experiments } from "./components/Experiments";
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
  | { type: "trial"; trial: Trial; sources?: Source[] }
  | { type: "history"; run: Run }
  | { type: "source"; source: Source; historical?: boolean }
  | { type: "node"; id: string; trial?: Trial }
  | { type: "receipt"; receipt: Receipt }
  | { type: "approval" | "trace" | "help" | "reset" };
const pages: { id: Page; name: string; icon: typeof Activity }[] = [
  { id: "incident", name: "Incident room", icon: Activity },
  { id: "examples", name: "Examples", icon: BookOpen },
  { id: "context", name: "Company context", icon: GitBranch },
  { id: "decisions", name: "Decision log", icon: History },
  { id: "connections", name: "Connections", icon: Settings2 },
];
function readPage(): Page {
  const hash = window.location.hash.slice(1).split("/")[0];
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
  useEffect(() => {
    if (data?.access.public && !data.access.operator && !window.location.hash) {
      window.location.hash = "examples";
      setPage("examples");
    }
  }, [data?.access.public, data?.access.operator]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
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
  const commands: Command[] = [
    ...pages.map((p) => ({
      id: p.id,
      title: p.name,
      detail: "Navigate",
      action: () => navigate(p.id),
    })),
    {
      id: "lab",
      title: "Open policy lab",
      detail: "Test a counterfactual",
      action: () => {
        navigate("incident");
        window.location.hash = "incident/lab";
      },
    },
    {
      id: "run",
      title: "Run rehearsal",
      detail: "Guided demo · real tools",
      disabled:
        running || busy || !!data?.changes.length || !data?.access.can_edit,
      action: () => {
        navigate("incident");
        start("guided");
      },
    },
    {
      id: "boundaries",
      title: "Run boundary tests",
      detail: "Replay policy and freshness scenarios",
      action: () => {
        navigate("incident");
        window.location.hash = "incident/boundaries";
      },
    },
    {
      id: "trace",
      title: "Inspect execution trace",
      detail: "MCP calls and graph queries",
      action: toolTrace,
    },
    ...(data?.context.sources.map((source) => ({
      id: source.key,
      title: source.title,
      detail: `${source.author} · source revision ${source.revision}`,
      action: () => openSource(source.key),
    })) || []),
    {
      id: "help",
      title: "How Rehearsal works",
      detail: "Product walkthrough",
      action: () => setPanel({ type: "help" }),
    },
  ];
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
    panel?.type === "history"
      ? "Rehearsal record"
      : panel?.type === "trial"
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
    <div className={`app-shell page-${page}`}>
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
      <header className="masthead">
        <div className="masthead-brand">
          <a
            className="brand"
            href="#incident"
            onClick={(e) => {
              e.preventDefault();
              navigate("incident");
            }}
          >
            rehearsal
          </a>
          <span className="workspace-divider" />
          <span className="workspace-name">
            Harbor <span className="environment-label">SANDBOX</span>
          </span>
        </div>
        <div className={`navigation-bar ${mobileNav ? "mobile-open" : ""}`}>
          <nav aria-label="Workspace navigation">
            {pages.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={page === item.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.id);
                }}
              >
                <span>{item.name}</span>
                {item.id === "decisions" && !!data?.decisions.length && (
                  <span className="nav-count">{data.decisions.length}</span>
                )}
              </a>
            ))}
          </nav>
        </div>
        <div className="masthead-tools">
          <button
            className="command-trigger"
            onClick={() => setCommandOpen(true)}
            aria-labelledby="workspace-search-label workspace-search-shortcut"
          >
            <Search size={15} />
            <span id="workspace-search-label">Search workspace</span>
            <kbd id="workspace-search-shortcut">⌘ K</kbd>
          </button>
          <button
            className="icon-button reset-link"
            aria-label="Reset sample workspace"
            title="Reset sample workspace"
            onClick={() => setPanel({ type: "reset" })}
            disabled={running || busy || !data?.access.can_edit}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="How it works"
            onClick={() => setPanel({ type: "help" })}
          >
            <CircleHelp size={18} />
          </button>
          <div className="identity-picker">
            <span className="avatar">{PEOPLE[person].initials}</span>
            <label className="sr-only" htmlFor="demo-identity">
              Demo identity
            </label>
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
          <button
            className="icon-button mobile-menu"
            aria-label={mobileNav ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <div className="app-main">
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
              {data.access.public &&
                !data.access.operator &&
                page !== "examples" && (
                  <div className="public-demo-note">
                    <span>
                      Public demo · explore isolated examples without a key.
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("examples")}
                    >
                      Browse examples <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              {page === "examples" && (
                <Examples
                  data={data}
                  onSource={openSource}
                  onTrial={(trial, sources) =>
                    setPanel({ type: "trial", trial, sources })
                  }
                  onLab={() => {
                    navigate("incident");
                    window.location.hash = "incident/lab";
                  }}
                />
              )}
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
                  busy={busy || !data.access.can_edit}
                  onRun={start}
                  onTrial={(trial) =>
                    setPanel({
                      type: "trial",
                      trial,
                      sources: trial.hypothetical
                        ? data.context.sources
                        : run?.context.sources,
                    })
                  }
                  onSource={openSource}
                  onNode={(id, trial) => setPanel({ type: "node", id, trial })}
                  onTrace={toolTrace}
                  onGraphTrace={graphTrace}
                  onReview={() => setPanel({ type: "approval" })}
                  onHelp={() => setPanel({ type: "help" })}
                  onDecisions={() => navigate("decisions")}
                  onConnections={() => navigate("connections")}
                />
              )}
              {page === "connections" && (
                <Connections
                  data={data}
                  onConnected={refresh}
                  running={running}
                />
              )}
              {page === "context" && (
                <Company
                  data={data}
                  person={person}
                  busy={busy || !data.access.can_edit}
                  onSource={(source) => setPanel({ type: "source", source })}
                  onPropose={propose}
                  onReview={reviewPolicy}
                  onIdentity={switchIdentity}
                />
              )}
              {page === "decisions" && (
                <Decisions
                  receipts={data.decisions}
                  runs={data.runs}
                  onRun={(run) => setPanel({ type: "history", run })}
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
          <span>
            <i className={data ? "good-dot" : "neutral-dot"} />{" "}
            {data ? "FalkorDB online" : "Connecting to graph"}
          </span>
          <span>
            Harbor · synthetic workspace <span className="footer-dot">·</span>{" "}
            <a
              href="https://github.com/aman-a-shah/rehearsal"
              target="_blank"
              rel="noreferrer"
            >
              Source <ExternalLink size={11} />
            </a>
          </span>
        </footer>
      </div>
      {commandOpen && (
        <CommandMenu
          commands={commands}
          onClose={() => setCommandOpen(false)}
        />
      )}
      {panel && (
        <Drawer
          title={panelTitle}
          eyebrow={panelEyebrow}
          onClose={() => setPanel(null)}
          wide={panel.type === "trace" || panel.type === "history"}
        >
          {error && (
            <div className="callout warning" role="alert">
              {error}
            </div>
          )}
          {panel.type === "trial" && (
            <TrialEvidence
              trial={panel.trial}
              onSource={(key) => {
                const source = panel.sources?.find((s) => s.key === key);
                if (source)
                  setPanel({ type: "source", source, historical: true });
                else openSource(key);
              }}
            />
          )}
          {panel.type === "history" && (
            <>
              <div className="callout">
                <strong>
                  Saved investigation · context r{panel.run.context.revision}
                </strong>
                <p>
                  This is the evidence recorded during this run. Current
                  approval authority stays with the active incident.
                </p>
              </div>
              <Experiments
                run={panel.run}
                onTrial={(trial) =>
                  setPanel({
                    type: "trial",
                    trial,
                    sources: panel.run.context.sources,
                  })
                }
              />
              <RunTimeline run={panel.run} running={false} />
            </>
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
                    busy={busy || !data.access.can_edit}
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
              busy={
                busy ||
                !data.access.can_edit ||
                (run.mode === "live" && !data.access.can_use_provider)
              }
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
              {(panel.trial?.exports[node.id] || data.exports[node.id]) && (
                <>
                  <h3>
                    {panel.trial ? "Isolated trial export" : "Current export"}
                  </h3>
                  <div className="code-window">
                    <div>
                      <span>GET /exports/{node.id}</span>
                      <span>
                        HTTP{" "}
                        {
                          (
                            panel.trial?.exports[node.id] ||
                            data.exports[node.id]
                          ).status
                        }
                      </span>
                    </div>
                    <pre>
                      {JSON.stringify(
                        (panel.trial?.exports[node.id] || data.exports[node.id])
                          .body,
                        null,
                        2,
                      )}
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
                <h3>Test a repair before approving it</h3>
                <p>
                  Compare repair outputs against customer requirements, then
                  review a passing option as the service owner.
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
                    working HTTP handlers. Compare the exported JSON with each
                    customer’s requirements.
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
                  <code>.env</code>, set <code>BACKBOARD_API_KEY</code>, and
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
                  disabled={busy || running || !data?.access.can_edit}
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
