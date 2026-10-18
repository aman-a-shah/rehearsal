import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace, Run, Person } from "./types";

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Rehearsal-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The workspace server is unavailable. Check the connection and retry.",
    );
  }
  if (!response.ok)
    throw new Error(
      data.message ||
        data.detail?.[0]?.msg ||
        "The request could not be completed.",
    );
  return data as T;
}

export function useWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [person, setPerson] = useState<Person>("nia");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now() / 1000);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    const next = await request<Workspace>("/workspace");
    if (active.current) setData(next);
    return next;
  }, []);
  const identify = useCallback(async (id: Person) => {
    await request("/session", { person: id });
    if (active.current) setPerson(id);
  }, []);
  useEffect(() => {
    active.current = true;
    Promise.all([
      refresh(),
      request<{ person: Person }>("/session")
        .then((s) => {
          if (active.current) setPerson(s.person);
        })
        .catch(() => identify("nia")),
    ]).catch((e) => {
      if (active.current) setError(e.message);
    });
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => {
      active.current = false;
      window.clearInterval(timer);
    };
  }, [refresh, identify]);
  const run = data?.runs[0] ?? null;
  const running = !!run && ["queued", "running"].includes(run.status);
  useEffect(() => {
    if (run?.memory_sync !== "pending") return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const updated = await request<Run>(`/runs/${run.id}`);
        if (cancelled) return;
        setData((previous) =>
          previous
            ? {
                ...previous,
                runs: previous.runs.map((r) =>
                  r.id === updated.id ? updated : r,
                ),
              }
            : previous,
        );
        if (updated.memory_sync !== "pending") return;
      } catch {
        if (cancelled) return;
      }
      timer = window.setTimeout(poll, 1500);
    };
    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [run?.id, run?.memory_sync]);
  useEffect(() => {
    if (!running || !run) return;
    let cancelled = false;
    let timer: number;
    let fallbackStarted = false;
    const update = (updated: Run) => {
      if (cancelled) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              runs: [
                updated,
                ...previous.runs.filter((r) => r.id !== updated.id),
              ],
            }
          : previous,
      );
    };
    const poll = async () => {
      try {
        const updated = await request<Run>(`/runs/${run.id}`);
        if (cancelled) return;
        update(updated);
        if (!["queued", "running"].includes(updated.status)) {
          await refresh();
          return;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) timer = window.setTimeout(poll, 1200);
    };
    const stream = new EventSource(`/api/runs/${run.id}/events`);
    stream.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data) as Run;
        update(updated);
        if (!["queued", "running"].includes(updated.status)) {
          stream.close();
          void refresh().catch((e) => {
            if (!cancelled) setError(e.message);
          });
        }
      } catch {
        stream.close();
        if (!fallbackStarted) {
          fallbackStarted = true;
          void poll();
        }
      }
    };
    stream.onerror = () => {
      stream.close();
      if (!cancelled && !fallbackStarted) {
        fallbackStarted = true;
        void poll();
      }
    };
    return () => {
      cancelled = true;
      stream.close();
      window.clearTimeout(timer);
    };
  }, [running, run?.id, refresh]);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return {
    data,
    run,
    running,
    person,
    identify,
    error,
    setError,
    busy,
    now,
    act,
    refresh,
  };
}
