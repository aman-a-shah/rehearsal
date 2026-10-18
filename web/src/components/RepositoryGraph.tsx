import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Code2,
  Focus,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { CodeRun, RepoGraph } from "../repositoryTypes";

type Point = { x: number; y: number };
type View = Point & { scale: number };

function layout(graph: RepoGraph, paths: Set<string>) {
  const nodes = graph.nodes.filter((node) => paths.has(node.path));
  const dependencies = new Map(
    nodes.map((node) => [
      node.path,
      graph.edges
        .filter((edge) => edge.source === node.path && paths.has(edge.target))
        .map((edge) => edge.target),
    ]),
  );
  const ranks = new Map<string, number>();
  function rank(path: string, visiting = new Set<string>()): number {
    if (ranks.has(path)) return ranks.get(path)!;
    if (visiting.has(path)) return 0;
    const branch = new Set([...visiting, path]);
    const value = Math.min(
      4,
      Math.max(
        -1,
        ...(dependencies.get(path) || []).map((next) => rank(next, branch)),
      ) + 1,
    );
    ranks.set(path, value);
    return value;
  }
  nodes
    .filter((node) => node.kind !== "test")
    .forEach((node) => rank(node.path));
  const last = Math.max(0, ...ranks.values()) + 1;
  nodes
    .filter((node) => node.kind === "test")
    .forEach((node) => ranks.set(node.path, last));
  const columns = Array.from({ length: last + 1 }, (_, index) =>
    nodes
      .filter((node) => ranks.get(node.path) === index)
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
  const height = Math.max(
    250,
    ...columns.map((column) => column.length * 56 + 64),
  );
  const positions = new Map<string, Point>();
  columns.forEach((column, col) =>
    column.forEach((node, row) =>
      positions.set(node.path, {
        x: col * 210 + 24,
        y: (height - column.length * 56) / 2 + row * 56,
      }),
    ),
  );
  return { nodes, positions, width: columns.length * 210 + 24, height };
}

export default function RepositoryGraph({
  graph,
  context,
  changed = [],
  onFile,
}: {
  graph: RepoGraph;
  context?: CodeRun["context"];
  changed?: string[];
  onFile: (path: string) => void;
}) {
  const id = useId().replaceAll(":", "");
  const canvas = useRef<HTMLDivElement>(null);
  const selection = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 900, height: 500 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ origin: Point; view: View } | null>(null);
  const fullGraph = useMemo(
    () => graph.nodes.filter((node) => node.kind !== "document"),
    [graph],
  );
  const drawing = useMemo(() => {
    const allowed = new Set(
      scope === "context" ? context?.files : fullGraph.map((node) => node.path),
    );
    // Keep the initial bounded rendering deterministic; disclose the cap in the UI.
    const paths = [...fullGraph]
      .filter((node) => allowed.has(node.path))
      .sort(
        (a, b) =>
          Number(changed.includes(b.path)) - Number(changed.includes(a.path)) ||
          Number(context?.seeds.includes(b.path)) -
            Number(context?.seeds.includes(a.path)) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 160)
      .map((node) => node.path);
    return layout(graph, new Set(paths));
  }, [
    graph,
    fullGraph,
    scope,
    context?.files.join("|"),
    context?.seeds.join("|"),
    changed.join("|"),
  ]);
  const node = graph.nodes.find((item) => item.path === selected);
  const neighbors = useMemo(
    () =>
      new Set([
        selected,
        ...graph.edges.flatMap((edge) =>
          edge.source === selected
            ? [edge.target]
            : edge.target === selected
              ? [edge.source]
              : [],
        ),
      ]),
    [graph, selected],
  );
  const matches = fullGraph.filter((item) =>
    item.path.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleEdges = graph.edges.filter(
    (edge) =>
      drawing.positions.has(edge.source) && drawing.positions.has(edge.target),
  );

  function fit() {
    const scale = Math.min(
      1.2,
      (size.width - 36) / drawing.width,
      (size.height - 36) / drawing.height,
    );
    setView({
      scale,
      x: (size.width - drawing.width * scale) / 2,
      y: (size.height - drawing.height * scale) / 2,
    });
  }
  function zoom(factor: number) {
    setView((previous) => {
      const scale = Math.max(0.15, Math.min(2.5, previous.scale * factor));
      const ratio = scale / previous.scale;
      return {
        scale,
        x: size.width / 2 - (size.width / 2 - previous.x) * ratio,
        y: size.height / 2 - (size.height / 2 - previous.y) * ratio,
      };
    });
  }
  function select(path: string, center = false) {
    setSelected(path);
    if (center) {
      const point = drawing.positions.get(path);
      if (point)
        setView({
          scale: 1.1,
          x: size.width / 2 - (point.x + 84) * 1.1,
          y: size.height / 2 - (point.y + 23) * 1.1,
        });
    }
  }
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(fit, [size.width, size.height, drawing]);
  useEffect(() => {
    if (selected) selection.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);

  return (
    <div className={`repo-graph-explorer ${expanded ? "expanded" : ""}`}>
      <div className="repo-graph-toolbar">
        <div className="repo-graph-scope" aria-label="Graph scope">
          <button
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            All files <span>{fullGraph.length}</span>
          </button>
          <button
            aria-pressed={scope === "context"}
            disabled={!context}
            onClick={() => setScope("context")}
          >
            Investigation <span>{context?.files.length ?? "—"}</span>
          </button>
        </div>
        <div className="repo-graph-search">
          <Search size={14} />
          <input
            aria-label="Find a file in the graph"
            placeholder="Find a file…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <div className="repo-graph-matches">
              {matches.slice(0, 12).map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    setScope("all");
                    select(item.path, true);
                    setSearch("");
                  }}
                >
                  {item.path}
                </button>
              ))}
              {!matches.length && <p>No matching files.</p>}
            </div>
          )}
        </div>
        <button
          className="repo-icon-button"
          aria-label={expanded ? "Exit expanded graph" : "Expand graph"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="repo-graph-canvas" ref={canvas}>
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label="Interactive repository dependency graph. Select a file to inspect its relationships."
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (
              [
                "+",
                "=",
                "-",
                "0",
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
              ].includes(event.key)
            )
              event.preventDefault();
            if (event.key === "+" || event.key === "=") zoom(1.2);
            if (event.key === "-") zoom(1 / 1.2);
            if (event.key === "0") fit();
            if (event.key.startsWith("Arrow"))
              setView((previous) => ({
                ...previous,
                x:
                  previous.x +
                  (event.key === "ArrowLeft"
                    ? 40
                    : event.key === "ArrowRight"
                      ? -40
                      : 0),
                y:
                  previous.y +
                  (event.key === "ArrowUp"
                    ? 40
                    : event.key === "ArrowDown"
                      ? -40
                      : 0),
              }));
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target as Element).closest("[data-file]")
            )
              return;
            drag.current = {
              origin: { x: event.clientX, y: event.clientY },
              view,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setView({
                ...drag.current.view,
                x: drag.current.view.x + event.clientX - drag.current.origin.x,
                y: drag.current.view.y + event.clientY - drag.current.origin.y,
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id={`${id}-dots`}
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.7" fill="#ced8cd" />
            </pattern>
            <marker
              id={`${id}-arrow`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M1,1 L6,3.5 L1,6" fill="none" stroke="context-stroke" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {visibleEdges.map((edge) => {
              const a = drawing.positions.get(edge.source)!,
                b = drawing.positions.get(edge.target)!;
              const sameColumn = a.x === b.x;
              const from = {
                x: a.x + (sameColumn || a.x < b.x ? 168 : 0),
                y: a.y + 24,
              };
              const to = { x: b.x + (a.x >= b.x ? 168 : 0), y: b.y + 24 };
              const bend = sameColumn ? from.x + 26 : (from.x + to.x) / 2;
              const highlight =
                selected &&
                (edge.source === selected || edge.target === selected);
              return (
                <path
                  key={`${edge.source}:${edge.target}`}
                  className={`repo-graph-edge ${highlight ? "selected" : selected ? "dimmed" : ""}`}
                  d={`M${from.x},${from.y} C${bend},${from.y} ${bend},${to.y} ${to.x},${to.y}`}
                  markerEnd={`url(#${id}-arrow)`}
                />
              );
            })}
            {drawing.nodes.map((item) => {
              const point = drawing.positions.get(item.path)!;
              const modified = changed.includes(item.path),
                seed = context?.seeds.includes(item.path),
                included = context?.files.includes(item.path);
              const dimmed =
                (selected && !neighbors.has(item.path)) ||
                (search &&
                  !item.path.toLowerCase().includes(search.toLowerCase()));
              const parts = item.path.split("/"),
                basename = parts.pop()!;
              const filenameLabel =
                basename.length > 20 ? basename.slice(0, 18) + "…" : basename;
              const directoryLabel =
                (parts.join("/") || "root").slice(-25) +
                (modified ? " · changed" : "");
              return (
                <g
                  data-file={item.path}
                  key={item.path}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${filenameLabel} ${directoryLabel} (${item.path})`}
                  aria-pressed={selected === item.path}
                  className={`repo-graph-file ${item.kind} ${modified ? "changed" : seed ? "seed" : included ? "included" : ""} ${selected === item.path ? "selected" : ""} ${dimmed ? "dimmed" : ""}`}
                  onClick={() =>
                    select(selected === item.path ? "" : item.path)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(item.path);
                    }
                  }}
                >
                  <title>{item.path}</title>
                  <rect width="168" height="48" rx="5" />
                  <circle cx="13" cy="17" r="3" />
                  <text x="24" y="21" className="repo-graph-filename">
                    {filenameLabel}{" "}
                  </text>
                  <text
                    x="24"
                    y="36"
                    className="repo-graph-directory"
                    aria-hidden="true"
                  >
                    {directoryLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {!drawing.nodes.length && (
          <p className="repo-graph-empty">
            No code files are available in this view.
          </p>
        )}
        <div className="repo-graph-navigation">
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus size={15} />
          </button>
          <button aria-label="Fit graph to view" onClick={fit}>
            <Focus size={16} />
          </button>
        </div>
        <span className="repo-graph-hint">
          Drag to pan · + / − to zoom · select a file
        </span>
      </div>
      <div className="repo-graph-legend">
        <span>
          <i className="source" /> Source
        </span>
        <span>
          <i className="test" /> Test
        </span>
        {context && (
          <>
            <span>
              <i className="seed" /> Starting point
            </span>
            <span>
              <i className="included" /> In context
            </span>
          </>
        )}
        {!!changed.length && (
          <span>
            <i className="changed" /> Patched
          </span>
        )}
        <span className="repo-graph-edge-count">
          {drawing.nodes.length} files · {visibleEdges.length} imports · arrows
          point to dependencies
          {fullGraph.length > 160 ? " · view capped at 160 files" : ""}
        </span>
      </div>
      {node && (
        <section
          ref={selection}
          className="repo-graph-selection"
          aria-label="Selected file"
        >
          <div>
            <Code2 size={17} />
            <strong>{node.path}</strong>
            <button
              className="repo-icon-button"
              aria-label="Clear file selection"
              onClick={() => setSelected("")}
            >
              <X size={15} />
            </button>
          </div>
          <p>
            {node.lines} lines ·{" "}
            {node.editable ? "Source file" : "Protected test or configuration"}
            {context?.editable.includes(node.path)
              ? " · Eligible for repair"
              : ""}
            {changed.includes(node.path) ? " · Changed by selected patch" : ""}
          </p>
          <div className="repo-graph-file-detail">
            <span>
              Imports{" "}
              <b>
                {graph.edges.filter((edge) => edge.source === node.path).length}
              </b>
            </span>
            <span>
              Imported by{" "}
              <b>
                {graph.edges.filter((edge) => edge.target === node.path).length}
              </b>
            </span>
            {graph.ownership
              .filter((owner) => owner.path === node.path)
              .map((owner) => (
                <span key={owner.name}>{owner.name}</span>
              ))}
            <button className="repo-button" onClick={() => onFile(node.path)}>
              View source <Code2 size={13} />
            </button>
          </div>
          <div className="repo-graph-neighbors">
            {[...neighbors]
              .filter((path) => path !== node.path)
              .map((path) => (
                <button key={path} onClick={() => select(path)}>
                  {path}
                </button>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
