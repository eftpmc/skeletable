import { ArrowUpRightIcon, BellIcon, BookmarkIcon, ClockIcon, CompassIcon, PaletteDialog, SearchIcon, cn, focusRing } from "@closet/ui";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { searchDetail, searchHref, useSavedSearches, useWatches } from "../lib/alerts";
import { useBrandSearch } from "../lib/catalog";
import { formatMoney } from "../lib/format";
import { useRecentSearches } from "../lib/recent";
import { shortcutHref, shortcuts } from "../lib/shortcuts";
import { useSignedIn } from "../lib/viewer";
import { brandMeta } from "./BrandCard";
import { useSubmitSearch } from "./SearchBar";

type PaletteContext = { open: (query?: string) => void };
const Context = createContext<PaletteContext>({ open: () => {} });

/** Opens the search palette from anywhere: the header field, the phone's bottom pill, `/` or ⌘K. */
export const useSearchPalette = () => useContext(Context);

export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const open = useCallback((query = "") => setState({ open: true, query }), []);
  const { pathname, search } = useLocation();
  const current = pathname === "/search" ? (new URLSearchParams(search).get("q") ?? "") : "";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        open(current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, current]);

  return (
    <Context.Provider value={useMemo(() => ({ open }), [open])}>
      {children}
      <PaletteDialog open={state.open} onOpenChange={(next) => setState((s) => ({ ...s, open: next }))} label="Search">
        {state.open && <Palette initial={state.query} close={() => setState((s) => ({ ...s, open: false }))} />}
      </PaletteDialog>
    </Context.Provider>
  );
}

/** The search box in a header: looks like a field, opens the palette. Shows the current search on results. */
export function SearchTrigger({ className }: { className?: string }) {
  const { open } = useSearchPalette();
  const { pathname, search } = useLocation();
  const q = pathname === "/search" ? (new URLSearchParams(search).get("q") ?? "") : "";
  return (
    <button
      type="button"
      onClick={() => open(q)}
      className={cn("flex h-11 w-full items-center gap-2.5 rounded-full bg-surface pr-2 pl-3.5 text-left text-body hover:bg-line/60", focusRing, className)}
    >
      <SearchIcon size={20} strokeWidth={2.4} className="shrink-0 text-ink" />
      <span className={cn("min-w-0 flex-1 truncate", q ? "text-ink" : "text-muted")}>{q || "Search or paste a link"}</span>
      <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-md border border-line bg-canvas px-1.5 font-sans text-footnote text-muted lg:flex">/</kbd>
    </button>
  );
}

type Row = { key: string; icon: ReactNode; label: ReactNode; detail?: ReactNode; trailing?: ReactNode; run: () => void };
type Section = { title?: string; rows: Row[] };

const includes = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase());

/** The query's letters in bold where they appear. */
function Match({ text, q }: { text: string; q: string }) {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + q.length)}</strong>
      {text.slice(at + q.length)}
    </>
  );
}

function Thumb({ src, children }: { src?: string | null; children?: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-ink">
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : children}
    </span>
  );
}

/**
 * Before you type: recent searches, saved searches, places to start. While you type: search every store
 * first, then what you already have that matches (tracked products, saved searches, brands). Arrows
 * move, Enter opens, Escape closes.
 */
