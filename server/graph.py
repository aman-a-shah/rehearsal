"""FalkorDB owns company facts. Missing or inconsistent graph context blocks actions."""

import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse

from .domain import Problem, fingerprint
from .seed import NODES, EDGES, sources, policy_text

IMPACT_QUERY = """MATCH (a:Entity {kind:'customer'})-[:USES]->(c:Entity)
-[:IMPLEMENTED_BY]->(o:Entity)-[:CALLS*0..4]->(d:Entity)
-[:RUNS_ON]->(:Entity {id:$failed})
RETURN DISTINCT a.id, c.id, o.id, d.id ORDER BY a.id"""
FOOTPRINT_QUERY = """MATCH (a:Entity {kind:'customer'})-[:USES]->(:Entity)
-[:IMPLEMENTED_BY]->(:Entity)-[:RUNS_ON]->(:Entity {id:'worker'})
RETURN DISTINCT a.id ORDER BY a.id"""
FACTS_QUERY = """MATCH (c:Claim {active:true})-[:SUPPORTED_BY]->(s:Source {current:true})
RETURN c.subject, c.predicate, c.value, s.id, s.authoritative ORDER BY c.id"""


class CompanyGraph:
    def __init__(self, directory: Path, name="rehearsal_v2", url=None):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.name, self.url = name, url or os.getenv("FALKORDB_URL")
        self.db = self.graph = None
        self.trace = []

    def connect(self):
        if self.graph is not None:
            return
        if self.url:
            from falkordb import FalkorDB
            parsed = urlparse(self.url)
            if parsed.scheme not in {"redis", "rediss"}:
                raise ValueError("Use a redis:// or rediss:// FalkorDB endpoint")
            self.db = FalkorDB(host=parsed.hostname, port=parsed.port or 6379,
                              username=parsed.username, password=parsed.password,
                              ssl=parsed.scheme == "rediss", socket_timeout=5)
        else:
            from redislite.falkordb_client import FalkorDB
            self.db = FalkorDB(str(self.directory / "company.rdb"),
                              serverconfig={"logfile": str(self.directory / "graph.log")})
        self.graph = self.db.select_graph(self.name)

    def query(self, query, params=None, *, write=False):
        started = time.perf_counter()
        try:
            self.connect()
            method = self.graph.query if write else self.graph.ro_query
            rows = method(query, params=params or {}, timeout=3000).result_set
        except Exception as error:
            raise Problem("graph_unavailable", "Company context is unavailable. No new repair can be approved.", 503) from error
        self.trace.append({"query": query, "parameters": params or {}, "rows": len(rows),
                           "duration_ms": round((time.perf_counter() - started) * 1000, 2), "write": write})
        self.trace = self.trace[-80:]
        return rows

    def seed(self, *, reset=False):
        current = self.query("MATCH (c:Context {id:'company'}) RETURN c.revision", write=True)
        if current and not reset:
            return
        revision = current[0][0] + 1 if current else 1
        self.query("MATCH (n) DETACH DELETE n", write=True)
        for id, name, kind in NODES:
            self.query("CREATE (:Entity {id:$id,name:$name,kind:$kind})", {"id": id, "name": name, "kind": kind}, write=True)
        for a, b, rel in EDGES:
            # Relations come exclusively from the server-owned seed manifest.
            self.query(f"MATCH (a:Entity {{id:$a}}),(b:Entity {{id:$b}}) CREATE (a)-[:{rel}]->(b)", {"a": a, "b": b}, write=True)
        for source in sources():
            record = {k: v for k, v in source.items() if k != "claims"}
            record.update(id=f"{source['key']}:1", revision=1, current=True)
            record["hash"] = fingerprint(record["text"])
            self.query("CREATE (s:Source) SET s=$source", {"source": record}, write=True)
            for i, (subject, predicate, value) in enumerate(source["claims"]):
                self.query("MATCH (s:Source {id:$source}) CREATE (c:Claim {id:$id,subject:$subject,predicate:$predicate,value:$value,active:true})-[:SUPPORTED_BY]->(s)",
                           {"id": f"{record['id']}:{i}", "source": record["id"], "subject": subject, "predicate": predicate, "value": json.dumps(value)}, write=True)
        self.query("CREATE (:Context {id:'company',revision:$revision,topology:$topology})",
                   {"revision": revision, "topology": self.topology_hash()}, write=True)
        self.save()

    def topology_hash(self):
        nodes = self.query("MATCH (e:Entity) RETURN e.id,e.name,e.kind ORDER BY e.id")
        edges = self.query("MATCH (a:Entity)-[r]->(b:Entity) RETURN a.id,b.id,type(r) ORDER BY a.id,b.id,type(r)")
        return fingerprint([nodes, edges])

    def source_list(self, history=False):
        rows = self.query("MATCH (s:Source) " + ("" if history else "WHERE s.current=true ") +
                          "RETURN properties(s) ORDER BY s.key,s.revision DESC")
        return [r[0] for r in rows]

    def context(self):
        metadata = self.query("MATCH (c:Context {id:'company'}) RETURN c.revision,c.topology")
        if len(metadata) != 1 or metadata[0][1] != self.topology_hash():
            raise Problem("incomplete_context", "The dependency map changed or is incomplete. Restore the reviewed sample workspace.")
        source_records = self.source_list()
        facts = self.query(FACTS_QUERY)
        values = {}
        experts = []
        for subject, predicate, value, source, authoritative in facts:
            if predicate == "expert":
                experts.append(json.loads(value))
            if authoritative:
                values.setdefault(f"{subject}:{predicate}", []).append(json.loads(value))
        required = ["alder:requires_provenance", "beacon:requires_provenance", "cedar:requires_provenance",
                    "worker:cache_max_age", "worker:cache_allowed", "worker:owner", "worker:schema_version"]
        if any(len(values.get(key, [])) != 1 for key in required):
            raise Problem("conflicting_context", "An authoritative requirement or owner is missing or conflicting.")
        values = {k: v[0] for k, v in values.items()}
        if (type(values["worker:cache_max_age"]) is not int or values["worker:cache_max_age"] < 0
                or type(values["worker:cache_allowed"]) is not bool
                or any(type(values[f"{a}:requires_provenance"]) is not bool for a in ("alder", "beacon", "cedar"))
                or values["worker:owner"] not in {row[0] for row in self.query("MATCH (p:Entity {kind:'person'}) RETURN p.id")}):
            raise Problem("invalid_context", "The reviewed company requirements have invalid values.")
        impact = self.query(IMPACT_QUERY, {"failed": "enrichment"})
        footprint = [r[0] for r in self.query(FOOTPRINT_QUERY)]
        result = {"revision": metadata[0][0], "values": values, "affected": sorted({r[0] for r in impact}),
                  "paths": [{"customer": r[0], "capability": r[1], "operation": r[2], "dependency": r[3]} for r in impact],
                  "footprint": footprint, "experts": sorted(set(experts)), "sources": source_records}
        if not result["affected"] or not set(result["affected"]).issubset(footprint):
            raise Problem("incomplete_impact", "The graph could not establish a complete customer scope.")
        result["fingerprint"] = fingerprint(result)
        return result

    def diagram(self):
        return {"nodes": [{"id": i, "name": n, "kind": k} for i, n, k in self.query("MATCH (n:Entity) RETURN n.id,n.name,n.kind ORDER BY n.id")],
                "edges": [{"from": a, "to": b, "type": r} for a, b, r in self.query("MATCH (a:Entity)-[r]->(b:Entity) RETURN a.id,b.id,type(r)")]}

    def accept_policy(self, change):
        # A complete source replacement, its claims, and the context revision change in one query.
        prior = self.query("MATCH (s:Source {change_id:$id}) RETURN s.revision", {"id": change["id"]})
        if prior:
            return prior[0][0]
        record = {"id": f"cache-policy:{change['source_revision'] + 1}", "key": "cache-policy",
                  "revision": change["source_revision"] + 1, "title": "OP-17 · Cache operating policy",
                  "kind": "document", "author": "Platform engineering", "authoritative": True, "current": True,
                  "text": policy_text(change["max_age"]), "change_id": change["id"]}
        record["hash"] = fingerprint(record["text"])
        rows = self.query("""MATCH (ctx:Context {id:'company'}),(old:Source {key:'cache-policy',current:true})
WHERE ctx.revision=$expected AND old.revision=$source_revision
MATCH (claim:Claim)-[:SUPPORTED_BY]->(old)
SET claim.active=false
WITH DISTINCT ctx,old
SET old.current=false,ctx.revision=ctx.revision+1
CREATE (s:Source) SET s=$record
CREATE (s)-[:SUPERSEDES]->(old)
CREATE (:Claim {id:$age_id,subject:'worker',predicate:'cache_max_age',value:$age,active:true})-[:SUPPORTED_BY]->(s)
CREATE (:Claim {id:$allow_id,subject:'worker',predicate:'cache_allowed',value:'true',active:true})-[:SUPPORTED_BY]->(s)
RETURN s.revision""", {"expected": change["context_revision"], "source_revision": change["source_revision"], "record": record,
                       "age_id": record["id"] + ":age", "allow_id": record["id"] + ":allowed", "age": json.dumps(change["max_age"])}, write=True)
        if not rows:
            raise Problem("source_changed", "The source changed since this revision was proposed. Propose it again.")
        self.save()
        return rows[0][0]

    def record_decision(self, receipt):
        self.query("MERGE (d:Decision {id:$id}) SET d.summary=$summary,d.owner=$owner,d.payload=$payload",
                   {"id": receipt["run_id"], "summary": receipt["summary"], "owner": receipt["owner"], "payload": json.dumps(receipt)}, write=True)
        for source in receipt["sources"]:
            self.query("MATCH (d:Decision {id:$id}),(s:Source {id:$source}) MERGE (d)-[:CITES]->(s)",
                       {"id": receipt["run_id"], "source": source["id"]}, write=True)
        self.query("""MATCH (d:Decision {id:$id}),(p:Entity {id:$owner})
MERGE (t:Task {id:$task}) SET t.title=$title,t.status='open'
MERGE (d)-[:CREATED]->(t) MERGE (t)-[:ASSIGNED_TO]->(p)""",
                   {"id": receipt["run_id"], "owner": receipt["owner"], "task": receipt["run_id"] + ":followup", "title": receipt["follow_up"]}, write=True)
        self.save()

    def save(self):
        if not self.url and self.db:
            self.db.client.save()

    def close(self):
        if not self.url and self.db:
            self.save()
            self.db.close()
        self.graph = self.db = None
