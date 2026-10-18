export type Repair = "rollback" | "bypass" | "cache";
export type Person = "nia" | "mira" | "owen" | "reviewer";
export type Page =
  | "incident"
  | "examples"
  | "context"
  | "decisions"
  | "connections";
export type Output = { status: number; body: Record<string, unknown> };
export type RequestSpan = {
  id: string;
  parent_id: string | null;
  customer: string;
  service: string;
  method: string;
  path: string;
  start_ms: number;
  duration_ms: number;
  status: number;
  request: Record<string, unknown> | null;
  response: Record<string, unknown>;
};
export type Source = {
  id: string;
  key: string;
  title: string;
  kind: string;
  author: string;
  text: string;
  authoritative: boolean;
  revision: number;
  hash: string;
  current: boolean;
};
export type Context = {
  revision: number;
  fingerprint: string;
  affected: string[];
  footprint: string[];
  experts: string[];
  values: Record<string, string | number | boolean>;
  sources: Source[];
  paths: {
    customer: string;
    capability: string;
    operation: string;
    dependency: string;
  }[];
};
export type Trial = {
  hypothetical?: boolean;
  repair: Repair;
  passed: boolean;
  duration_ms: number;
  scope: string[];
  artifact_hash: string;
  exports: Record<string, Output>;
  before: Record<string, Output>;
  trace?: { before: RequestSpan[]; after: RequestSpan[] };
  checks: {
    key: string;
    title: string;
    passed: boolean;
    customer: string | null;
    expected: unknown;
    actual: unknown;
  }[];
};
export type Proposal = {
  repair: Repair;
  owner: string;
  expires_at: number;
  digest: string;
  context_hash: string;
};
export type Receipt = {
  run_id: string;
  repair: Repair;
  owner: string;
  approved_at: number;
  verified: boolean;
  graph_synced: boolean;
  summary: string;
  sources: Source[];
  scope: string[];
  context_revision: number;
  follow_up: string;
  exports: Record<string, Output>;
};
export type Run = {
  id: string;
  mode: "guided" | "live";
  status: string;
  created_at: number;
  context: Context;
  trials: Trial[];
  proposal: Proposal | null;
  message?: string;
  recommendation: { repair: Repair | null; reason: string } | null;
  events: {
    tool: string;
    status: string;
    duration_ms: number;
    at: number;
    arguments: unknown;
    message?: string;
  }[];
  receipt?: Receipt;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    model: string;
    cost_usd?: number | null;
    turns?: number;
    provider?: string;
  };
  thread_id?: string;
  memory_retrieved?: number;
  memory_sync?: "pending" | "saved" | "error";
};
export type Change = {
  id: string;
  status: string;
  max_age: number;
  previous_age: number;
  source_revision: number;
  context_revision: number;
};
export type Workspace = {
  access: {
    public: boolean;
    operator: boolean;
    operator_configured: boolean;
    can_edit: boolean;
    can_use_provider: boolean;
  };
  usage_limits: {
    live_runs_per_hour: number;
    live_runs_per_day: number;
    provider_requests_per_day: number;
    provider_requests_remaining: number;
  };
  context: Context;
  diagram: {
    nodes: { id: string; name: string; kind: string }[];
    edges: { from: string; to: string; type: string }[];
  };
  exports: Record<string, Output>;
  runtime: {
    revision: number;
    mutation_count: number;
    cache: { timestamp: number };
    accounts: Record<string, { tier: string; mode: string }>;
  };
  runs: Run[];
  decisions: Receipt[];
  changes: Change[];
  provider: {
    available: boolean;
    name: string | null;
    model: string | null;
    llm_provider?: string;
    memory?: boolean;
    assistant_connected?: boolean;
    run_budget_usd?: number;
  };
  trace: {
    query: string;
    parameters: unknown;
    rows: number;
    duration_ms: number;
    write: boolean;
  }[];
};

export type Simulation = {
  hypothetical: true;
  created_at: number;
  context_hash: string;
  assumptions: {
    cache_max_age: number;
    requires_provenance: boolean;
    cache_age: number;
  };
  trials: Trial[];
  eligible: Repair[];
  recommendation: Repair | null;
  duration_ms: number;
};

export type Sweep = {
  hypothetical: true;
  created_at: number;
  context_hash: string;
  cache_max_age: number;
  ages: number[];
  cases: Simulation[];
  summary: {
    scenarios: number;
    trials: number;
    checks: number;
    eligible: Record<Repair, number>;
  };
  duration_ms: number;
};

export const PEOPLE: Record<
  string,
  { name: string; role: string; initials: string }
> = {
  nia: { name: "Nia Chen", role: "Service owner", initials: "NC" },
  mira: { name: "Mira Patel", role: "Incident expert", initials: "MP" },
  owen: { name: "Owen Brooks", role: "Former owner", initials: "OB" },
  reviewer: { name: "Policy reviewer", role: "Company policy", initials: "PR" },
};
export const REPAIRS: Record<
  Repair,
  { name: string; description: string; short: string }
> = {
  rollback: {
    name: "Roll back the worker",
    description: "Return to the previous service version.",
    short: "Rollback",
  },
  bypass: {
    name: "Bypass enrichment",
    description: "Skip the dependency that is failing.",
    short: "Bypass",
  },
  cache: {
    name: "Use the verified cache",
    description: "Restore complete exports with verified data.",
    short: "Verified cache",
  },
};
export const titleCase = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
