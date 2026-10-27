import { parse } from "node-html-parser";
import { FetchError, safeFetch, type SafeFetchOptions, type SafeResponse } from "../../net/safe-fetch.js";

export type StoreState = "open" | "locked" | "maintenance" | "restricted" | "unavailable" | "unknown";
export type StoreObservation = {
  state: StoreState;
  checkedAt: string;
  reason: string;
};

/** A store's accessibility is independent of the availability of its products. */
export function classifyStorefront(page: SafeResponse): Omit<StoreObservation, "checkedAt"> {
  const root = parse(page.body.toString("utf8"));
  const path = new URL(page.url).pathname;
  const passwordForm = root.querySelectorAll("form").some((form) =>
    /\/password\/?(?:\?|$)/i.test(form.getAttribute("action") ?? "") &&
    form.querySelector('input[type="password"]') !== null,
  );
  if (/^\/password\/?$/i.test(path) || passwordForm) {
    return { state: "locked", reason: "Store is password protected" };
  }
  // Only prominent text: a footer mentioning a past closure isn't a closed store.
  const heading = root.querySelectorAll("title, h1, h2").map((el) => el.text).join(" ");
  if (/\b(store|shop|site)\s+(?:is\s+)?(?:temporarily\s+)?closed\b|\b(?:back soon|closed for (?:the )?(?:next )?drop)\b/i.test(heading)) {
    return { state: "locked", reason: "Store announces a temporary closure" };
  }
  if (/\b(?:under maintenance|down for maintenance|maintenance mode)\b/i.test(heading)) {
    return { state: "maintenance", reason: "Store announces maintenance" };
  }
  if ([401, 403, 429].includes(page.status) || /\b(?:verify you are human|just a moment|access denied)\b/i.test(heading)) {
    return { state: "restricted", reason: "Store requires access or is limiting requests" };
  }
  if (page.status >= 500) return { state: "unavailable", reason: "Store is temporarily unavailable" };
  if (page.status >= 400) return { state: "unknown", reason: "Page could not be found or read" };
  return { state: "open", reason: "Public page is accessible" };
}

export class StoreUnavailableError extends FetchError {
  constructor(readonly observation: StoreObservation) {
    super(observation.reason, "http_error");
  }
}

export async function readStorefront(url: string, options: SafeFetchOptions = {}) {
  const page = await safeFetch(url, { ...options, allowHttpErrors: true });
  const observation: StoreObservation = { ...classifyStorefront(page), checkedAt: new Date().toISOString() };
  return { page, observation };
}