function Palette({ initial, close }: { initial: string; close: () => void }) {
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const recent = useRecentSearches();
  const { data: searches = [] } = useSavedSearches();
  const { data: watches = [] } = useWatches();
  const text = q.trim();
  const brands = useBrandSearch(signedIn ? text : "");
  const { submit, busy, error, isLink } = useSubmitSearch(close);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const go = (to: string) => {
    close();
    navigate(to);
  };

  const sections: Section[] = [];
  if (!text) {
    if (recent.length) {
      sections.push({
        title: "Recent",
        rows: recent.slice(0, 5).map((r) => ({ key: `r:${r}`, icon: <Thumb><ClockIcon size={18} /></Thumb>, label: r, run: () => submit(r) })),
      });
    }
    if (searches.length) {
      sections.push({
        title: "Your saved searches",
        rows: [...searches]
          .sort((a, b) => b.newCount - a.newCount)
          .slice(0, 4)
          .map((s) => ({
            key: `s:${s.id}`,
            icon: <Thumb src={s.images[0]}><BellIcon size={18} /></Thumb>,
            label: s.query,
            detail: searchDetail(s) || "Any price, any condition",
            trailing: s.newCount > 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-label text-on-ink">{s.newCount} new</span> : null,
            run: () => go(searchHref(s)),
          })),
      });
    }
    sections.push({
      title: "Start somewhere",
      rows: shortcuts.map((s) => ({ key: `c:${s.label}`, icon: <Thumb><SearchIcon size={18} /></Thumb>, label: s.label, run: () => go(shortcutHref(s)) })),
    });
  } else {
    const link = isLink(text);
    sections.push({
      rows: [
        {
          key: "search",
          icon: <Thumb>{link ? <ArrowUpRightIcon size={18} /> : <SearchIcon size={18} />}</Thumb>,
          label: link ? "Find this product everywhere" : (
            <>
              Search every store for <strong className="font-semibold">“{text}”</strong>
            </>
          ),
          detail: link ? text : undefined,
          trailing: busy ? <span className="text-footnote text-muted">Reading…</span> : null,
          run: () => submit(text),
        },
      ],
    });
    const tracked = watches.filter((w) => includes(w.title, text) || (w.brand && includes(w.brand, text))).slice(0, 3);
    if (tracked.length) {
      sections.push({
        title: "You're tracking",
        rows: tracked.map((w) => ({
          key: `w:${w.productId}`,
          icon: <Thumb src={w.imageUrl}><BookmarkIcon size={18} /></Thumb>,
          label: <Match text={w.title} q={text} />,
          detail: w.dropCents > 0 ? `−${formatMoney(w.dropCents, w.currency)} since you saved it` : "No change since you saved it",
          trailing: <span className="text-callout font-semibold text-ink tabular-nums">{formatMoney(w.currentPriceCents, w.currency)}</span>,
          run: () => go(`/p/${w.productId}`),
        })),
      });
    }
    const saved = searches.filter((s) => includes(s.query, text)).slice(0, 3);
    if (saved.length) {
      sections.push({
        title: "Your saved searches",
        rows: saved.map((s) => ({
          key: `s:${s.id}`,
          icon: <Thumb src={s.images[0]}><BellIcon size={18} /></Thumb>,
          label: <Match text={s.query} q={text} />,
          detail: searchDetail(s) || "Any price, any condition",
          trailing: s.newCount > 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-label text-on-ink">{s.newCount} new</span> : null,
          run: () => go(searchHref(s)),
        })),
      });
    }
    const earlier = recent.filter((r) => includes(r, text) && r.toLowerCase() !== text.toLowerCase()).slice(0, 3);
    if (earlier.length) {
      sections.push({
        title: "Recent",
        rows: earlier.map((r) => ({ key: `r:${r}`, icon: <Thumb><ClockIcon size={18} /></Thumb>, label: <Match text={r} q={text} />, run: () => submit(r) })),
      });
    }
    const found = (brands.data ?? []).slice(0, 3);
    if (found.length) {
      sections.push({
        title: "Brands",
        rows: found.map((b) => ({
          key: `b:${b.id}`,
          icon: <Thumb src={b.photos[0]}><CompassIcon size={18} /></Thumb>,
          label: <Match text={b.name} q={text} />,
          detail: brandMeta(b),
          run: () => go(`/brands/${b.id}`),
        })),
      });
    }
  }

  const rows = sections.flatMap((s) => s.rows);
  const current = Math.min(active, rows.length - 1);

  // Keep the highlighted row in view as the arrows move it.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[current]) rows[current].run();
      else if (text) void submit(text);
    }
  }

  let index = 0;
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4 md:pl-5">
        <SearchIcon size={22} strokeWidth={2.4} className="shrink-0 text-ink" />
        <input
          type="search"
          enterKeyHint="search"
          autoFocus
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search or paste a link"
          aria-label="Search every store"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows[current] ? `${listId}-${current}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <button type="button" onClick={close} className={cn("h-10 shrink-0 rounded-full px-3 text-callout font-medium text-ink md:hidden", focusRing)}>
          Cancel
        </button>
        <kbd className="mr-2 hidden h-6 items-center rounded-md border border-line px-1.5 font-sans text-footnote text-muted md:flex">esc</kbd>
      </div>

      {error && <p className="border-b border-line px-5 py-3 text-footnote text-ink">{error}</p>}

      <div ref={listRef} id={listId} role="listbox" aria-label="Suggestions" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section, s) => (
          <div key={section.title ?? s} role="group" aria-label={section.title} className={cn(s > 0 && "mt-2")}>
            {section.title && <div className="px-3 pt-2 pb-1 text-section-label text-muted uppercase">{section.title}</div>}
            {section.rows.map((row) => {
              const i = index++;
              return (
                <div
                  key={row.key}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => i !== current && setActive(i)}
                  onClick={row.run}
                  className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === current && "bg-surface")}
                >
                  {row.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{row.label}</span>
                    {row.detail && <span className="block truncate text-footnote text-muted">{row.detail}</span>}
                  </span>
                  {row.trailing}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="hidden shrink-0 items-center gap-4 border-t border-line px-5 py-2.5 text-footnote text-muted md:flex">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
        </span>
        <span>
          <kbd className="font-sans">↵</kbd> to open
        </span>
        <span className="ml-auto">
          <kbd className="font-sans">/</kbd> opens search anywhere
        </span>
      </div>
    </>
  );
}
