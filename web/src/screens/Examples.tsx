import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  FileText,
  FlaskConical,
  LoaderCircle,
  Play,
} from "lucide-react";
import { Experiments } from "../components/Experiments";
import { OutcomeInspector } from "../components/OutcomeInspector";
import { request } from "../useWorkspace";
import {
  REPAIRS,
  type Repair,
  type Simulation,
  type Source,
  type Trial,
  type Workspace,
} from "../types";

type Example = {
  id: string;
  title: string;
  label: string;
  description: string;
  limit: number;
  age: number;
  provenance: boolean;
  expected: string;
  inspect: Repair;
  evidence: string;
  source: string;
  lesson: string;
};

const examples: Example[] = [
  {
    id: "agreement",
    title: "A healthy response, an incomplete report",
    label: "Customer agreement",
    description:
      "Alder and Beacon depend on the enrichment API. Bypassing it restores HTTP 200, but Alder still needs the report's original provenance. Compare the response with the agreement before choosing a repair.",
    limit: 900,
    age: 720,
    provenance: true,
    expected: "Verified cache is eligible; bypass fails Alder's requirement.",
    inspect: "bypass",
    evidence:
      "Inspect Alder's bypass output. The response succeeds, but provenance_id is absent. Then inspect rollback: Cedar also fails, even though it never used enrichment.",
    source: "alder-agreement",
    lesson:
      "The dependency traversal establishes the affected customers. The worker footprint adds Cedar to regression checks. The agreement supplies the provenance requirement.",
  },
  {
    id: "stricter-policy",
    title: "The same cache under a stricter policy",
    label: "No eligible repair",
    description:
      "Keep the cache at 12 minutes old and shorten its allowed age to 10 minutes. The outage is unchanged. A previously passing workaround now violates the operating policy.",
    limit: 600,
    age: 720,
    provenance: true,
    expected: "All three repairs are rejected. Escalation is required.",
    inspect: "cache",
    evidence:
      "Open Checks for the cache trial: 720 seconds exceeds the 600-second limit. Bypass still loses provenance and rollback still breaks the schema.",
    source: "cache-policy",
    lesson:
      "A changed requirement can remove every available repair. A healthy output alone cannot authorize an expired cache.",
  },
  {
    id: "optional-provenance",
    title: "Change the agreement, change the choice",
    label: "A different repair wins",
    description:
      "Keep the stricter freshness limit, but make provenance optional for Alder in this copy of the incident. The cache is still too old. Bypass now meets every required output check.",
    limit: 600,
    age: 720,
    provenance: false,
    expected: "Bypass is the only eligible repair.",
    inspect: "bypass",
    evidence:
      "Compare this bypass output with example 01. The same missing field is acceptable under the revised assumption. Report identity, amount, currency, and Cedar's output still have to pass.",
    source: "alder-agreement",
    lesson:
      "Eligibility comes from explicit customer requirements. The verifier does not treat every missing field as universally acceptable or universally forbidden.",
  },
  {
    id: "exact-boundary",
    title: "Exactly 900 seconds old",
    label: "Inclusive freshness limit",
    description:
      "Set both the cache age and the policy limit to 900 seconds. All candidate trials use one fixed observation time, so elapsed screen time cannot change this experiment's answer.",
    limit: 900,
    age: 900,
    provenance: true,
    expected: "Verified cache passes at the exact limit.",
    inspect: "cache",
    evidence:
      "Open Checks and inspect the freshness comparison: age ≤ maximum age. Original data and provenance must also pass; freshness is only one check.",
    source: "cache-policy",
    lesson:
      "The policy uses an inclusive comparison. One shared timestamp makes the boundary reproducible across all three isolated trials.",
  },
  {
    id: "one-second-late",
    title: "One second changes the outcome",
    label: "Expired evidence",
    description:
      "Change only the cache age from 900 to 901 seconds. The response still contains complete data, but it is now outside the accepted freshness window.",
    limit: 900,
    age: 901,
    provenance: true,
    expected: "Verified cache fails; no repair is eligible.",
    inspect: "cache",
    evidence:
      "The cache response can still return HTTP 200 and preserve provenance. Its failed freshness check is enough to reject the repair.",
    source: "cache-policy",
    lesson:
      "A passing response does not override a failed policy check. Approval also rechecks freshness against the current clock.",
  },
  {
    id: "two-options",
    title: "When two repairs satisfy the requirements",
    label: "Eligibility and preference",
    description:
      "Use a fresh cache and make provenance optional. Both bypass and verified cache can now pass. The example recommends cache using the documented preference order.",
    limit: 900,
    age: 0,
    provenance: false,
    expected: "Bypass and verified cache are eligible; cache is preferred.",
    inspect: "cache",
    evidence:
      "Compare the two passing rows. Cache retains provenance; bypass omits it. Rollback remains ineligible because the older worker cannot read the current schema.",
    source: "schema",
    lesson:
      "Checks establish eligibility. A separate preference chooses cache, then bypass, then rollback among passing options. No model inference is used in these examples.",
  },
];

function currentExample() {
  const id = window.location.hash.split("/")[1];
  return examples.find((example) => example.id === id) || examples[0];
}

