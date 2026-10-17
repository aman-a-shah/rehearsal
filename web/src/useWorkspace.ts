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
  const data = await response.json();
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
    if (!running || !run) return;
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
                runs: [
                  updated,
                  ...previous.runs.filter((r) => r.id !== updated.id),
                ],
              }
            : previous,
        );
        if (!["queued", "running"].includes(updated.status)) {
          await refresh();
          return;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) timer = window.setTimeout(poll, 450);
    };
    void poll();
    return () => {
      cancelled = true;
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
