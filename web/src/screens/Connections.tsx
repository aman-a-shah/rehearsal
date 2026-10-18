import { useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  KeyRound,
  LoaderCircle,
  Network,
} from "lucide-react";
import { request } from "../useWorkspace";
import type { Workspace } from "../types";

export function Connections({
  data,
  onConnected,
  running,
}: {
  data: Workspace;
  onConnected: () => Promise<unknown>;
  running: boolean;
}) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(
    data.provider.model || "claude-sonnet-4-6",
  );
  const [provider, setProvider] = useState(
    data.provider.llm_provider || "anthropic",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Workspace settings</p>
        <h1>Connections</h1>
        <p>Configure the investigator and inspect local services.</p>
      </header>
      <div className="connections-grid">
        <section className="connection-card">
          <div className="connection-title">
            <span className="connection-symbol">b.</span>
            <div>
              <h2>Backboard</h2>
              <p>Investigation & persistent memory</p>
            </div>
            <span
              className={`status-tag ${data.provider.available ? "success" : "neutral"}`}
            >
              <i
                className={data.provider.available ? "good-dot" : "neutral-dot"}
              />
              {data.provider.available ? "Configured" : "Not connected"}
            </span>
          </div>
          <p className="connection-description">
            Backboard runs the investigation and retrieves prior verified
            recoveries. Each proposal must pass the current requirements.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError("");
              setMessage("");
              try {
                await request("/connections/backboard", {
                  api_key: key,
                  model,
                  llm_provider: provider,
                });
                setKey("");
                await onConnected();
                setMessage(
                  "Backboard authenticated. Live investigation is ready. Model availability is checked on the first run.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            <label htmlFor="backboard-key">API key</label>
            <div className="secret-field">
              <KeyRound size={15} />
              <input
                id="backboard-key"
                type="password"
                autoComplete="off"
                value={key}
                placeholder={
                  data.provider.available
                    ? "Enter a key to update this connection"
                    : "Your Backboard API key"
                }
                minLength={8}
                required
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
            <div className="form-pair">
              <div>
                <label htmlFor="model-provider">Model provider</label>
                <select
                  id="model-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              <div>
                <label htmlFor="model-id">Model ID</label>
                <input
                  id="model-id"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="inline-success" role="status">
                <Check size={15} />
                {message}
              </p>
            )}
            <button
              className="primary"
              disabled={pending || running || key.trim().length < 8}
            >
              {pending ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              {pending ? "Checking connection…" : "Connect Backboard"}
            </button>
            <p className="fine-print">
              Your key is held only in server memory for this session. For a
              connection that survives restarts, set{" "}
              <code>BACKBOARD_API_KEY</code> in <code>.env</code>.
            </p>
          </form>
        </section>
        <aside className="connection-details">
          <section>
            <h2>Execution controls</h2>
            <dl className="property-list">
              <div>
                <dt>Reported spend threshold</dt>
                <dd>${(data.provider.run_budget_usd || 1).toFixed(2)} / run</dd>
              </div>
              <div>
                <dt>Tool budget</dt>
                <dd>24 calls</dd>
              </div>
              <div>
                <dt>Investigation timeout</dt>
                <dd>3 minutes</dd>
              </div>
              <div>
                <dt>Memory writes</dt>
                <dd>Verified recoveries only</dd>
              </div>
              <div>
                <dt>Apply authority</dt>
                <dd>Accountable owner</dd>
              </div>
            </dl>
            <p className="fine-print">
              Reported costs are checked after each response. A response can
              exceed the threshold. When the provider omits costs, this
              threshold cannot stop spending.
            </p>
          </section>
          <section className="connection-mini">
            <Database size={20} />
            <div>
              <h3>FalkorDB</h3>
              <p>
                {data.diagram.nodes.length} connected entities · revision{" "}
                {data.context.revision}
              </p>
            </div>
            <i className="good-dot" />
          </section>
          <section className="connection-mini">
            <Network size={20} />
            <div>
              <h3>Local export service</h3>
              <p>Isolated SQLite trials · real HTTP handlers</p>
            </div>
            <i className="good-dot" />
          </section>
          <section>
            <h3>Ready without a key</h3>
            <p className="body-copy">
              Select Demo · real tools in the incident workspace. It runs the
              graph queries and service trials without model calls or credits.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
