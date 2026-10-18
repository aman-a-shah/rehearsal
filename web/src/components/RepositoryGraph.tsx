import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
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
import {
  connectionLayout,
  repositoryLayout,
  routedConnection,
  type Point,
} from "./repositoryGraphLayout";

type View = Point & { scale: number };

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
  const [size, setSize] = useState({ width: 1360, height: 280 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selection, setSelection] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("repository");
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ origin: Point; view: View } | null>(null);
  const files = useMemo(
    () =>
      graph.nodes
        .filter((node) => node.kind !== "document")
        .sort((a, b) => a.path.localeCompare(b.path)),
    [graph],
  );
  const defaultFile = useMemo(() => {
    const degree = new Map(files.map((file) => [file.path, 0]));
    graph.edges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    });
    return (
      files
        .filter((file) => file.kind === "source")
        .sort(
          (a, b) =>
            (degree.get(b.path) || 0) - (degree.get(a.path) || 0) ||
            a.path.localeCompare(b.path),
        )[0]?.path ||
      files[0]?.path ||
      ""
    );
  }, [files, graph]);
  const selected =
    selection ||
    changed.find((path) => files.some((file) => file.path === path)) ||
    context?.seeds.find((path) => files.some((file) => file.path === path)) ||
    defaultFile;
  const node = files.find((file) => file.path === selected);
  const directEdges = graph.edges.filter(
    (edge) => edge.source === selected || edge.target === selected,
  );
  const imports = directEdges
    .filter((edge) => edge.source === selected)
    .map((edge) => edge.target);
  const consumers = directEdges
    .filter((edge) => edge.target === selected)
    .map((edge) => edge.source);
  const neighbors = new Set([selected, ...imports, ...consumers]);
  const matches = files.filter((file) =>
    file.path.toLowerCase().includes(search.toLowerCase()),
  );
  const focused = mode === "connections";
  const renderedFiles = useMemo(() => {
    const selectedPaths = new Set([
      selected,
      ...graph.edges.flatMap((edge) =>
        edge.source === selected
          ? [edge.target]
          : edge.target === selected
            ? [edge.source]
            : [],
      ),
    ]);
    const relevant = focused
      ? files.filter((file) => selectedPaths.has(file.path))
      : files;
    // Selection/search can bring any file into a bounded view of a large repository.
    const chosen =
      relevant.length > 160
        ? [...relevant]
            .sort(
              (a, b) =>
                Number(b.path === selected) - Number(a.path === selected) ||
                Number(selectedPaths.has(b.path)) -
                  Number(selectedPaths.has(a.path)) ||
                a.path.localeCompare(b.path),
            )
            .slice(0, 160)
        : relevant;
    return chosen.sort((a, b) => a.path.localeCompare(b.path));
  }, [files, graph, focused, files.length > 160 || focused ? selected : ""]);
  const drawing = useMemo(
    () =>
      focused
        ? connectionLayout(renderedFiles, selected, imports, consumers)
        : repositoryLayout(renderedFiles, size.width),
    [renderedFiles, focused, size.width, focused ? selected : ""],
  );
  const edges = directEdges.filter(
    (edge) =>
      drawing.positions.has(edge.source) && drawing.positions.has(edge.target),
  );
  const owners = graph.ownership
    .filter((owner) => owner.path === selected)
    .map((owner) => owner.name);

  function fit() {
    // Keep labels readable. If a very large graph cannot fit, it remains pannable.
    const scale = Math.max(
      0.9,
      Math.min(
        1,
        (size.width - 12) / drawing.width,
        (size.height - 12) / drawing.height,
      ),
    );
    const point = drawing.positions.get(selected);
    setView({
      scale,
      x:
        point && drawing.width * scale > size.width
          ? size.width / 2 - (point.x + point.width / 2) * scale
          : Math.max(8, (size.width - drawing.width * scale) / 2),
      y:
        point && drawing.height * scale > size.height
          ? size.height / 2 - (point.y + point.height / 2) * scale
          : Math.max(8, (size.height - drawing.height * scale) / 2),
    });
  }
  function zoom(factor: number) {
    setView((previous) => {
      const scale = Math.max(0.35, Math.min(2.5, previous.scale * factor));
      const ratio = scale / previous.scale;
      return {
        scale,
        x: size.width / 2 - (size.width / 2 - previous.x) * ratio,
        y: size.height / 2 - (size.height / 2 - previous.y) * ratio,
      };
    });
  }
  function select(path: string, center = false) {
    setSelection(path);
    if (center && !focused) {
      const point = drawing.positions.get(path);
      if (point)
        setView((previous) => ({
          ...previous,
          x: size.width / 2 - (point.x + point.width / 2) * previous.scale,
          y: size.height / 2 - (point.y + point.height / 2) * previous.scale,
        }));
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
    if (selection) return;
    const point = drawing.positions.get(selected);
    if (!point) return;
    // A small viewport cannot show the entire repository at a readable scale.
    // Follow newly investigated/patched files only if they move out of view.
    setView((previous) => {
      const left = point.x * previous.scale + previous.x;
      const top = point.y * previous.scale + previous.y;
      const right = left + point.width * previous.scale;
      const bottom = top + point.height * previous.scale;
      const x =
        left < 0 || right > size.width
          ? size.width / 2 - (point.x + point.width / 2) * previous.scale
          : previous.x;
      const y =
        top < 0 || bottom > size.height
          ? size.height / 2 - (point.y + point.height / 2) * previous.scale
          : previous.y;
      return x === previous.x && y === previous.y
        ? previous
        : { ...previous, x, y };
    });
  }, [selected, selection, drawing, size.width, size.height]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);

  return (
    <section
      className={`repo-graph-explorer ${expanded ? "expanded" : ""}`}
      aria-label="Repository dependency graph"
    >
      <div className="repo-graph-toolbar">
        <div className="repo-graph-mode" aria-label="Graph view">
          <button aria-pressed={!focused} onClick={() => setMode("repository")}>
            Repository
          </button>
          <button
            aria-pressed={focused}
            onClick={() => setMode("connections")}
            disabled={!node}
          >
            File connections
          </button>
        </div>
        <span className="repo-graph-instruction">
          Select a file to trace its connections
        </span>
        <div className="repo-graph-search">
          <Search size={14} />
          <input
            aria-label="Find a file in the graph"
            placeholder="Find a file…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearch("");
            }}
          />
          {search && (
            <div className="repo-graph-matches">
              {matches.slice(0, 12).map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    select(file.path, true);
                    setSearch("");
                  }}
                >
                  {file.path}
                </button>
              ))}
              {!matches.length && <p>No matching files.</p>}
            </div>
          )}
        </div>
        <div className="repo-graph-navigation">
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
            <Minus size={14} />
          </button>
          <button aria-label="Zoom in" onClick={() => zoom(1.2)}>
            <Plus size={14} />
          </button>
          <button aria-label="Fit graph to view" onClick={fit}>
            <Focus size={15} />
          </button>
          <button
            aria-label={expanded ? "Exit expanded graph" : "Expand graph"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
      <div className="repo-graph-canvas" ref={canvas}>
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label="Dependency map. Only connections to the selected file are drawn. Drag to pan; plus and minus zoom."
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
            <marker
              id={`${id}-arrow`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path
                d="M1,1 L6,3.5 L1,6"
                fill="none"
                stroke="#52745b"
                strokeWidth="1.2"
              />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {drawing.headings.map((heading) => (
              <text
                key={heading.text}
                x={heading.x}
                y={heading.y}
                className="repo-graph-group-label"
              >
                {heading.text}
              </text>
            ))}
            {edges.map((edge, index) => (
              <path
                key={`${edge.source}:${edge.target}`}
                data-source={edge.source}
                data-target={edge.target}
                className="repo-graph-edge"
                d={routedConnection(
                  drawing.positions.get(edge.source)!,
                  drawing.positions.get(edge.target)!,
                  index,
                  focused,
                )}
                markerEnd={`url(#${id}-arrow)`}
              />
            ))}
            {renderedFiles.map((file) => {
              const point = drawing.positions.get(file.path);
              if (!point) return null;
              const modified = changed.includes(file.path),
                chosen = selected === file.path;
              const parts = file.path.split("/"),
                basename = parts.pop()!;
              const length = Math.floor((point.width - 32) / 7.3);
              const filename =
                basename.length > length
                  ? basename.slice(0, length - 1) + "…"
                  : basename;
              const directory = (parts.join("/") || "root").slice(
                -Math.floor((point.width - 28) / 5.7),
              );
              return (
                <g
                  key={file.path}
                  data-file={file.path}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${filename} ${directory} (${file.path})`}
                  aria-pressed={chosen}
                  className={`repo-graph-file ${file.kind} ${modified ? "changed" : ""} ${chosen ? "selected" : neighbors.has(file.path) ? "connected" : ""}`}
                  onClick={() => select(file.path)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(file.path);
                    }
                  }}
                >
                  <title>
                    {file.path}
                    {modified ? " — changed by selected patch" : ""}
                    {context?.editable.includes(file.path)
                      ? " — in repair scope"
                      : ""}
                  </title>
                  <rect width={point.width} height={point.height} rx="4" />
                  <circle cx="12" cy="15" r="2.6" />
                  <text x="24" y="18" className="repo-graph-filename">
                    {filename}{" "}
                  </text>
                  <text
                    x="24"
                    y="32"
                    className="repo-graph-directory"
                    aria-hidden="true"
                  >
                    {directory}
                  </text>
                  {modified && (
                    <path
                      className="repo-graph-patch-mark"
                      d={`M${point.width - 12},29 l2,2 l4,-5`}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {!renderedFiles.length && (
          <p className="repo-graph-empty">
            No code files were found in this snapshot.
          </p>
        )}
      </div>
      <div
        className="repo-graph-selection"
        role="group"
        aria-label="Selected file"
      >
        {node ? (
          <>
            <Code2 size={14} />
            <strong title={node.path}>{node.path}</strong>
            <span className="repo-graph-relationship">
              Imported by <b>{consumers.length}</b> · Imports{" "}
              <b>{imports.length}</b>
            </span>
            {changed.includes(node.path) && (
              <span className="repo-graph-patched">Patched</span>
            )}
            {owners.length > 0 && (
              <span className="repo-graph-owner">{owners.join(", ")}</span>
            )}
            <button
              className="repo-graph-open"
              onClick={() => onFile(node.path)}
            >
              View source <ArrowRight size={13} />
            </button>
            {selection && (
              <button
                className="repo-icon-button"
                aria-label="Follow the repair automatically"
                title="Follow the repair automatically"
                onClick={() => setSelection(null)}
              >
                <X size={13} />
              </button>
            )}
          </>
        ) : (
          <span>Select a source file to inspect its dependencies.</span>
        )}
        {files.length > 160 && (
          <span className="repo-graph-cap">
            160-file view · search any file
          </span>
        )}
      </div>
    </section>
  );
}
