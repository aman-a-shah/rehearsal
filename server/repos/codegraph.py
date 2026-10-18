"""Static code relationships stored and traversed in FalkorDB, scoped per snapshot."""

import ast
import fnmatch
import posixpath
import re
import time
from pathlib import PurePosixPath

from ..domain import Problem
from .snapshot import CODE_SUFFIXES, editable, is_test

DEPENDENCIES = """MATCH (s:RepoFile)-[:IMPORTS*0..6]->(f:RepoFile)
WHERE s.path IN $paths RETURN DISTINCT f.path ORDER BY f.path LIMIT 160"""
DEPENDENTS = """MATCH (f:RepoFile)-[:IMPORTS*0..8]->(s:RepoFile)
WHERE s.path IN $paths RETURN DISTINCT f.path,f.kind ORDER BY f.path LIMIT 160"""
OWNERS = """MATCH (f:RepoFile)-[:OWNED_BY]->(o:CodeOwner)
WHERE f.path IN $paths RETURN f.path,o.name ORDER BY f.path,o.name"""


def extract(files):
    code = {p for p in files if PurePosixPath(p).suffix in CODE_SUFFIXES}
    nodes = [{"id": p, "path": p, "kind": "test" if is_test(p) else "source" if p in code else "document",
              "editable": editable(p), "lines": len(c.splitlines())} for p, c in files.items()]
    edges, symbols, warnings = set(), [], []
    roots = {"", "src/"}
    roots.update(p[:-len("package.json")] for p in files if p.endswith("package.json"))
    roots.update(p[:-len("pyproject.toml")] for p in files if p.endswith("pyproject.toml"))

    def resolve(base, suffixes):
        return next((p for p in [base, *(base + s for s in suffixes)] if p in code), None)

    for path in sorted(code):
        source = files[path]
        if path.endswith(".py"):
            try:
                tree = ast.parse(source)
            except (SyntaxError, RecursionError):
                warnings.append(f"Could not parse {path}; it remains available as source text.")
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    symbols.append({"id": f"{path}:{node.lineno}:{node.name}", "name": node.name, "path": path, "line": node.lineno})
                specs = []
                if isinstance(node, ast.Import):
                    specs = [(n.name.replace(".", "/"), 0) for n in node.names]
                elif isinstance(node, ast.ImportFrom):
                    module = (node.module or "").replace(".", "/")
                    specs = [(module, node.level)] + [(posixpath.join(module, n.name), node.level) for n in node.names]
                for module, level in specs:
                    candidates = [posixpath.normpath(posixpath.join(posixpath.dirname(path), "../" * max(0, level - 1), module))] if level else [r + module for r in sorted(roots)]
                    for base in candidates:
                        target = resolve(base, [".py", "/__init__.py"])
                        if target and target != path:
                            edges.add((path, target))
                            break
        else:
            # Static literal imports only. Computed imports and TS path aliases are reported as limits.
            imports = re.findall(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['\"]([^'\"]+)['\"]", source)
            for spec in imports:
                if not spec.startswith("."):
                    continue
                base = posixpath.normpath(posixpath.join(posixpath.dirname(path), spec))
                target = resolve(base, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js"])
                if not target and base.endswith(".js"):
                    target = resolve(base[:-3], [".ts", ".tsx"])
                if target and target != path:
                    edges.add((path, target))
            for match in re.finditer(r"(?:\b(?:function|class)\s+|\b(?:export\s+)?(?:const|let)\s+)([A-Za-z_$][\w$]*)", source):
                line = source.count("\n", 0, match.start()) + 1
                symbols.append({"id": f"{path}:{line}:{match[1]}", "name": match[1], "path": path, "line": line})
    ownership = []
    owners_source = next((p for p in (".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS") if p in files), None)
    if owners_source:
        rules = [line.split() for line in files[owners_source].splitlines() if line.strip() and not line.lstrip().startswith("#")]
        for path in code:
            names = []
            for rule in rules:
                pattern = rule[0].lstrip("/")
                if fnmatch.fnmatchcase(path, pattern) or fnmatch.fnmatchcase(path, pattern.rstrip("/") + "/**") or ("/" not in pattern and fnmatch.fnmatchcase(PurePosixPath(path).name, pattern)):
                    names = [n for n in rule[1:] if n.startswith("@")]
            ownership.extend({"path": path, "name": n} for n in names)
    return {"nodes": nodes, "edges": [{"source": a, "target": b, "type": "IMPORTS"} for a, b in sorted(edges)],
            "symbols": symbols[:6000], "ownership": ownership, "warnings": warnings,
            "limits": "Static imports, not runtime coverage. Computed imports, dependency injection, and TypeScript path aliases may be missing. The complete configured test command still runs."}


class CodeGraph:
    def __init__(self, connector, project):
        self.connector, self.project = connector, project
        self.name = "code_" + project["id"]
        self.trace = []

    def query(self, cypher, params=None, write=False):
        started = time.monotonic()
        try:
            self.connector.connect()
            graph = self.connector.db.select_graph(self.name)
            rows = (graph.query if write else graph.ro_query)(cypher, params=params or {}, timeout=5000).result_set
        except Exception as error:
            raise Problem("repository_graph", "The repository graph is unavailable. The investigation cannot continue without its dependency evidence.", 503) from error
        self.trace.append({"query": cypher, "parameters": params or {}, "rows": len(rows), "duration_ms": round((time.monotonic() - started) * 1000, 1)})
        return rows

    def build(self, data):
        self.query("CREATE (:RepoSnapshot {digest:$digest})", {"digest": self.project["digest"]}, True)
        for offset in range(0, len(data["nodes"]), 100):
            self.query("UNWIND $rows AS r CREATE (:RepoFile {path:r.path,kind:r.kind,editable:r.editable,lines:r.lines})", {"rows": data["nodes"][offset:offset + 100]}, True)
        for offset in range(0, len(data["edges"]), 100):
            self.query("UNWIND $rows AS r MATCH (a:RepoFile {path:r.source}),(b:RepoFile {path:r.target}) CREATE (a)-[:IMPORTS]->(b)", {"rows": data["edges"][offset:offset + 100]}, True)
        for offset in range(0, len(data["symbols"]), 100):
            self.query("UNWIND $rows AS r MATCH (f:RepoFile {path:r.path}) CREATE (f)-[:DECLARES]->(:CodeSymbol {name:r.name,line:r.line})", {"rows": data["symbols"][offset:offset + 100]}, True)
        if data["ownership"]:
            self.query("UNWIND $rows AS r MATCH (f:RepoFile {path:r.path}) MERGE (o:CodeOwner {name:r.name}) CREATE (f)-[:OWNED_BY]->(o)", {"rows": data["ownership"]}, True)
        self.persist()

    def persist(self):
        # A completed import or trial must survive an abrupt API restart, not
        # just graceful shutdown. Remote FalkorDB manages its own persistence.
        try:
            self.connector.save()
        except Exception as error:
            raise Problem("repository_graph_persistence", "The repository graph could not be saved. Try again after storage is available.", 503) from error

    def validate(self):
        rows = self.query("MATCH (s:RepoSnapshot) RETURN s.digest")
        if rows != [[self.project["digest"]]]:
            raise Problem("snapshot_changed", "The graph does not match the imported repository. Import a fresh snapshot.", 409)

    def context(self, incident, output):
        self.validate()
        files = self.project["files"]
        text = incident + "\n" + output
        terms = {t.lower() for t in re.findall(r"[A-Za-z_][A-Za-z_0-9]{3,}", incident)}
        scores = []
        for path, source in files.items():
            if PurePosixPath(path).suffix not in CODE_SUFFIXES:
                continue
            score = (100 if path in text else 0) + (30 if PurePosixPath(path).name in text else 0)
            score += sum(3 if term in path.lower() else 1 if term in source.lower() else 0 for term in terms)
            scores.append((score, path))
        seeds = [p for score, p in sorted(scores, key=lambda row: (-row[0], row[1]))[:6] if score > 0]
        if not seeds:
            seeds = [p for _, p in sorted(scores)[:4]]
        dependencies = [r[0] for r in self.query(DEPENDENCIES, {"paths": seeds})]
        dependents = self.query(DEPENDENTS, {"paths": dependencies or seeds})
        selected = list(dict.fromkeys([*seeds, *dependencies, *(r[0] for r in dependents)]))
        owners = self.query(OWNERS, {"paths": selected})
        snippets, used = {}, 0
        for path in selected:
            content = files[path]
            if len(content) <= 24000 and used + len(content) <= 100000:
                snippets[path] = content
                used += len(content)
        allowed = [r[0] for r in self.query("MATCH (f:RepoFile) WHERE f.editable=true AND f.path IN $paths RETURN f.path ORDER BY f.path", {"paths": list(snippets)})]
        if directory := self.project.get("directory"):
            allowed = [p for p in allowed if p.startswith(directory + "/")]
        if not allowed:
            raise Problem("no_editable_context", "No editable source files were connected to this failure. Include a source filename or stack trace in the incident.", 422)
        return {"seeds": seeds, "files": list(snippets), "editable": allowed,
                "affected_tests": [r[0] for r in dependents if r[1] == "test"],
                "owners": [{"path": p, "name": n} for p, n in owners], "queries": self.trace,
                "source": snippets, "omitted_files": len(selected) - len(snippets)}

    def record(self, run, candidates):
        self.validate()
        self.query("MERGE (r:RepairRun {id:$id}) SET r.incident=$incident,r.status=$status,r.snapshot=$digest", {
            "id": run["id"], "incident": run["incident"][:2000], "status": run["status"], "digest": self.project["digest"]}, True)
        for candidate in candidates:
            self.query("MATCH (r:RepairRun {id:$run}) MERGE (c:RepairCandidate {id:$id}) SET c.title=$title,c.passed=$passed MERGE (r)-[:TESTED]->(c)",
                       {"run": run["id"], "id": run["id"] + ":" + candidate["id"], "title": candidate["title"], "passed": candidate.get("passed", False)}, True)
            for path in candidate.get("changes", {}):
                self.query("MATCH (c:RepairCandidate {id:$id}),(f:RepoFile {path:$path}) MERGE (c)-[:CHANGES]->(f)", {"id": run["id"] + ":" + candidate["id"], "path": path}, True)
        self.persist()

    def delete(self):
        self.connector.connect()
        self.connector.db.select_graph(self.name).delete()
        self.persist()
