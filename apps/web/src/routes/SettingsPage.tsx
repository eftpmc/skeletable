import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../lib/api";
import { signOut } from "../lib/auth-client";

type User = { name: string; email: string };

export function SettingsPage({ user }: { user: User }) {
  return (
    <section className="mx-auto max-w-xl space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Sources />
      <SizesAndFit />
      <div>
        <h2 className="text-sm font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download everything: your items, sizes, wear history and photos.</p>
        <a
          href="/api/export"
          download
          className="mt-4 inline-flex h-10 items-center rounded-full px-4 text-sm ring-1 ring-line hover:ring-ink"
        >
          Export everything
        </a>
      </div>
      <div>
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted">
          {user.name} · {user.email}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 h-10 rounded-full px-4 text-sm ring-1 ring-line hover:ring-ink"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}

function Sources() {
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  return (
    <div>
      <h2 className="text-sm font-semibold">Stores we search</h2>
      <p className="mt-1 text-sm text-muted">Pasting a product link always works. These add search by name.</p>
      <ul className="mt-4 divide-y divide-line rounded-2xl bg-surface">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="font-medium">{source.label}</span>
            {source.enabled ? (
              <span>Connected</span>
            ) : (
              <span className="text-right text-muted">
                Set <code className="text-xs">{source.needs}</code>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SizesAndFit() {
  const queryClient = useQueryClient();
  const { data: fits = [] } = useQuery({ queryKey: ["brand-fits"], queryFn: api.brandFits });
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: api.brands });
  const [draft, setDraft] = useState({ brand: "", size: "", note: "" });

  const onSaved = (data: Awaited<ReturnType<typeof api.brandFits>>) => {
    queryClient.setQueryData(["brand-fits"], data);
    void queryClient.invalidateQueries({ queryKey: ["brands"] });
  };
  const save = useMutation({ mutationFn: api.saveBrandFit, onSuccess: onSaved });
  const remove = useMutation({ mutationFn: api.deleteBrandFit, onSuccess: onSaved });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.brand.trim()) return;
    save.mutate(draft, { onSuccess: () => setDraft({ brand: "", size: "", note: "" }) });
  }

  const suggestions = brands.filter((brand) => !fits.some((fit) => fit.brand === brand));

  return (
    <div>
      <h2 className="text-sm font-semibold">Sizes &amp; fit</h2>
      <p className="mt-1 text-sm text-muted">Your size in each brand, so you never have to guess again.</p>

      {fits.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {fits.map((fit) => (
            <li key={fit.brand} className="flex items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fit.brand}</span>
                {fit.note && <span className="block truncate text-xs text-muted">{fit.note}</span>}
              </span>
              <span className="truncate text-right">{fit.size ?? "—"}</span>
              <button
                type="button"
                aria-label={`Remove ${fit.brand}`}
                onClick={() => remove.mutate(fit.brand)}
                className="text-muted hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-4 grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]">
        <input
          aria-label="Brand"
          placeholder="Brand"
          list="fit-brand-options"
          value={draft.brand}
          onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
          className="h-11 rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus:border-ink"
        />
        <datalist id="fit-brand-options">
          {suggestions.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
        <input
          aria-label="Size"
          placeholder="Size"
          value={draft.size}
          onChange={(event) => setDraft({ ...draft, size: event.target.value })}
          className="h-11 rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus:border-ink"
        />
        <input
          aria-label="Fit note"
          placeholder="Runs big, size down…"
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          className="col-span-2 h-11 rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus:border-ink sm:col-span-1"
        />
        <button
          type="submit"
          disabled={!draft.brand.trim() || save.isPending}
          className="col-span-2 h-11 rounded-full bg-ink px-5 text-sm font-medium text-canvas disabled:opacity-40 sm:col-span-1"
        >
          Save
        </button>
      </form>
    </div>
  );
}
