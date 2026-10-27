import { SearchField } from "@closet/ui";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
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

/** The one search box: text searches every store; a pasted link finds that product everywhere. */
export function SearchBar({
  initial = "",
  autoFocus = false,
  size,
  className,
}: {
  initial?: string;
  autoFocus?: boolean;
  size?: "lg" | "md";
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(text: string) {
    setError(null);
    if (looksLikeUrl(text)) {
      setBusy(true);
      try {
        const { productId } = await api.resolveLink(text);
        navigate(`/p/${productId}`);
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : "We couldn't read that link. Try another, or search by name.");
      } finally {
        setBusy(false);
      }
      return;
    }
    rememberSearch(text);
    navigate(`/search?q=${encodeURIComponent(text)}`);
  }

  return (
    <div className={className}>
      <SearchField value={value} onChange={setValue} onSubmit={submit} status={busy ? "Reading…" : undefined} autoFocus={autoFocus} size={size} />
      {error && <p className="mt-2 px-2 text-footnote text-ink">{error}</p>}
    </div>
  );
}

/** The search box in a shell's header: shows the current query on results, and starts empty everywhere else. */
export function HeaderSearch({ className }: { className?: string }) {
  const { pathname, search } = useLocation();
  const q = pathname === "/search" ? (new URLSearchParams(search).get("q") ?? "") : "";
  return <SearchBar key={`${pathname}?${q}`} initial={q} size="md" className={className} />;
}
