import type { FormEvent, ReactNode } from "react";
import { cn } from "./cn";
import { ChevronLeftIcon, SearchIcon, XIcon } from "./icons";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** Show a back button instead of the search glyph (results screens). */
  onBack?: () => void;
  placeholder?: string;
  /** Right side while working, e.g. "Reading…" for a pasted link. */
  status?: ReactNode;
  /** Extra button on the right when the field is empty (camera). */
  trailing?: ReactNode;
  autoFocus?: boolean;
  /** "lg" is the lifted field on a page; "md" sits flat in a header bar. */
  size?: "lg" | "md";
  className?: string;
};

/**
 * The one search box. Lifted on canvas with `shadow-field`; the only element that is. It has no focus
 * ring: it is usually focused on arrival, and the caret already shows where you are typing. In a header
 * bar it comes in `md`: shorter, flat on `surface`.
 */
export function SearchField({
  value,
  onChange,
  onSubmit,
  onBack,
  placeholder = "Search or paste a link",
  status,
  trailing,
  autoFocus,
  size = "lg",
  className,
}: SearchFieldProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className={cn(
        "flex items-center gap-1 px-2",
        size === "lg" ? "h-14 rounded-xl bg-canvas shadow-field" : "h-11 rounded-full bg-surface",
        className,
      )}
    >
      {onBack ? (
        <button type="button" aria-label="Back" onClick={onBack} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink outline-none">
          <ChevronLeftIcon />
        </button>
      ) : (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center text-ink">
          <SearchIcon strokeWidth={2.4} />
        </span>
      )}
      <input
        type="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search every store"
        className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {status && <span className="shrink-0 px-2 text-footnote text-muted">{status}</span>}
      {!status && value && (
        <button type="button" aria-label="Clear" onClick={() => onChange("")} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink outline-none">
          <XIcon size={20} />
        </button>
      )}
      {!status && !value && trailing}
    </form>
  );
}
