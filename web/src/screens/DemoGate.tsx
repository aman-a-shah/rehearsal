import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

type Access = {
  required: boolean;
  authorized: boolean;
  expired: boolean;
  temporary: boolean;
};

async function request(path: string, token?: string, signal?: AbortSignal) {
  const response = await fetch("/api/demo/" + path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    credentials: "same-origin",
    ...(token
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Rehearsal-Request": "1",
          },
          body: JSON.stringify({ token }),
        }
      : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw Object.assign(
      new Error(
        result?.message ||
          "The demo is still starting. Please try again shortly.",
      ),
      { retry: response.status >= 500 || !result },
    );
  return result;
}

export default function DemoGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  const connect = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      let status: Access | null = null;
      const deadline = Date.now() + 110000;
      for (let attempt = 0; attempt < 45; attempt++) {
        try {
          status = await request("status", undefined, signal);
          break;
        } catch (failure) {
          if (signal?.aborted) return;
          if (
            attempt === 44 ||
            Date.now() >= deadline ||
            (failure instanceof Error && "retry" in failure && !failure.retry)
          )
            throw failure;
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      }
      if (!status || signal?.aborted) return;
      setAccess(status);
      const invitation = window.location.hash.startsWith("#invite=")
        ? window.location.hash.slice(8)
        : "";
      if (invitation && status.required && !status.expired) {
        await request("access", invitation, signal);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#repositories",
        );
        setAccess({ ...status, authorized: true });
      }
    } catch (failure) {
      if (!signal?.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not connect to the demo.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void connect(controller.signal);
    const invitationChanged = () => {
      if (window.location.hash.startsWith("#invite="))
        void connect(controller.signal);
    };
    window.addEventListener("hashchange", invitationChanged);
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", invitationChanged);
    };
  }, [connect]);

  if (access?.authorized && !access.expired && !loading)
    return (
      <>
        {access.temporary && (
          <aside className="repo-demo-notice">
            <strong>Temporary judge demo</strong>
            <span>
              Download your patch before leaving. Workspaces reset when the demo
              sleeps.
            </span>
          </aside>
        )}
        {children}
      </>
    );

  return (
    <main className="repo-demo-gate">
      <a className="repo-demo-brand" href="#">
        <span />
        Rehearsal
      </a>
      <section>
        <p className="repo-section-kicker">Judge preview</p>
        <h1>
          {loading
            ? "Starting the demo…"
            : access?.expired
              ? "This preview has ended."
              : "Your code. A real repair."}
        </h1>
        <p>
          {loading
            ? "The temporary server may take about a minute to wake up."
            : access?.expired
              ? "Ask the project owner for a new invitation."
              : "Open your invitation link, or paste its access code to try Rehearsal with your repository or a built-in example."}
        </p>
        {loading ? (
          <Loader2 className="spin" size={22} aria-label="Connecting to demo" />
        ) : access && !access.expired ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              setLoading(true);
              const token = code.trim().includes("#invite=")
                ? code.trim().split("#invite=")[1]
                : code.trim();
              void request("access", token)
                .then(() => {
                  window.history.replaceState(null, "", "#repositories");
                  setAccess({ ...access, authorized: true });
                })
                .catch((failure) => setError(failure.message))
                .finally(() => setLoading(false));
            }}
          >
            <label htmlFor="demo-invitation">Invitation code</label>
            <input
              id="demo-invitation"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              required
              maxLength={300}
            />
            <button className="repo-button primary" type="submit">
              Open demo <ArrowRight size={15} />
            </button>
          </form>
        ) : (
          !access && (
            <button className="repo-button" onClick={() => void connect()}>
              Try again
            </button>
          )
        )}
        {error && (
          <p className="repo-demo-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
