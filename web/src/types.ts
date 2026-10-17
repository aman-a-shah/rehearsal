export type Repair = "rollback" | "bypass" | "cache";
export type Person = "nia" | "mira" | "owen" | "reviewer";
export type Page = "incident" | "context" | "decisions";
export type Output = { status: number; body: Record<string, unknown> };
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
  repair: Repair;
  passed: boolean;
  duration_ms: number;
  scope: string[];
  artifact_hash: string;
  exports: Record<string, Output>;
  before: Record<string, Output>;
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
  usage?: { input_tokens: number; output_tokens: number; model: string };
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
  provider: { available: boolean; name: string | null; model: string | null };
  trace: {
    query: string;
    parameters: unknown;
    rows: number;
    duration_ms: number;
    write: boolean;
  }[];
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
