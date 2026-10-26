import { SearchField } from "@closet/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";

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
export function SearchBar({ initial = "", back = false, autoFocus = false }: { initial?: string; back?: boolean; autoFocus?: boolean }) {
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
    navigate(`/search?q=${encodeURIComponent(text)}`);
  }

  return (
    <div>
      <SearchField
        value={value}
        onChange={setValue}
        onSubmit={submit}
        onBack={back ? () => (window.history.length > 1 ? navigate(-1) : navigate("/")) : undefined}
        status={busy ? "Reading…" : undefined}
        autoFocus={autoFocus}
      />
      {error && <p className="mt-2 px-2 text-footnote text-ink">{error}</p>}
    </div>
  );
}
