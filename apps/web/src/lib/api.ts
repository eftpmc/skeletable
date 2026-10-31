import { useEffect, useState } from "react";

export type TableSummary = {
  owner: string;
  slug: string;
  topic: string;
  title: string;
  question: string;
  rows: number;
  columns: string[];
  filled: string;
  lastRead: string;
  lastChecked: string;
};

type Loaded<T> = { data?: T; status: "loading" | "ready" | "missing" | "failed"; retry: () => void };

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
