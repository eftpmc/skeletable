import { createContext, useContext, useEffect, useState } from "react";

export type TableSummary = {
  owner: string;
  ownerName?: string;
  private?: boolean;
  slug: string;
  topic: string;
  title: string;
  question: string;
  rows: number;
  columns: string[];
  filled: string;
  lastRead: string;
  lastChecked: string;
  checks: { confirmed: number; summary: number; once: number; gap: number };
};

export type Team = { handle: string; name: string; role: "owner" | "editor" };

export type Me = { canSignIn: boolean; user: { email: string; name: string | null; handle: string | null; emailUpdates: boolean; accounts: string[]; teams: Team[]; invites: number } | null };

/** Who's here, loaded when the site opens. `refresh` reloads it after a change to their account. */
export const MeContext = createContext<Me & { refresh: () => void }>({ canSignIn: false, user: null, refresh: () => {} });
export const useMe = () => useContext(MeContext);

type Loaded<T> = { data?: T; status: "loading" | "ready" | "missing" | "failed"; retry: () => void };

/** Sends JSON to the server, and hands back what it says either way. */
export async function sendJson<T>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as T };
}

export const postJson = <T>(url: string, body?: unknown) => sendJson<T>("POST", url, body);

/** Reads JSON from the server, and keeps the last answer on screen while the next one loads. */
export function useJson<T>(url: string): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<Loaded<T>, "retry">>({ status: "loading" });

  useEffect(() => {
    const request = new AbortController();
    setState((previous) => ({ data: previous.data, status: "loading" }));
    fetch(url, { signal: request.signal })
      .then(async (response) => {
        if (response.status === 404) return setState({ status: "missing" });
        if (!response.ok) throw new Error(String(response.status));
        setState({ data: (await response.json()) as T, status: "ready" });
      })
      .catch(() => {
        if (!request.signal.aborted) setState({ status: "failed" });
      });
    return () => request.abort();
  }, [url, attempt]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
}
