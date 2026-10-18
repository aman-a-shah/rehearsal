import { useEffect, useState } from "react";
import { ArrowRight, Clock3, LoaderCircle, Play } from "lucide-react";
import { Experiments } from "../components/Experiments";
import { PolicyLab } from "../components/PolicyLab";
import { RunTimeline } from "../components/RunTimeline";
import { ViewTabs } from "../components/ViewTabs";
import { RepairWorkbench } from "../components/RepairWorkbench";
import { BoundaryTests } from "../components/BoundaryTests";
import { PEOPLE, type Workspace, type Run, type Trial } from "../types";

type View = "overview" | "repairs" | "lab" | "activity" | "boundaries";
const readView = (): View => {
  const value = window.location.hash.split("/")[1];
  return ["repairs", "lab", "activity", "boundaries"].includes(value)
    ? (value as View)
    : "overview";
};
type Props = {
  data: Workspace;
  run: Run | null;
  now: number;
  running: boolean;
  busy: boolean;
  onRun: (mode: "guided" | "live") => void;
  onTrial: (trial: Trial) => void;
  onSource: (key: string) => void;
  onNode: (id: string, trial?: Trial) => void;
  onTrace: () => void;
  onGraphTrace: () => void;
  onReview: () => void;
  onHelp: () => void;
  onDecisions: () => void;
  onConnections: () => void;
};

