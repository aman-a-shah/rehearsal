import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export default function WorkspaceStartup({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const connect = useCallback(async (signal?: AbortSignal) => {
    setError("");
    const deadline = Date.now() + 110000;
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        const response = await fetch("/api/demo/status", {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
            : AbortSignal.timeout(12000),
          credentials: "same-origin",
        });
        const status = await response.json().catch(() => null);
        if (!response.ok || !status) throw new Error("Workspace unavailable");
        if (!signal?.aborted) {
          // Previously shared invitation URLs now open the public workspace.
          if (window.location.hash.startsWith("#invite=")) {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search + "#repositories",
            );
          }
          setReady(true);
        }
        return;
      } catch {
        if (signal?.aborted) return;
        if (attempt === 44 || Date.now() >= deadline) {
          setError("Could not connect to your workspace. Please try again.");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void connect(controller.signal);
    return () => controller.abort();
  }, [connect]);

  if (ready) return <>{children}</>;

  return (
    <main className="repo-loading" aria-live="polite">
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button className="repo-button" onClick={() => void connect()}>
            Try again
          </button>
        </>
      ) : (
        <>
          <Loader2 className="spin" size={22} aria-hidden="true" />
          <p>Connecting to your workspace…</p>
        </>
      )}
    </main>
  );
}
