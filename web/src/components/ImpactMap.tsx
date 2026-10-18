import { useState } from "react";
import { ArrowRight, ArrowUpRight, GitBranch, Layers2 } from "lucide-react";
import type { Trial, Workspace } from "../types";

const simple: Record<string, [number, number]> = {
  alder: [24, 48],
  beacon: [24, 128],
  cedar: [24, 222],
  rich: [352, 88],
  basic: [352, 222],
  enrichment: [680, 88],
  worker: [680, 222],
};
const expanded: Record<string, [number, number]> = {
  alder: [18, 50],
  beacon: [18, 130],
  cedar: [18, 240],
  rich: [240, 90],
  basic: [240, 240],
  "build-rich": [462, 90],
  "build-basic": [462, 240],
  enrich: [684, 90],
  worker: [684, 240],
  enrichment: [906, 90],
};

export function ImpactMap({
  data,
  trial,
  onNode,
  onTrace,
}: {
  data: Workspace;
  trial?: Trial;
  onNode: (id: string) => void;
  onTrace: () => void;
}) {
  const [detail, setDetail] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const { nodes, edges } = data.diagram;
  const outputs = trial?.exports || data.exports;
  const healthy = Object.values(outputs).every((e) => e.status === 200);
  const diverted =
    trial?.repair === "cache" ||
    trial?.repair === "bypass" ||
    (!trial && healthy);
  const find = (id: string) => nodes.find((n) => n.id === id);
  const positions = detail ? expanded : simple;
  const nodeWidth = detail ? 180 : 218;
  const width = detail ? 1104 : 922;
  const height = detail ? 334 : 314;
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
  const links = detail
    ? edges.filter((e) => positions[e.from] && positions[e.to])
    : edges
        .filter((e) => e.type === "USES")
        .map((e) => ({ from: e.from, to: e.to, type: "USES" }));
  if (!detail)
    for (const capability of nodes.filter((n) => n.kind === "capability"))
      for (const service of nodes.filter((n) => n.kind === "service"))
        if (reaches(capability.id, service.id))
          links.push({
            from: capability.id,
            to: service.id,
            type: "DEPENDS_ON",
          });
  const columns: [number, string][] = detail
    ? [
        [18, "Customers"],
        [240, "Capabilities"],
        [462, "Operations"],
        [684, "Execution"],
        [906, "Dependency"],
      ]
    : [
        [24, "Customers"],
        [352, "Capabilities"],
        [680, "Services"],
      ];
  return (
    <section className="map-panel" aria-labelledby="impact-title">
      <div className="map-heading">
        <div>
          <GitBranch size={14} />
          <h2 id="impact-title">Dependency map</h2>
          <span className="small-muted">
            {Object.keys(positions).length} entities
          </span>
        </div>
        <div>
          <button
            className="map-toggle"
            aria-pressed={detail}
            onClick={() => setDetail(!detail)}
          >
            <Layers2 size={12} />
            {detail ? "Hide operations" : "Show operations"}
          </button>
          <button
            className="icon-button"
            aria-label="View graph query"
            onClick={onTrace}
          >
            <span className="mono" aria-hidden="true">
              ‹/›
            </span>
          </button>
        </div>
      </div>
      <div className="map-wrap">
        <div
          className={`graph-canvas ${detail ? "expanded" : ""}`}
          aria-label="Customer dependencies from FalkorDB"
        >
          {columns.map(([x, label]) => (
            <span
              key={label}
              className="graph-column"
              style={{ left: `${(x / width) * 100}%` }}
            >
              {label}
            </span>
          ))}
          <svg
            className="graph-connectors"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {links.map((edge) => {
              const a = positions[edge.from],
                b = positions[edge.to];
              if (!a || !b) return null;
              const affected =
                !healthy &&
                (data.context.affected.includes(edge.from) ||
                  ["rich", "build-rich", "enrich"].includes(edge.from)) &&
                edge.to !== "worker";
              const skipped =
                diverted && (edge.to === "enrichment" || edge.to === "enrich");
              const focus = hovered === edge.from || hovered === edge.to;
              const x = a[0] + nodeWidth,
                y = a[1] + 30,
                endX = b[0],
                endY = b[1] + 30;
              return (
                <g
                  key={`${edge.from}-${edge.to}`}
                  className={hovered && !focus ? "map-dim" : ""}
                >
                  <path
                    d={`M${x} ${y} C${x + (endX - x) / 2} ${y}, ${endX - (endX - x) / 2} ${endY}, ${endX} ${endY}`}
                    className={`map-edge ${affected ? "affected" : ""} ${focus ? "focused" : ""} ${skipped ? "skipped" : ""}`}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="2"
                    className={
                      affected ? "edge-port affected-port" : "edge-port"
                    }
                  />
                  <circle
                    cx={endX}
                    cy={endY}
                    r="2"
                    className={
                      affected ? "edge-port affected-port" : "edge-port"
                    }
                  />
                </g>
              );
            })}
          </svg>
          {Object.entries(positions).map(([id, [x, y]]) => {
            const node = find(id);
            if (!node) return null;
            const customer = node.kind === "customer";
            const failing = customer
              ? outputs[id]?.status !== 200
              : id === "enrichment" && !healthy && !trial;
            const breach =
              customer &&
              trial?.checks.some((c) => c.customer === id && !c.passed) &&
              !failing;
            const label = customer
              ? `HTTP ${outputs[id]?.status} · ${failing ? "unavailable" : breach ? "requirement failed" : "healthy"}`
              : id === "enrichment"
                ? diverted
                  ? "Not called in this branch"
                  : trial?.repair === "rollback"
                    ? "Worker stops before request"
                    : "Request field rejected"
                : id === "worker"
                  ? `${trial?.repair === "rollback" ? "v1" : "v2"} · shared infrastructure`
                  : id === "rich"
                    ? "Provenance enrichment"
                    : id === "basic"
                      ? "No enrichment required"
                      : node.kind === "operation"
                        ? "Graph dependency"
                        : node.kind;
            return (
              <button
                key={id}
                className={`graph-node ${failing ? "failing" : breach ? "breach" : customer ? "healthy" : ""} ${diverted && id === "enrichment" ? "bypassed" : ""}`}
                style={{
                  left: `${(x / width) * 100}%`,
                  top: `${(y / height) * 100}%`,
                  width: `${(nodeWidth / width) * 100}%`,
                  height: `${(60 / height) * 100}%`,
                }}
                onClick={() => onNode(id)}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(id)}
                onBlur={() => setHovered(null)}
              >
                <span className="graph-node-title">{node.name}</span>{" "}
                <span className="graph-node-state">{label}</span>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="mobile-paths">
          {[
            ...data.context.paths.map((path) => ({
              customer: path.customer,
              capability: path.capability,
            })),
            { customer: "cedar", capability: "basic" },
          ].map((path) => (
            <button key={path.customer} onClick={() => onNode(path.customer)}>
              <strong>{find(path.customer)?.name}</strong>
              <ArrowRight size={12} />
              <span>{find(path.capability)?.name}</span>
              <span
                className={
                  outputs[path.customer]?.status === 200
                    ? "good-text"
                    : "bad-text"
                }
              >
                HTTP {outputs[path.customer]?.status}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="map-caption">
        <span>
          <i className={healthy ? "good-dot" : "bad-dot"} />
          {trial
            ? "Isolated trial output"
            : healthy
              ? "Customer exports restored"
              : "Affected dependency"}
        </span>
        <span className="map-caption-secondary">
          {trial?.repair === "bypass"
            ? "A healthy response can still violate a requirement."
            : "Cedar never calls enrichment."}
        </span>
        <button onClick={onTrace}>
          FalkorDB <ArrowUpRight size={11} />
        </button>
      </div>
    </section>
  );
}