export function Incident({
  data,
  run,
  now,
  running,
  busy,
  onRun,
  onTrial,
  onSource,
  onNode,
  onTrace,
  onGraphTrace,
  onReview,
  onDecisions,
  onConnections,
}: Props) {
  const [mode, setMode] = useState<"guided" | "live">(
    data.provider.available && data.access.can_use_provider ? "live" : "guided",
  );
  const [view, setView] = useState<View>(readView);
  useEffect(() => {
    const listener = () => setView(readView());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  const broken = Object.values(data.exports).filter(
    (e) => e.status !== 200,
  ).length;
  const resolved = broken === 0;
  const stale =
    !!run?.proposal &&
    (run.proposal.context_hash !== data.context.fingerprint ||
      data.changes.length > 0);
  const expired = !!run?.proposal && now >= run.proposal.expires_at;
  const ready =
    !!run?.proposal && run.status === "awaiting_approval" && !stale && !expired;
  const cacheExpired =
    now - data.runtime.cache.timestamp >
    Number(data.context.values["worker:cache_max_age"]);
  function changeView(next: View) {
    setView(next);
    window.location.hash =
      next === "overview" ? "incident" : `incident/${next}`;
  }
  return (
    <div className="incident-workspace">
      <header className="incident-heading">
        <div className="incident-title">
          <div className="incident-kicker">
            <span className="mono">INC-204</span>
            <span className={`status-tag ${resolved ? "success" : "incident"}`}>
              <i className={resolved ? "good-dot" : "bad-dot"} />
              {resolved
                ? "Resolved"
                : running
                  ? "Investigating"
                  : ready
                    ? "Awaiting approval"
                    : run?.status === "blocked"
                      ? "Escalated"
                      : "Open"}
            </span>
            <span>Harbor / Export pipeline</span>
          </div>
          <h1>
            {resolved ? "Export pipeline recovered" : "Export pipeline failure"}
          </h1>
          <p>
            {resolved
              ? "Approved repair applied. Customer exports verified."
              : "Alder and Beacon cannot export. Cedar is still available."}
          </p>
        </div>
        <div className="incident-actions">
          <label className="sr-only" htmlFor="run-mode">
            Execution mode
          </label>
          <select
            id="run-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "guided" | "live")}
            disabled={running || busy}
          >
            <option value="guided">Demo · real tools</option>
            <option
              value="live"
              disabled={
                !data.provider.available || !data.access.can_use_provider
              }
            >
              Backboard agent
              {!data.access.can_use_provider
                ? " · operator access"
                : data.provider.available
                  ? ""
                  : " · connect key"}
            </option>
          </select>
          {resolved ? (
            <button className="primary" onClick={onDecisions}>
              Open decision log <ArrowRight size={14} />
            </button>
          ) : ready ? (
            <button className="primary" onClick={onReview}>
              Review proposed repair <ArrowRight size={14} />
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => onRun(mode)}
              disabled={running || busy || data.changes.length > 0}
            >
              {running ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Play size={12} />
              )}{" "}
              {running
                ? "Investigating…"
                : run
                  ? "Run a fresh rehearsal"
                  : "Run rehearsal"}
            </button>
          )}
        </div>
      </header>
      <div className="workspace-viewbar">
        <ViewTabs
          label="Incident views"
          value={view}
          onChange={changeView}
          items={[
            { id: "overview", label: "Workbench" },
            {
              id: "repairs",
              label: "Comparison",
              count: run?.trials.length || 0,
            },
            { id: "lab", label: "Policy lab" },
            { id: "boundaries", label: "Boundary tests" },
            {
              id: "activity",
              label: "Activity",
              count: run?.events.length || 0,
            },
          ]}
        />
        <div className="incident-owner">
          <span className="avatar">
            {PEOPLE[String(data.context.values["worker:owner"])]?.initials}
          </span>
          <span>
            {PEOPLE[String(data.context.values["worker:owner"])]?.name}
          </span>
          <span className="owner-role">Accountable owner</span>
        </div>
      </div>
      {(stale || (expired && !resolved)) && (
        <div className="notice" role="status">
          <Clock3 size={14} />
          <span>
            {stale ? "Company evidence changed." : "This proposal has expired."}{" "}
            Run a fresh rehearsal before approving.
          </span>
        </div>
      )}
      {run?.message && (
        <div className="notice" role="status">
          {run.message}
        </div>
      )}
      {!run && cacheExpired && !resolved && (
        <div className="notice">
          <Clock3 size={14} />
          <span>
            The sample cache is now outside its policy. Reset the sample
            workspace for a fresh demo, or run to inspect the rejection.
          </span>
        </div>
      )}
      <div role="tabpanel" id={`view-${view}`} aria-labelledby={`tab-${view}`}>
        {view === "overview" ? (
          <RepairWorkbench
            data={data}
            run={run}
            running={running}
            now={now}
            onTrial={onTrial}
            onNode={onNode}
            onSource={onSource}
            onTrace={onTrace}
            onGraphTrace={onGraphTrace}
            onRun={() => onRun(mode)}
          />
        ) : view === "repairs" ? (
          <div className="comparison-view">
            <header>
              <h2>Compare repairs</h2>
              <p>
                Select a repair to inspect its output and requirement checks.
              </p>
            </header>
            <Experiments run={run} running={running} onTrial={onTrial} />
          </div>
        ) : view === "lab" ? (
          <PolicyLab data={data} onTrial={onTrial} onSource={onSource} />
        ) : view === "boundaries" ? (
          <BoundaryTests data={data} onTrial={onTrial} />
        ) : (
          <RunTimeline run={run} running={running} onTrace={onTrace} />
        )}
      </div>
      <div className="incident-statusline">
        <span>
          <i className={running ? "preview-dot" : "good-dot"} />
          <span>
            {running
              ? "Investigation running"
              : resolved
                ? "Recovery verified"
                : ready
                  ? `Awaiting owner · ${Math.max(0, Math.ceil(run!.proposal!.expires_at - now))}s remaining`
                  : run?.status === "blocked"
                    ? "No eligible repair"
                    : "Ready"}
          </span>
          <span className="statusline-divider">/</span>
          <span className="mono">context r{data.context.revision}</span>
        </span>
        <button onClick={onConnections}>
          {data.provider.available
            ? `${data.provider.name} connected`
            : "Connect Backboard"}
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
