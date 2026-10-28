import { SearchField } from "@skeleton/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { rememberSearch } from "../lib/recent";

/** "store.com/p/123" or "https://store.com/p/123" are links; "sony xm5" is a search. */
function looksLikeUrl(value: string) {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes(".") && (/^https?:\/\//i.test(value) || url.pathname.length > 1);
  } catch {
    return false;
  }
}

/**
 * What submitting a search does: text searches every store; a pasted link finds that product everywhere.
 * `onDone` runs once the search has somewhere to go (the palette closes then).
 */
export function useSubmitSearch(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(text: string) {
    setError(null);
    if (looksLikeUrl(text)) {
      setBusy(true);
      try {
        const { productId } = await api.resolveLink(text);
        onDone?.();
        navigate(`/p/${productId}`);
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : "We couldn't read that link. Try another, or search by name.");
      } finally {
        setBusy(false);
      }
      return;
    }
    rememberSearch(text);
    onDone?.();
    navigate(`/search?q=${encodeURIComponent(text)}`);
  }

  return { submit, busy, error, isLink: looksLikeUrl };
}

/** The one search box, as a plain field (the signed-out front page). */
export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const { submit, busy, error } = useSubmitSearch();

  return (
    <div>
      <SearchField value={value} onChange={setValue} onSubmit={submit} status={busy ? "Reading…" : undefined} autoFocus={autoFocus} />
      {error && <p className="mt-2 px-2 text-footnote text-ink">{error}</p>}
    </div>
  );
}
