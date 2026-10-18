import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Github,
  Loader2,
  Play,
  RotateCw,
  Square,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import type {
  Candidate,
  CodeRun,
  Execution,
  Project,
  RepoGraph,
  RepoSession,
} from "../repositoryTypes";

async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch("/api/code" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Rehearsal-Request": "1",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response
    .json()
    .catch(() => ({ message: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new Error(result.message || "The request could not be completed.");
  return result as T;
}
const active = (run?: CodeRun | null) =>
  !!run && ["running", "queued"].includes(run.status);
const label = (value: string) =>
  ({
    review: "Ready for review",
    blocked: "Needs attention",
    running: "Rehearsing",
    queued: "Queued",
    cancelled: "Stopped",
    interrupted: "Interrupted",
    error: "Interrupted",
    verified: "Verified twice",
    passed: "Checks passed",
    failed: "Checks failed",
    rejected: "Outside edit scope",
    unstable: "Repeat check failed",
    testing: "Testing",
  })[value] || value;

function DependencyGraph({
  graph,
  focus = [],
  onFile,
}: {
  graph: RepoGraph;
  focus?: string[];
  onFile: (path: string) => void;
}) {
  const connected = new Set(graph.edges.flatMap((e) => [e.source, e.target]));
  const nodes = graph.nodes
    .filter((n) => n.kind !== "document")
    .sort(
      (a, b) =>
        Number(focus.includes(b.path)) - Number(focus.includes(a.path)) ||
        Number(connected.has(b.path)) - Number(connected.has(a.path)),
    )
    .slice(0, 18);
  const targets = new Set(graph.edges.map((e) => e.target));
  const columns = [
    nodes.filter((n) => n.kind === "source" && targets.has(n.path)),
    nodes.filter((n) => n.kind === "source" && !targets.has(n.path)),
    nodes.filter((n) => n.kind === "test"),
  ];
  if (!columns[1].length && columns[0].length > 1)
    columns[1].push(...columns[0].splice(Math.ceil(columns[0].length / 2)));
  const positions = new Map<string, { x: number; y: number }>();
  const height = Math.max(
    230,
    Math.max(...columns.map((c) => c.length)) * 60 + 85,
  );
  columns.forEach((column, index) =>
    column.forEach((n, row) =>
      positions.set(n.path, { x: 25 + index * 252, y: 60 + row * 60 }),
    ),
  );
  return (
    <div className="repo-map">
      <svg
        viewBox={`0 0 760 ${height}`}
        role="group"
        aria-label="Repository import graph. Lines connect files to their imported modules."
      >
        <defs>
          <pattern
            id="repo-dots"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r=".7" fill="#cfd7ce" />
          </pattern>
          <marker
            id="repo-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="#98aa9d" />
          </marker>
        </defs>
        <rect width="760" height={height} fill="url(#repo-dots)" />
        {["Modules", "Dependents", "Tests"].map((title, i) => (
          <text key={title} x={25 + 252 * i} y="28" className="repo-map-label">
            {title}
          </text>
        ))}
        {graph.edges.map((e, i) => {
          const a = positions.get(e.source),
            b = positions.get(e.target);
          if (!a || !b) return null;
          const fromX = a.x < b.x ? a.x + 205 : a.x;
          const toX = a.x < b.x ? b.x : b.x + 205;
          const direction = toX > fromX ? 1 : -1;
          const routeY = Math.min(a.y, b.y) - 17;
          const route =
            Math.abs(a.x - b.x) > 300
              ? `M${fromX},${a.y + 20} C${fromX + direction * 26},${a.y + 20} ${fromX + direction * 26},${routeY} ${fromX + direction * 52},${routeY} L${toX - direction * 52},${routeY} C${toX - direction * 26},${routeY} ${toX - direction * 26},${b.y + 20} ${toX},${b.y + 20}`
              : `M${fromX},${a.y + 20} C${(fromX + toX) / 2},${a.y + 20} ${(fromX + toX) / 2},${b.y + 20} ${toX},${b.y + 20}`;
          return (
            <path
              key={i}
              d={route}
              fill="none"
              stroke="#a6b7aa"
              strokeWidth="1.2"
              markerEnd="url(#repo-arrow)"
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions.get(n.path)!;
          return (
            <g
              key={n.path}
              transform={`translate(${p.x} ${p.y})`}
              className={`repo-map-node ${focus.includes(n.path) ? "focused" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Open ${n.path}`}
              onClick={() => onFile(n.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFile(n.path);
                }
              }}
            >
              <title>{n.path}</title>
              <rect width="205" height="40" rx="5" />
              <circle
                cx="15"
                cy="20"
                r="3.2"
                className={n.kind === "test" ? "test-dot" : "source-dot"}
              />
              <text x="27" y="24">
                {n.path.length > 25 ? "…" + n.path.slice(-24) : n.path}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="repo-map-caption">
        <span>
          <i className="source-dot" /> Source <i className="test-dot" /> Test
        </span>
        <span>
          {graph.nodes.filter((n) => n.kind !== "document").length > 18
            ? "Showing 18 files · "
            : ""}
          Arrow points to imported module
        </span>
      </div>
    </div>
  );
}

function Log({ execution, title }: { execution?: Execution; title: string }) {
  if (!execution)
    return (
      <div className="repo-empty-small">
        The command output will appear here when this step completes.
      </div>
    );
  return (
    <section className="repo-log">
      <div className="repo-log-heading">
        <strong>{title}</strong>
        <span className={execution.exit_code === 0 ? "repo-good" : "repo-bad"}>
          {execution.timed_out
            ? "Timed out"
            : `Exit ${execution.exit_code ?? "—"}`}{" "}
          · {(execution.duration_ms / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="repo-command">
        <Terminal size={13} />
        <code>{execution.test_command}</code>
      </div>
      {execution.setup_output && (
        <details>
          <summary>Setup output</summary>
          <pre>{execution.setup_output}</pre>
        </details>
      )}
      <pre tabIndex={0}>{execution.output || "No output was produced."}</pre>
    </section>
  );
}

function Diff({ patch }: { patch: string }) {
  return (
    <pre className="repo-diff" tabIndex={0} aria-label="Proposed patch">
      {patch.split("\n").map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith("+")
              ? "addition"
              : line.startsWith("-")
                ? "deletion"
                : line.startsWith("@@")
                  ? "hunk"
                  : line.startsWith("diff")
                    ? "file-heading"
                    : ""
          }
        >
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

export default function Repositories() {
  const [session, setSession] = useState<RepoSession | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<CodeRun[]>([]);
  const [projectId, setProjectId] = useState(
    () => window.location.hash.split("/")[1] || "",
  );
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [directory, setDirectory] = useState("");
  const [incident, setIncident] = useState("");
  const [setup, setSetup] = useState("");
  const [test, setTest] = useState("");
  const [regression, setRegression] = useState(true);
  const [tab, setTab] = useState("overview");
  const [candidateId, setCandidateId] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [file, setFile] = useState<{ path: string; content: string } | null>(
    null,
  );
  const [githubRepos, setGithubRepos] = useState<
    { name: string; private: boolean }[] | null
  >(null);
  const [privateRepos, setPrivateRepos] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLDialogElement>(null);
  const project = projects.find((p) => p.id === projectId);
  const projectRuns = runs.filter((r) => r.project_id === projectId);
  const run = projectRuns.find((r) => r.id === runId) || projectRuns[0];
  const candidate =
    run?.candidates.find((c) => c.id === candidateId) ||
    run?.candidates.find((c) => c.id === run.recommended) ||
    run?.candidates[0];
  const running = active(run);

  const refresh = useCallback(async () => {
    const next = await api<RepoSession>("/session");
    setSession(next);
    if (next.user) {
      const [p, r] = await Promise.all([
        api<Project[]>("/projects"),
        api<CodeRun[]>("/runs"),
      ]);
      setProjects(p);
      setRuns(r);
    } else {
      setProjects([]);
      setRuns([]);
    }
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      void api<CodeRun>(`/runs/${run.id}`)
        .then((next) =>
          setRuns((current) =>
            current.map((r) => (r.id === next.id ? next : r)),
          ),
        )
        .catch((e) => setError(e.message));
    }, 2500);
    return () => window.clearInterval(interval);
  }, [running, run?.id]);
  useEffect(() => {
    if (!project) return;
    setIncident(project.incident || "");
    setSetup(project.setup_command);
    setTest(project.test_command);
    setTab("overview");
    setRunId("");
    setCandidateId("");
    setReviewed(false);
    setConfirmDelete(false);
  }, [projectId, project?.id]);
  useEffect(() => {
    const change = () => setProjectId(window.location.hash.split("/")[1] || "");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setReviewed(false);
  }, [candidate?.id, run?.id]);
  useEffect(() => {
    if (file) sourceRef.current?.showModal();
    else sourceRef.current?.close();
  }, [file]);

  async function act(name: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function ensureSession() {
    if (!session?.user) {
      await api("/auth/guest", {});
      await refresh();
    }
  }
  function choose(p: Project) {
    setProjectId(p.id);
    setIncident(p.incident || "");
    setSetup(p.setup_command);
    setTest(p.test_command);
    window.location.hash = "repositories/" + p.id;
  }
  async function imported(p: Project) {
    await refresh();
    choose(p);
  }
  async function openFile(path: string) {
    await act("file", async () =>
      setFile(
        await api(
          `/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
        ),
      ),
    );
  }
  async function start() {
    await act("run", async () => {
      const result = await api<CodeRun>(`/projects/${projectId}/runs`, {
        incident,
        setup_command: setup,
        test_command: test,
        allow_regression: regression,
      });
      setRuns((current) => [result, ...current]);
      setSession(await api<RepoSession>("/session"));
      setRunId(result.id);
      setCandidateId("");
      setTab("activity");
    });
  }
  async function upload(zip: File) {
    await act("upload", async () => {
      if (zip.size > 12 * 1024 * 1024)
        throw new Error("Choose a ZIP smaller than 12 MB.");
      await ensureSession();
      const response = await fetch(
        `/api/code/projects/upload?name=${encodeURIComponent(zip.name.replace(/\.zip$/i, ""))}&directory=${encodeURIComponent(directory)}`,
        {
          method: "POST",
          body: zip,
          headers: {
            "X-Rehearsal-Request": "1",
            "Content-Type": "application/zip",
          },
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      await imported(result);
    });
  }

  return (
    <div className="repo-app">
      <a
        href="#repo-main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("repo-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="repo-header">
        <a className="brand" href="#repositories" aria-label="Rehearsal home">
          rehearsal
          <span className="repo-brand-dot" />
        </a>
        <nav aria-label="Main navigation">
          <a href="#repositories" aria-current="page">
            Repositories
          </a>
          <a href="#examples">Guided example</a>
          <a
            href="https://github.com/aman-a-shah/rehearsal"
            target="_blank"
            rel="noreferrer"
          >
            Source <ExternalLink size={12} />
          </a>
        </nav>
        <div className="repo-account">
          {session?.user ? (
            <>
              <span className="repo-avatar">
                {session.user.github ? <Github size={14} /> : "G"}
              </span>
              <span>{session.user.login}</span>
              <button
                title="Sign out"
                onClick={() =>
                  void act("logout", async () => {
                    await api("/auth/logout", {});
                    await refresh();
                    window.location.hash = "repositories";
                  })
                }
              >
                Sign out
              </button>
            </>
          ) : (
            <span className="repo-status-dot">Private workspaces</span>
          )}
        </div>
      </header>
      {error && (
        <div className="repo-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {!session ? (
        <main className="repo-loading" id="repo-main" tabIndex={-1}>
          <Loader2 className="spin" size={22} />
          <p>Connecting to your workspace…</p>
          {error && (
            <button
              className="repo-button"
              onClick={() => void act("retry", refresh)}
            >
              Try again
            </button>
          )}
        </main>
      ) : !project ? (
        <main className="repo-home" id="repo-main" tabIndex={-1}>
          <div className="repo-home-intro">
            <div>
              <div className="repo-eyebrow">
                <span /> Connected code. Verifiable repairs.
              </div>
              <h1>
                Fix an incident in
                <br />
                your own codebase.
              </h1>
              <p>
                Bring the repository and the bug. Rehearsal maps its
                dependencies, reproduces the failure, and tests a patch before
                you review it.
              </p>
              <div className="repo-home-steps">
                <span>01 Import</span>
                <i />
                <span>02 Reproduce</span>
                <i />
                <span>03 Rehearse</span>
                <i />
                <span>04 Review</span>
              </div>
            </div>
            <section className="repo-import">
              <div className="repo-section-kicker">Start a rehearsal</div>
              <h2>Connect your code.</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("import", async () => {
                    await ensureSession();
                    await imported(
                      await api<Project>("/projects/import", {
                        repository,
                        ref: branch,
                        directory,
                      }),
                    );
                  });
                }}
              >
                <label htmlFor="repo-url">GitHub repository</label>
                <div className="repo-url-field">
                  <Github size={17} />
                  <input
                    id="repo-url"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    placeholder="https://github.com/you/your-project"
                    required
                    maxLength={250}
                  />
                </div>
                <details className="repo-import-options">
                  <summary>
                    Branch & project directory <ChevronDown size={13} />
                  </summary>
                  <div>
                    <label htmlFor="repo-ref">
                      Branch or commit <span>Optional</span>
                    </label>
                    <input
                      id="repo-ref"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="Default branch"
                    />
                    <label htmlFor="repo-directory">
                      Project directory <span>For monorepos</span>
                    </label>
                    <input
                      id="repo-directory"
                      value={directory}
                      onChange={(e) => setDirectory(e.target.value)}
                      placeholder="e.g. packages/api"
                    />
                  </div>
                </details>
                <button
                  className="repo-button primary"
                  type="submit"
                  disabled={!!busy || !repository.trim()}
                >
                  {busy === "import" ? (
                    <>
                      <Loader2 className="spin" size={15} /> Importing snapshot…
                    </>
                  ) : (
                    <>
                      Import repository <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
              <div className="repo-import-divider">
                <span>or</span>
              </div>
              <div className="repo-import-alternatives">
                <button
                  className="repo-button"
                  disabled={!!busy}
                  onClick={() => uploadRef.current?.click()}
                >
                  <Upload size={14} />
                  {busy === "upload" ? "Uploading…" : "Upload a ZIP"}
                </button>
                {session.user?.github ? (
                  <button
                    className="repo-button"
                    disabled={!!busy}
                    onClick={() =>
                      void act("list", async () =>
                        setGithubRepos(await api("/github/repositories")),
                      )
                    }
                  >
                    <Github size={14} /> My repositories
                  </button>
                ) : session.github_configured ? (
                  <a
                    className={`repo-button ${!session.github_configured ? "disabled" : ""}`}
                    href={
                      session.github_configured
                        ? "/api/code/auth/github" +
                          (privateRepos ? "?private=true" : "")
                        : undefined
                    }
                    aria-disabled={!session.github_configured}
                  >
                    <Github size={14} /> Sign in with GitHub
                  </a>
                ) : null}
              </div>
              <input
                ref={uploadRef}
                className="repo-file-input"
                type="file"
                accept=".zip,application/zip"
                aria-label="Upload repository ZIP"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              {!session.user?.github && session.github_configured && (
                <label className="repo-checkbox">
                  <input
                    type="checkbox"
                    checked={privateRepos}
                    onChange={(e) => setPrivateRepos(e.target.checked)}
                  />{" "}
                  Include private repositories
                </label>
              )}
              <p className="repo-import-footnote">
                Python and Node.js / TypeScript · ZIP up to 12 MB
                <br />
                Public repositories work without signing in.
              </p>
              {!session.github_configured && (
                <p className="repo-config-note">
                  Try a public GitHub repository or upload a ZIP. Download the
                  verified patch to apply it locally.
                </p>
              )}
              {githubRepos && (
                <div className="repo-picker">
                  <div>
                    <strong>Your repositories</strong>
                    <button
                      aria-label="Close repositories"
                      onClick={() => setGithubRepos(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {githubRepos.map((r) => (
                    <button
                      key={r.name}
                      onClick={() => {
                        setRepository(r.name);
                        setGithubRepos(null);
                      }}
                    >
                      <FolderGit2 size={14} />
                      <span>{r.name}</span>
                      {r.private && <small>Private</small>}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          {projects.length > 0 && (
            <section className="repo-projects">
              <div className="repo-section-heading">
                <h2>Your repositories</h2>
                <span>{projects.length} snapshots</span>
              </div>
              {projects.map((p) => (
                <button key={p.id} onClick={() => choose(p)}>
                  <FolderGit2 size={18} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.runtime} · {p.file_count} files ·{" "}
                      {p.sha?.slice(0, 7) || "uploaded snapshot"}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </section>
          )}
          <section className="repo-starters">
            <div>
              <div className="repo-section-kicker">See a complete repair</div>
              <h2>Start with a small, real bug.</h2>
              <p>
                Reproduce a failing test or uncover a missing regression.
                These are real codebases; fixes are generated when you run them.
              </p>
            </div>
            <div>
              {session.examples.map((example, index) => (
                <button
                  key={example.id}
                  disabled={!!busy}
                  onClick={() =>
                    void act(example.id, async () => {
                      await ensureSession();
                      await imported(
                        await api<Project>("/examples/" + example.id, {}),
                      );
                    })
                  }
                >
                  <span className="repo-starter-number">0{index + 1}</span>
                  <span>
                    <small>
                      {example.runtime === "python"
                        ? "Python · unittest"
                        : "Node.js · node:test"}
                    </small>
                    <strong>{example.name.split(" / ")[1]}</strong>
                    <p>{example.description}</p>
                  </span>
                  {busy === example.id ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              ))}
            </div>
          </section>
          <footer className="repo-home-footer">
            <span>
              FalkorDB maps the impact. Sandboxes test the repair. You decide
              what ships.
            </span>
            <button
              onClick={() =>
                setFile({
                  path: "How your code is handled",
                  content:
                    "Imported code is stored in your workspace on the API server. GitHub tokens are encrypted on the server and never enter the runner. Relevant source and test output are sent to Backboard and its configured model provider to generate repairs. Tests run in isolated sandboxes. The cloud runner permits package-registry access during setup and blocks outbound traffic during tests. Local Docker tests have no network access. Credential files and recognized secrets are excluded during import; review the skipped-file list. Delete a repository from its settings to remove its stored source, graph, and run records. Provider-side retention is governed by those providers. Do not upload code you do not have permission to process.",
                })
              }
            >
              Code & privacy
            </button>
          </footer>
        </main>
      ) : (
        <main className="repo-workspace" id="repo-main" tabIndex={-1}>
          <div className="repo-workspace-heading">
            <div>
              <a href="#repositories" className="repo-back">
                <ArrowLeft size={13} /> Repositories
              </a>
              <h1>{project.name}</h1>
              <div className="repo-project-meta">
                <span>
                  <GitBranch size={13} />
                  {project.branch || "Snapshot"}
                </span>
                <code>
                  {project.sha?.slice(0, 10) || project.digest.slice(0, 10)}
                </code>
                <span>
                  {project.runtime === "python"
                    ? "Python"
                    : "Node.js / TypeScript"}
                </span>
                {project.private && <span>Private</span>}
              </div>
            </div>
            <div className="repo-workspace-heading-actions">
              <span
                className={`repo-run-status ${run?.status === "review" ? "success" : ""}`}
              >
                {running && <Loader2 size={13} className="spin" />}
                {run ? label(run.status) : "Ready to investigate"}
              </span>
              <button
                className="repo-button"
                onClick={() => void act("refresh", refresh)}
                disabled={!!busy}
                aria-label="Refresh workspace"
              >
                <RotateCw size={14} />
              </button>
            </div>
          </div>
          <div className="repo-workspace-grid">
            <aside className="repo-run-list">
              <div className="repo-section-heading">
                <h2>Rehearsals</h2>
                <span>{projectRuns.length}</span>
              </div>
              {projectRuns.length ? (
                projectRuns.map((r, i) => (
                  <button
                    key={r.id}
                    className={r.id === run?.id ? "selected" : ""}
                    onClick={() => {
                      setRunId(r.id);
                      setCandidateId("");
                      setReviewed(false);
                    }}
                  >
                    <span className="repo-run-index">
                      {String(projectRuns.length - i).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>
                        {r.incident.slice(0, 50)}
                        {r.incident.length > 50 ? "…" : ""}
                      </strong>
                      <small>{label(r.status)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="repo-sidebar-empty">
                  Your investigation and its evidence will be saved here.
                </p>
              )}
              <div className="repo-sidebar-summary">
                <span>
                  {project.file_count}
                  <small>files indexed</small>
                </span>
                <span>
                  {project.test_count}
                  <small>test files</small>
                </span>
                <span>
                  {project.graph.edges.length}
                  <small>import relationships</small>
                </span>
              </div>
              <details className="repo-settings">
                <summary>Repository settings</summary>
                <p>{project.skipped.length} files excluded during import.</p>
                {project.skipped.length > 0 && (
                  <button
                    onClick={() =>
                      setFile({
                        path: "Excluded files",
                        content: project.skipped.join("\n"),
                      })
                    }
                  >
                    View excluded files
                  </button>
                )}
                <button onClick={() => setConfirmDelete(true)}>
                  Delete repository
                </button>
                {confirmDelete && (
                  <div>
                    <p>Remove its source, graph, and rehearsal history?</p>
                    <button
                      className="repo-delete"
                      disabled={!!busy || running}
                      onClick={() =>
                        void act("delete", async () => {
                          await api(
                            `/projects/${project.id}`,
                            undefined,
                            "DELETE",
                          );
                          await refresh();
                          window.location.hash = "repositories";
                        })
                      }
                    >
                      Delete permanently
                    </button>
                    <button onClick={() => setConfirmDelete(false)}>
                      Keep repository
                    </button>
                  </div>
                )}
              </details>
            </aside>
            <div className="repo-investigation">
              <section className="repo-graph-panel">
                <div className="repo-panel-title">
                  <div>
                    <GitBranch size={15} />
                    <h2>Connected code</h2>
                  </div>
                  <span>FalkorDB · {project.graph.symbols.length} symbols</span>
                </div>
                <DependencyGraph
                  graph={project.graph}
                  focus={run?.context?.seeds}
                  onFile={(path) => void openFile(path)}
                />
                <p className="repo-graph-disclaimer">{project.graph.limits}</p>
              </section>
              <nav className="repo-tabs" aria-label="Investigation views">
                {[
                  "overview",
                  "patch",
                  "tests",
                  "activity",
                  "graph queries",
                ].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t === "graph queries"
                      ? "Graph evidence"
                      : t[0].toUpperCase() + t.slice(1)}
                    {t === "patch" && !!run?.candidates.length && (
                      <span>{run.candidates.length}</span>
                    )}
                  </button>
                ))}
              </nav>
              <section className="repo-evidence">
                {tab === "overview" &&
                  (!run ? (
                    <div className="repo-before-run">
                      <div className="repo-outline-icon">
                        <Code2 size={25} />
                      </div>
                      <h2>
                        The source is indexed.
                        <br />
                        Now, tell us what’s broken.
                      </h2>
                      <p>
                        Describe the failure and check the commands on the
                        right. Rehearsal will reproduce it and test proposed
                        repairs in separate sandboxes.
                      </p>
                      <div>
                        <span>
                          <Check size={13} /> Exact snapshot saved
                        </span>
                        <span>
                          <Check size={13} /> Dependency graph built
                        </span>
                        <span>
                          <Check size={13} /> {project.test_count} test files
                          found
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="repo-evidence-intro">
                        <div className="repo-section-kicker">
                          {label(run.status)}
                        </div>
                        <h2>
                          {run.status === "review"
                            ? "A tested patch is ready for your review."
                            : running
                              ? "Following the failure through your code."
                              : run.message || "Review the investigation."}
                        </h2>
                        <p>
                          {run.diagnosis ||
                            run.message ||
                            "Commands, graph queries, and generated changes will appear as each step completes."}
                        </p>
                      </div>
                      {run.candidates.map((c) => (
                        <button
                          key={c.id}
                          className={`repo-candidate ${c.id === run.recommended ? "recommended" : ""}`}
                          onClick={() => {
                            setCandidateId(c.id);
                            setTab("patch");
                          }}
                        >
                          <span className="repo-candidate-number">0{c.id}</span>
                          <span>
                            <strong>{c.title}</strong>
                            <small>
                              {label(c.status)}
                              {c.changes
                                ? ` · ${Object.keys(c.changes).length} files`
                                : ""}
                            </small>
                          </span>
                          <ArrowRight size={15} />
                        </button>
                      ))}
                      {run.context && (
                        <div className="repo-impact-summary">
                          <h3>What the graph connected</h3>
                          <p>
                            {run.context.files.length} files informed the
                            investigation. {run.context.affected_tests.length}{" "}
                            test files depend on the selected modules.
                          </p>
                          {run.context.owners.length > 0 && (
                            <p>
                              Owners:{" "}
                              {[
                                ...new Set(
                                  run.context.owners.map((o) => o.name),
                                ),
                              ].join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="repo-evidence-limit">
                        A passing run verifies the configured tests. Review
                        behavior, security, and production requirements before
                        merging.
                      </p>
                    </>
                  ))}
                {tab === "patch" &&
                  (candidate ? (
                    <>
                      <div className="repo-candidate-tabs">
                        {run.candidates.map((c) => (
                          <button
                            key={c.id}
                            className={candidate.id === c.id ? "selected" : ""}
                            onClick={() => setCandidateId(c.id)}
                          >
                            0{c.id} {c.title}
                            <span>{label(c.status)}</span>
                          </button>
                        ))}
                      </div>
                      <div className="repo-patch-intro">
                        <h2>{candidate.title}</h2>
                        <p>{candidate.reason || candidate.message}</p>
                        {candidate.message && candidate.reason && (
                          <p className="repo-bad">{candidate.message}</p>
                        )}
                      </div>
                      {candidate.patch && <Diff patch={candidate.patch} />}
                      <Review
                        candidate={candidate}
                        run={run}
                        project={project}
                        session={session}
                        reviewed={reviewed}
                        setReviewed={setReviewed}
                        busy={busy}
                        publish={() =>
                          void act("publish", async () => {
                            await api(`/runs/${run.id}/publish`, {
                              candidate_id: candidate.id,
                              digest: candidate.review_digest,
                            });
                            await refresh();
                          })
                        }
                      />
                    </>
                  ) : (
                    <div className="repo-empty-small">
                      Candidate patches will appear after the failure is
                      reproduced.
                    </div>
                  ))}
                {tab === "tests" && (
                  <>
                    <Log execution={run?.baseline} title="Original code" />
                    {run?.reproduction && (
                      <Log
                        execution={run.reproduction}
                        title="Original code + new regression test"
                      />
                    )}
                    {run?.candidates.map((c) => (
                      <div key={c.id}>
                        <Log
                          execution={c.trial}
                          title={`Candidate ${c.id} · ${c.title}`}
                        />
                        {c.verification && (
                          <Log
                            execution={c.verification}
                            title={`Candidate ${c.id} · independent repeat`}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
                {tab === "activity" && (
                  <div className="repo-timeline">
                    {run?.events.length ? (
                      run.events.map((event, i) => (
                        <div key={i}>
                          <span
                            className={
                              i === run.events.length - 1 && running
                                ? "current"
                                : ""
                            }
                          >
                            {i === run.events.length - 1 && running ? (
                              <Loader2 className="spin" size={13} />
                            ) : (
                              <Check size={12} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {event.stage[0].toUpperCase() +
                                event.stage.slice(1)}
                            </strong>
                            <p>{event.message}</p>
                            <time>
                              {new Date(event.at * 1000).toLocaleTimeString(
                                [],
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                },
                              )}
                            </time>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="repo-empty-small">
                        A chronological record of the investigation will appear
                        here.
                      </p>
                    )}
                  </div>
                )}
                {tab === "graph queries" && (
                  <div className="repo-queries">
                    <div className="repo-evidence-intro">
                      <h2>The graph selects the investigation context.</h2>
                      <p>
                        FalkorDB traverses imports from the reported failure,
                        finds dependent tests, and resolves ownership. Only
                        connected source files are eligible for generated edits.
                      </p>
                    </div>
                    {run?.context ? (
                      <>
                        {run.context.queries.map((q, i) => (
                          <section key={i}>
                            <div>
                              <strong>Query {i + 1}</strong>
                              <span>
                                {q.rows} rows · {q.duration_ms} ms
                              </span>
                            </div>
                            <pre>{q.query}</pre>
                          </section>
                        ))}
                        <h3>Editable files returned by the graph</h3>
                        {run.context.editable.map((path) => (
                          <button
                            key={path}
                            onClick={() => void openFile(path)}
                          >
                            <FileCode2 size={13} />
                            {path}
                          </button>
                        ))}
                      </>
                    ) : (
                      <p className="repo-empty-small">
                        Executed queries and selected files will appear during
                        the rehearsal.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
            <aside className="repo-incident-form">
              <div className="repo-section-kicker">New investigation</div>
              <h2>What’s going wrong?</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void start();
                }}
              >
                <label htmlFor="incident-description">
                  Incident or failing behavior
                </label>
                <textarea
                  id="incident-description"
                  value={incident}
                  onChange={(e) => setIncident(e.target.value)}
                  placeholder="What did you expect? What happened instead? Include a stack trace, filename, or failing example."
                  minLength={15}
                  maxLength={12000}
                  required
                  rows={7}
                />
                <label htmlFor="setup-command">
                  Setup command <span>Optional</span>
                </label>
                <textarea
                  id="setup-command"
                  rows={2}
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  maxLength={1500}
                  placeholder="No dependencies to install"
                  className="repo-command-input"
                />
                <label htmlFor="test-command">Test command</label>
                <textarea
                  id="test-command"
                  rows={2}
                  value={test}
                  onChange={(e) => setTest(e.target.value)}
                  maxLength={1500}
                  required
                  className="repo-command-input"
                />
                <p className="repo-command-help">
                  Runs in <code>{project.directory || "/"}</code>. Review
                  commands before starting.
                </p>
                <label className="repo-checkbox">
                  <input
                    type="checkbox"
                    checked={regression}
                    onChange={(e) => setRegression(e.target.checked)}
                  />
                  <span>
                    If existing tests pass, add a regression test to reproduce
                    this bug.
                  </span>
                </label>
                <button
                  className="repo-button primary"
                  type="submit"
                  disabled={
                    !!busy ||
                    running ||
                    incident.trim().length < 15 ||
                    !test.trim() ||
                    !session.sandbox.available ||
                    !session.provider_available ||
                    session.allowance?.remaining === 0
                  }
                >
                  {running ? (
                    <>
                      <Loader2 className="spin" size={14} /> Rehearsing…
                    </>
                  ) : (
                    <>
                      <Play size={14} /> Run rehearsal
                    </>
                  )}
                </button>
                {running && (
                  <button
                    className="repo-button"
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void act("cancel", async () => {
                        await api(`/runs/${run.id}/cancel`, {});
                        await refresh();
                      })
                    }
                  >
                    <Square size={11} /> Stop rehearsal
                  </button>
                )}
              </form>
              <div className="repo-execution-note">
                <div>
                  <span
                    className={
                      session.sandbox.available
                        ? "repo-connected"
                        : "repo-disconnected"
                    }
                  />
                  {session.sandbox.description}
                </div>
                {session.allowance && (
                  <p>
                    {session.allowance.remaining > 0
                      ? `${session.allowance.remaining} rehearsal${session.allowance.remaining === 1 ? "" : "s"} available under the current allowance.`
                      : `The current allowance is used. ${session.allowance.available_after ? "Available again " + new Date(session.allowance.available_after * 1000).toLocaleString() + "." : "Refresh later to check availability."}`}
                  </p>
                )}
                <p>
                  Each candidate starts from the same snapshot. Existing tests
                  stay intact. Passing repairs are repeated in a fresh sandbox.
                </p>
                <p>
                  Source context is sent to the repair model. Review the diff
                  and test evidence before applying a patch.
                </p>
                {!session.sandbox.available && (
                  <p className="repo-bad">
                    The server’s sandbox runner needs configuration before tests
                    can run.
                  </p>
                )}
                {!session.provider_available && (
                  <p className="repo-bad">
                    The server’s Backboard connection needs configuration before
                    repairs can be generated.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </main>
      )}
      <dialog
        ref={sourceRef}
        className="repo-source-dialog"
        onCancel={() => setFile(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setFile(null);
        }}
      >
        <div>
          <header>
            <div>
              <FileCode2 size={16} />
              <strong>{file?.path}</strong>
            </div>
            <button aria-label="Close file" onClick={() => setFile(null)}>
              <X size={18} />
            </button>
          </header>
          <pre tabIndex={0}>{file?.content}</pre>
        </div>
      </dialog>
    </div>
  );
}

function Review({
  candidate,
  run,
  project,
  session,
  reviewed,
  setReviewed,
  busy,
  publish,
}: {
  candidate: Candidate;
  run: CodeRun;
  project: Project;
  session: RepoSession;
  reviewed: boolean;
  setReviewed: (b: boolean) => void;
  busy: string;
  publish: () => void;
}) {
  if (candidate.status !== "verified" || run.status !== "review")
    return (
      <p className="repo-evidence-limit">
        This candidate has not passed repeat verification and cannot be
        published.
      </p>
    );
  return (
    <div className="repo-review">
      <div>
        <span className="repo-verified-icon">
          <Check size={16} />
        </span>
        <h3>The same checks passed in two fresh sandboxes.</h3>
      </div>
      <p>
        Review the diff above and the test logs. Your repository is unchanged.
      </p>
      {candidate.pull_request ? (
        <a
          className="repo-button primary"
          href={candidate.pull_request.url}
          target="_blank"
          rel="noreferrer"
        >
          Open draft PR #{candidate.pull_request.number}
          <ExternalLink size={14} />
        </a>
      ) : (
        <>
          <a
            className="repo-button"
            href={`/api/code/runs/${run.id}/patch/${candidate.id}`}
            download
          >
            <ArrowDownToLine size={14} /> Download patch
          </a>
          <p className="repo-apply-command">
            Apply locally from the imported commit:{" "}
            <code>git apply --check rehearsal-{run.id.slice(0, 8)}.patch</code>,
            then <code>git apply rehearsal-{run.id.slice(0, 8)}.patch</code>.
          </p>
          {project.source === "github" && session.user?.github ? (
            <>
              <label className="repo-checkbox">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  I reviewed this patch. Create a branch and draft pull request.
                  Repository CI may run.
                </span>
              </label>
              <button
                className="repo-button primary"
                disabled={!reviewed || !!busy}
                onClick={publish}
              >
                <GitBranch size={14} />
                {busy === "publish"
                  ? "Creating draft…"
                  : "Create draft pull request"}
              </button>
            </>
          ) : session.github_configured ? (
            <p>
              Import with a GitHub account that has write access to open a draft
              pull request directly.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
