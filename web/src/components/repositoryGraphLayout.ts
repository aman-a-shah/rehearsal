import type { RepoNode } from "../repositoryTypes";

export type Point = { x: number; y: number };
export type FilePosition = Point & { width: number; height: number };
export type GraphLayout = {
  positions: Map<string, FilePosition>;
  headings: { text: string; x: number; y: number }[];
  width: number;
  height: number;
};

// A stable file map. Connections are routed separately, through the row and
// column gutters, so selecting a file never moves the surrounding code.
export function repositoryLayout(
  nodes: RepoNode[],
  availableWidth: number,
): GraphLayout {
  const source = nodes.filter((node) => node.kind !== "test");
  const tests = nodes.filter((node) => node.kind === "test");
  const groups = [source, tests].filter((group) => group.length);
  const gap = 20,
    groupGap = 42,
    rowStep = 60,
    height = 40;
  const capacity = Math.max(
    groups.length,
    Math.floor((availableWidth - 34) / 166),
  );
  const columns = Math.max(
    groups.length,
    Math.min(capacity, Math.ceil(nodes.length / 4)),
  );
  let sourceColumns = columns;
  if (source.length && tests.length) {
    let best = Infinity;
    for (let count = 1; count < columns; count++) {
      const rows = Math.max(
        Math.ceil(source.length / count),
        Math.ceil(tests.length / (columns - count)),
      );
      const balance =
        rows * 100 +
        Math.abs(source.length / count - tests.length / (columns - count));
      if (balance < best) {
        best = balance;
        sourceColumns = count;
      }
    }
  }
  const columnCounts =
    groups.length === 2 ? [sourceColumns, columns - sourceColumns] : [columns];
  const width = Math.max(
    146,
    Math.min(
      174,
      Math.floor(
        (availableWidth -
          32 -
          (groups.length - 1) * groupGap -
          (columns - groups.length) * gap) /
          columns,
      ),
    ),
  );
  const positions = new Map<string, FilePosition>();
  const headings: GraphLayout["headings"] = [];
  let x = 16,
    maxRows = 0;
  groups.forEach((group, groupIndex) => {
    const count = columnCounts[groupIndex];
    const rows = Math.ceil(group.length / count);
    maxRows = Math.max(maxRows, rows);
    headings.push({
      text: group[0].kind === "test" ? "Tests" : "Source",
      x,
      y: 16,
    });
    group.forEach((node, index) =>
      positions.set(node.path, {
        x: x + Math.floor(index / rows) * (width + gap),
        y: 36 + (index % rows) * rowStep,
        width,
        height,
      }),
    );
    x += count * width + (count - 1) * gap + groupGap;
  });
  return {
    positions,
    headings,
    width: Math.max(250, x - groupGap + 16),
    height: Math.max(130, 36 + (maxRows - 1) * rowStep + height + 16),
  };
}

export function connectionLayout(
  nodes: RepoNode[],
  selected: string,
  imports: string[],
  consumers: string[],
): GraphLayout {
  const positions = new Map<string, FilePosition>();
  const width = 230,
    step = 52;
  const left = nodes.filter(
    (node) => consumers.includes(node.path) && node.path !== selected,
  );
  // A cyclic dependency appears on the left once; its two arrows retain both directions.
  const right = nodes.filter(
    (node) =>
      imports.includes(node.path) &&
      !consumers.includes(node.path) &&
      node.path !== selected,
  );
  const height = Math.max(190, Math.max(left.length, right.length) * step + 52);
  [left, nodes.filter((node) => node.path === selected), right].forEach(
    (column, index) =>
      column.forEach((node, row) =>
        positions.set(node.path, {
          x: 24 + index * 330,
          y: (height - column.length * step) / 2 + row * step + 14,
          width,
          height: 40,
        }),
      ),
  );
  return {
    positions,
    headings: [
      `Imported by · ${consumers.length}`,
      "Selected file",
      `Imports · ${imports.length}`,
    ].map((text, index) => ({ text, x: 24 + index * 330, y: 17 })),
    width: 914,
    height,
  };
}

export function routedConnection(
  from: FilePosition,
  to: FilePosition,
  index: number,
  focused: boolean,
): string {
  const forward = from.x < to.x;
  if (focused && from.x !== to.x) {
    const start = {
      x: from.x + (forward ? from.width : 0),
      y: from.y + from.height / 2,
    };
    const end = { x: to.x + (forward ? 0 : to.width), y: to.y + to.height / 2 };
    const middle = (start.x + end.x) / 2;
    return `M${start.x},${start.y} C${middle},${start.y} ${middle},${end.y} ${end.x},${end.y}`;
  }
  const sameColumn = Math.abs(from.x - to.x) < 1;
  const rightward = forward || sameColumn;
  const start = {
    x: from.x + (rightward ? from.width : 0),
    y: from.y + from.height / 2,
  };
  const end = { x: to.x + (forward ? 0 : to.width), y: to.y + to.height / 2 };
  const offset = 6 + (index % 3) * 2;
  const exit = start.x + (rightward ? offset : -offset);
  const entry = end.x + (forward ? -offset : offset);
  const lane = from.y - 6 - (index % 3) * 3;
  return `M${start.x},${start.y} H${exit} V${lane} H${entry} V${end.y} H${end.x}`;
}
