import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { ChevronLeftIcon, SearchIcon, XIcon } from "./icons";

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    setError(null);
    if (looksLikeUrl(text)) {
      setBusy(true);
      try {
        const { productId } = await api.resolveLink(text);
        navigate(`/p/${productId}`);
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : "Couldn't read that link");
      } finally {
        setBusy(false);
      }
      return;
    }
    navigate(`/search?q=${encodeURIComponent(text)}`);
  }

  return (
    <div>
      <form
        onSubmit={submit}
        role="search"
        className="flex h-14 items-center gap-2 rounded-2xl bg-canvas pr-2 pl-2 shadow-[0_2px_14px_rgba(0,0,0,0.12)] dark:ring-1 dark:ring-line"
      >
        {back ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="flex size-10 items-center justify-center rounded-full"
          >
            <ChevronLeftIcon />
          </button>
        ) : (
          <span className="flex size-10 items-center justify-center">
            <SearchIcon strokeWidth={2.4} />
          </span>
        )}
        <input
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search or paste a link"
          aria-label="Search every store"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {busy && <span className="text-sm text-muted">Reading…</span>}
        {value && !busy && (
          <button type="button" aria-label="Clear" onClick={() => setValue("")} className="flex size-10 items-center justify-center rounded-full">
            <XIcon size={20} />
          </button>
        )}
      </form>
      {error && <p className="mt-2 px-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
