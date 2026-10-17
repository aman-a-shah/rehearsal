import type { Workspace } from "../types";
import { ArrowRight, GitBranch } from "lucide-react";

const positions: Record<string, [number, number]> = {
  alder: [28, 42],
  beacon: [28, 111],
  cedar: [28, 185],
  rich: [300, 76],
  basic: [300, 185],
  enrichment: [572, 76],
  worker: [572, 185],
};

export function ImpactMap({
  data,
  onNode,
  onTrace,
}: {
  data: Workspace;
  onNode: (id: string) => void;
  onTrace: () => void;
}) {
  const { nodes, edges } = data.diagram;
  const healthy = Object.values(data.exports).every((e) => e.status === 200);
  const find = (id: string) => nodes.find((n) => n.id === id);
  function reaches(
    from: string,
    to: string,
    visited = new Set<string>(),
  ): boolean {
    if (from === to) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return edges
      .filter(
        (e) =>
          e.from === from &&
          ["IMPLEMENTED_BY", "CALLS", "RUNS_ON"].includes(e.type),
      )
      .some((e) => reaches(e.to, to, new Set(visited)));
  }
  const links = edges
    .filter((e) => e.type === "USES")
    .map((e) => ({ from: e.from, to: e.to, direct: true }));
  for (const capability of nodes.filter((n) => n.kind === "capability"))
    for (const service of nodes.filter((n) => n.kind === "service"))
      if (reaches(capability.id, service.id))
        links.push({ from: capability.id, to: service.id, direct: false });
  return (
    <section className="map-panel panel" aria-labelledby="impact-title">
      <div className="section-bar">
        <div className="section-label">
          <GitBranch size={16} />
          <h2 id="impact-title">Follow the impact</h2>
        </div>
        <button className="text-button" onClick={onTrace}>
          View graph query <ArrowRight size={14} />
        </button>
      </div>
      <div className="map-wrap">
        <svg
          className="dependency-map"
          viewBox="0 0 800 260"
          aria-label="Customer dependencies from FalkorDB"
        >
          <defs>
            <pattern
              id="map-dots"
              x="0"
              y="0"
              width="18"
              height="18"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.7" fill="#d5dae0" />
            </pattern>
          </defs>
          <rect width="800" height="260" fill="url(#map-dots)" />
          <text x="28" y="23" className="map-label">
            CUSTOMERS
          </text>
          <text x="300" y="23" className="map-label">
            CAPABILITIES
          </text>
          <text x="572" y="23" className="map-label">
            SERVICES
          </text>
          {links.map((edge) => {
            const a = positions[edge.from],
              b = positions[edge.to];
            if (!a || !b || !find(edge.from) || !find(edge.to)) return null;
            const affected =
              !healthy &&
              (data.context.affected.includes(edge.from) ||
                edge.to === "enrichment");
            const x = a[0] + 194,
              y = a[1] + 30,
              endX = b[0],
              endY = b[1] + 30;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={`M${x} ${y} C${x + 39} ${y}, ${endX - 39} ${endY}, ${endX} ${endY}`}
                  className={`map-edge ${affected ? "affected" : ""}`}
                />
                <circle
                  cx={endX - 2}
                  cy={endY}
                  r="3"
                  fill={affected ? "#cf6b4a" : "#b8c0ca"}
                />
              </g>
            );
          })}
          {Object.entries(positions).map(([id, [x, y]]) => {
            const node = find(id);
            if (!node) return null;
            const customer = node.kind === "customer";
            const failing = customer
              ? data.exports[id]?.status !== 200
              : id === "enrichment" && !healthy;
            const label = customer
              ? failing
                ? "Export unavailable"
                : "Export healthy"
              : id === "enrichment"
                ? healthy
                  ? "Bypassed by repair"
                  : "Invalid request format"
                : id === "worker"
                  ? "Shared by all customers"
                  : id === "rich"
                    ? "Requires enrichment"
                    : "Independent of enrichment";
            return (
              <g
                key={id}
                transform={`translate(${x} ${y})`}
                className={`map-node ${failing ? "failing" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onNode(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNode(id);
                  }
                }}
              >
                <title>
                  {node.name}: {label}
                </title>
                <rect className="node-surface" width="194" height="60" rx="8" />
                <rect
                  x="12"
                  y="17"
                  width="26"
                  height="26"
                  rx="6"
                  className="node-icon-bg"
                />
                <text
                  x="25"
                  y="35"
                  textAnchor="middle"
                  className="node-initial"
                  aria-hidden="true"
                >
                  {customer
                    ? node.name[0]
                    : node.kind === "capability"
                      ? "↗"
                      : "⌘"}
                </text>
                <text
                  x="49"
                  y="26"
                  className="node-title"
                  id={`node-name-${id}`}
                >
                  {node.name}
                </text>
                <text
                  x="49"
                  y="44"
                  className="node-subtitle"
                  id={`node-state-${id}`}
                >
                  {label}
                </text>
                <circle
                  cx="181"
                  cy="13"
                  r="3"
                  fill={failing ? "#cc593d" : customer ? "#36816a" : "#a3adb8"}
                />
              </g>
            );
          })}
        </svg>
        <div className="mobile-paths">
          {data.context.paths.map((path) => (
            <button key={path.customer} onClick={() => onNode(path.customer)}>
              <strong>{find(path.customer)?.name}</strong>
              <ArrowRight size={14} />
              <span>{find(path.capability)?.name}</span>
              <ArrowRight size={14} />
              <span>Enrichment</span>
            </button>
          ))}
          <button onClick={() => onNode("cedar")}>
            <strong>Cedar</strong>
            <ArrowRight size={14} />
            <span>Basic export</span>
            <span className="healthy-text">Healthy</span>
          </button>
        </div>
      </div>
      <div className="map-caption">
        <span className="legend">
          <i className={healthy ? "good-dot" : "bad-dot"} />
          {healthy ? "Customer exports restored" : "Affected dependency path"}
        </span>
        <span>Cedar shares the worker, but never calls enrichment.</span>
      </div>
    </section>
  );
}