export function Examples({
  data,
  onTrial,
  onSource,
  onLab,
}: {
  data: Workspace;
  onTrial: (trial: Trial, sources: Source[]) => void;
  onSource: (key: string) => void;
  onLab: () => void;
}) {
  const [example, setExample] = useState(currentExample);
  const [results, setResults] = useState<
    Record<string, { result: Simulation; sources: Source[] }>
  >({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [repair, setRepair] = useState<Repair>(example.inspect);
  const indexRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches)
      indexRef.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [example.id]);
  useEffect(() => {
    const sync = () => {
      const next = currentExample();
      setExample(next);
      setRepair(next.inspect);
      setError("");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const saved = results[example.id];
  const result = saved?.result;
  const selected = result?.trials.find((trial) => trial.repair === repair);

  async function runExample() {
    setPending(true);
    setError("");
    const id = example.id;
    const sources = data.context.sources;
    try {
      const result = await request<Simulation>("/simulations", {
        cache_max_age: example.limit,
        cache_age: example.age,
        requires_provenance: example.provenance,
      });
      setResults((previous) => ({ ...previous, [id]: { result, sources } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ example: example.id, ...result }, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rehearsal-${example.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="examples-page">
      <header className="page-heading examples-heading">
        <div>
          <p className="eyebrow">Six runnable examples</p>
          <h1>See what changes the decision.</h1>
          <p>
            Test repairs against customer agreements and operating policy. Each
            example runs real checks on a copy of the incident. No API key or
            credits needed.
          </p>
        </div>
        <span className="status-tag neutral">
          <FlaskConical size={13} /> Isolated experiments
        </span>
      </header>
      <div className="examples-layout">
        <nav ref={indexRef} className="example-index" aria-label="Examples">
          <div className="panel-caption">
            <span>Choose a case</span>
            <span className="mono">01—06</span>
          </div>
          {examples.map((item, index) => (
            <a
              key={item.id}
              href={`#examples/${item.id}`}
              aria-current={item.id === example.id ? "page" : undefined}
            >
              <span className="example-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <small>{item.label}</small>
                <strong>{item.title}</strong>
              </span>
              {results[item.id] && <Check size={14} aria-label="Executed" />}
            </a>
          ))}
        </nav>
        <article
          className="example-detail"
          aria-labelledby="example-title"
          aria-busy={pending}
        >
          <div className="example-intro">
            <p className="eyebrow">{example.label}</p>
            <h2 id="example-title">{example.title}</h2>
            <p>{example.description}</p>
            <dl className="example-assumptions">
              <div>
                <dt>Cache age</dt>
                <dd>
                  {example.age}
                  <span>seconds</span>
                </dd>
              </div>
              <div>
                <dt>Freshness limit</dt>
                <dd>
                  {example.limit}
                  <span>seconds</span>
                </dd>
              </div>
              <div>
                <dt>Alder's provenance</dt>
                <dd className="text-value">
                  {example.provenance ? "Required" : "Optional"}
                </dd>
              </div>
            </dl>
            <div className="example-run">
              <div>
                <span className="small-muted">Expected result</span>
                <p>{example.expected}</p>
              </div>
              <button
                className="primary"
                disabled={pending}
                onClick={() => void runExample()}
              >
                {pending ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Play size={14} />
                )}
                {pending
                  ? "Running three trials…"
                  : result
                    ? "Run again"
                    : "Run example"}
              </button>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          {result && saved ? (
            <div className="example-results">
              <div className="example-result-heading" role="status">
                <div>
                  <span className="eyebrow">Executed result</span>
                  <h3>
                    {result.recommendation
                      ? `${REPAIRS[result.recommendation].short} recommended`
                      : "No eligible repair"}
                  </h3>
                  <p>
                    {result.eligible.length} eligible ·{" "}
                    {result.trials.reduce(
                      (sum, trial) => sum + trial.checks.length,
                      0,
                    )}{" "}
                    checks executed · {result.duration_ms} ms
                  </p>
                </div>
                <button className="text-button" onClick={download}>
                  <Download size={14} /> Download evidence
                </button>
              </div>
              <Experiments
                trials={result.trials}
                onTrial={(trial) => {
                  setRepair(trial.repair);
                }}
                compact
              />
              <div className="example-inspection-heading">
                <h3>Inspect {REPAIRS[repair].short.toLowerCase()}</h3>
                <button
                  className="text-button"
                  onClick={() => selected && onTrial(selected, saved.sources)}
                >
                  Full evidence <ArrowRight size={13} />
                </button>
              </div>
              {selected && (
                <OutcomeInspector
                  key={`${example.id}-${repair}`}
                  trial={selected}
                  outputs={selected.before}
                />
              )}
            </div>
          ) : (
            <div className="example-preview">
              <FlaskConical size={22} />
              <div>
                <h3>Follow the evidence</h3>
                <p>{example.evidence}</p>
              </div>
            </div>
          )}
          <div className="example-explanation">
            <h3>What this demonstrates</h3>
            <p>{example.lesson}</p>
            <button
              className="text-button"
              onClick={() => onSource(example.source)}
            >
              <FileText size={14} /> Read the current source record{" "}
              <ArrowRight size={13} />
            </button>
            <div className="example-next">
              <span>Test your own assumptions.</span>
              <button className="text-button" onClick={onLab}>
                Open policy lab <ArrowRight size={13} />
              </button>
            </div>
            <p className="fine-print">
              The values above are assumptions for this experiment. The current
              company graph, active service, and approval records stay
              unchanged.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
