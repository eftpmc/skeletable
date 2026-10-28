import { type AccentName, Badge, Button, Chip, DownloadIcon, IconButton, SegmentedControl, Skeleton, TextField, XIcon, accents, buttonClass, cn, focusRing } from "@skeleton/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { type Me, type NotifySettings, type ShopFor, catalogCategories } from "@skeleton/shared";
import { ApiError, api } from "../../lib/api";
import { useAccent } from "../../lib/accent";
import { changePassword, signOut, updateUser } from "../../lib/auth-client";
import { meKey } from "../../lib/me";
import { usePreferences, useSetPreferences } from "../../lib/preferences";

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** A topic nobody else will guess: anyone who knows an ntfy.sh topic can read it. */
const newTopic = () => `https://ntfy.sh/skeleton-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

/** Where alerts go outside the app: ntfy on a phone, a morning email. */
export function Notifications() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const [ntfyDraft, setNtfyDraft] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const save = useMutation({
    mutationFn: (changes: Partial<Pick<NotifySettings, "ntfyUrl" | "emailDigest">>) =>
      api.saveNotifications({
        ntfyUrl: settings?.ntfyUrl ?? null,
        emailDigest: settings?.emailDigest ?? false,
        ...changes,
        timezone: timezone(),
      }),
    // Show the change at once (the email switch flips on click); the server's answer replaces it.
    onMutate: (changes) => queryClient.setQueryData<NotifySettings>(["notifications"], (old) => old && { ...old, ...changes }),
    onSuccess: (data) => {
      queryClient.setQueryData(["notifications"], data);
      setNtfyDraft(null);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setNote({ text: error instanceof ApiError ? error.message : "Couldn't save that.", error: true });
    },
  });
  const test = useMutation({
    mutationFn: api.testNotification,
    onSuccess: (_, channel) => setNote({ text: channel === "ntfy" ? "Sent. Check your phone." : `Sent to ${settings?.email}.` }),
    onError: (error) => setNote({ text: error instanceof ApiError ? error.message : "Couldn't send it.", error: true }),
  });

  if (!settings) return null;
  const ntfy = ntfyDraft ?? settings.ntfyUrl ?? "";
  const ntfyChanged = ntfy.trim() !== (settings.ntfyUrl ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    save.mutate({ ntfyUrl: ntfy.trim() || null });
  }

  return (
    <div>
      <h3 className="text-body font-semibold text-ink">On your phone</h3>
      <p className="mt-1 text-callout font-normal text-muted">
        Install the free{" "}
        <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="underline">
          ntfy
        </a>{" "}
        app, subscribe to a topic, and paste its link here. Anyone who knows the topic can read it, so keep it hard to guess.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <TextField
          aria-label="ntfy topic link"
          type="url"
          inputMode="url"
          placeholder="https://ntfy.sh/your-secret-topic"
          value={ntfy}
          onChange={(event) => setNtfyDraft(event.target.value)}
          className="min-w-0 sm:flex-1"
        />
        {/* Keys keep these two separate buttons: reusing one would turn the click on "Make a topic" into a submit. */}
        {ntfyChanged ? (
          <Button key="save" type="submit" disabled={save.isPending}>
            Save
          </Button>
        ) : (
          !ntfy && (
            <Button key="make" type="button" variant="secondary" onClick={() => setNtfyDraft(newTopic())}>
              Make a topic
            </Button>
          )
        )}
      </form>
      {settings.ntfyUrl && !ntfyChanged && (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" disabled={test.isPending} onClick={() => test.mutate("ntfy")}>
            Send a test
          </Button>
          <Button variant="secondary" onClick={() => save.mutate({ ntfyUrl: null })}>
            Turn off
          </Button>
        </div>
      )}

      <h3 className="mt-6 text-body font-semibold text-ink">By email</h3>
      <label className="mt-3 flex min-h-[52px] items-center gap-3 rounded-xl bg-surface px-4 text-body text-ink has-disabled:opacity-60">
        <input
          type="checkbox"
          className="size-5 accent-ink"
          checked={settings.emailDigest}
          disabled={!settings.emailAvailable || save.isPending}
          onChange={(event) => {
            setNote(null);
            save.mutate({ emailDigest: event.target.checked });
          }}
        />
        <span className="min-w-0 flex-1">
          A morning digest at {hourLabel(settings.digestHour)}
          <span className="block truncate text-footnote text-muted">{settings.email}</span>
        </span>
      </label>
      {settings.emailAvailable ? (
        settings.emailDigest && (
          <Button variant="secondary" className="mt-2" disabled={test.isPending} onClick={() => test.mutate("email")}>
            Send a test
          </Button>
        )
      ) : (
        <p className="mt-2 px-4 text-footnote text-muted">
          This server can't send email yet. Set <code>EMAIL_FROM</code> and <code>SMTP_URL</code> or <code>RESEND_API_KEY</code>.
        </p>
      )}

      {note && (
        <p role="status" className={cn("mt-3 text-callout font-normal", note.error ? "text-alert" : "text-muted")}>
          {note.text}
        </p>
      )}
    </div>
  );
}

const priceCaps = [null, 50, 100, 200, 300, 500, 1000] as const;

/** What Discover shows: which side of the catalog, a price to stay under, and categories to leave out. */
export function DiscoverPreferences() {
  const { data: prefs } = usePreferences();
  const set = useSetPreferences();
  const { data: counts = [] } = useQuery({ queryKey: ["catalog", "categories"], queryFn: api.catalogCategories, staleTime: 5 * 60 * 1000 });
  if (!prefs) return <Skeleton className="h-64 w-full" />;
  const hidden = new Set<string>(prefs.hiddenCategories);
  // The categories the catalog has something in, plus any already turned off so they can come back on.
  const stocked = new Set(counts.map((c) => c.id));
  const offered = catalogCategories.filter((c) => stocked.has(c.id) || hidden.has(c.id));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="text-body font-semibold text-ink">Shop for</h3>
        <p className="mt-1 text-callout font-normal text-muted">
          {prefs.shopFor === null
            ? "Discover shows everything and leans toward the side you open and save."
            : "Discover shows only this side. Unisex pieces show either way."}
        </p>
        <SegmentedControl
          className="mt-4"
          label="Shop for"
          value={prefs.shopFor ?? "learn"}
          onValueChange={(value) => set.mutate({ shopFor: value === "learn" ? null : (value as ShopFor) })}
          segments={[
            { value: "learn", label: "Learn it" },
            { value: "women", label: "Women" },
            { value: "men", label: "Men" },
            { value: "all", label: "All" },
          ]}
        />
      </section>

      <section>
        <h3 className="text-body font-semibold text-ink">Price</h3>
        <p className="mt-1 text-callout font-normal text-muted">Pieces over it come up less often. Nothing is hidden for its price.</p>
        <div role="group" aria-label="Price to stay under" className="mt-4 flex flex-wrap gap-2">
          {priceCaps.map((cap) => (
            <Chip key={cap ?? "any"} selected={prefs.priceMaxUsd === cap} onClick={() => set.mutate({ priceMaxUsd: cap })}>
              {cap === null ? "Any price" : `Under $${cap.toLocaleString()}`}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-body font-semibold text-ink">Categories</h3>
        <p className="mt-1 text-callout font-normal text-muted">
          What the feed shows. Turn one off to leave it out; you can still open it on its own in Discover.
        </p>
        <div role="group" aria-label="Categories in the feed" className="mt-4 flex flex-wrap gap-2">
          {offered.map((c) => (
            <Chip
              key={c.id}
              selected={!hidden.has(c.id)}
              onClick={() =>
                set.mutate({ hiddenCategories: hidden.has(c.id) ? prefs.hiddenCategories.filter((h) => h !== c.id) : [...prefs.hiddenCategories, c.id] })
              }
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

export function Appearance() {
  const { name: current, setName } = useAccent();
  return (
    <div>
      <h3 className="text-body font-semibold text-ink">Theme color</h3>
      <p className="mt-1 text-callout font-normal text-muted">Colors the art and the sidebar. Saved in this browser.</p>
      <div role="group" aria-label="Theme color" className="mt-4 flex flex-wrap gap-3">
        {(Object.keys(accents) as AccentName[]).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === current}
            onClick={() => setName(name)}
            className={cn(
              "flex h-11 items-center gap-2 rounded-full bg-surface pr-4 pl-1.5 text-callout text-ink ring-2 ring-transparent transition-shadow aria-pressed:ring-ink",
              focusRing,
            )}
          >
            <span aria-hidden="true" className="size-8 rounded-full" style={{ background: accents[name].accent }} />
            {accents[name].label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SizesAndFit() {
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
      {fits.length > 0 && (
        <ul className="mb-4 divide-y divide-line overflow-hidden rounded-xl bg-surface">
          {fits.map((fit) => (
            <li key={fit.brand} className="flex min-h-[52px] items-center gap-3 py-2 pr-2 pl-4 text-body">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{fit.brand}</span>
                {fit.note && <span className="block truncate text-footnote text-muted">{fit.note}</span>}
              </span>
              <span className="truncate text-right tabular-nums">{fit.size ?? "—"}</span>
              <IconButton label={`Remove ${fit.brand}`} className="text-muted" onClick={() => remove.mutate(fit.brand)}>
                <XIcon size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]">
        <TextField
          aria-label="Brand"
          placeholder="Brand"
          list="fit-brand-options"
          value={draft.brand}
          onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
        />
        <datalist id="fit-brand-options">
          {suggestions.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
        <TextField aria-label="Size" placeholder="Size" value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })} />
        <TextField
          aria-label="Fit note"
          placeholder="Runs big, size down…"
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          className="col-span-2 sm:col-span-1"
        />
        <Button type="submit" className="col-span-2 sm:col-span-1" disabled={!draft.brand.trim() || save.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}

/** Who you are here: name, email, password, and signing out. */
export function Account({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  // Drop everything cached for this account, so signed-out pages (and the next account) start clean.
  const leave = () => signOut().then(() => queryClient.clear());

  const rename = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await updateUser({ name: value });
      if (error) throw new Error(error.message ?? "Couldn't save your name.");
    },
    onSuccess: () => {
      setName(null);
      setNote({ text: "Name saved." });
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
    onError: (error) => setNote({ text: error.message, error: true }),
  });
  const repass = useMutation({
    mutationFn: async () => {
      const { error } = await changePassword({ currentPassword: passwords.current, newPassword: passwords.next, revokeOtherSessions: true });
      if (error) throw new Error(error.message ?? "Couldn't change your password.");
    },
    onSuccess: () => {
      setPasswords({ current: "", next: "" });
      setNote({ text: "Password changed. You're signed out everywhere else." });
    },
    onError: (error) => setNote({ text: error.message, error: true }),
  });

  const draft = name ?? me.name;
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-body font-semibold text-ink">{me.email}</h3>
          {me.role !== "member" && <Badge tone="outline">{me.role === "owner" ? "Owner" : "Admin"}</Badge>}
        </div>
        <p className="mt-1 text-callout font-normal text-muted">The email you sign in with.</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setNote(null);
          if (draft.trim() && draft.trim() !== me.name) rename.mutate(draft.trim());
        }}
      >
        <label htmlFor="account-name" className="text-body font-semibold text-ink">
          Name
        </label>
        <div className="mt-2 flex gap-2">
          <TextField id="account-name" value={draft} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" disabled={rename.isPending || !draft.trim() || draft.trim() === me.name}>
            Save
          </Button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setNote(null);
          repass.mutate();
        }}
      >
        <h3 className="text-body font-semibold text-ink">Password</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <TextField
            type="password"
            autoComplete="current-password"
            aria-label="Current password"
            placeholder="Current password"
            value={passwords.current}
            onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
          />
          <TextField
            type="password"
            autoComplete="new-password"
            aria-label="New password"
            placeholder="New password (8+ characters)"
            minLength={8}
            value={passwords.next}
            onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={repass.isPending || !passwords.current || passwords.next.length < 8}>
            Change
          </Button>
        </div>
      </form>

      {note && (
        <p role="status" className={cn("text-callout font-normal", note.error ? "text-alert" : "text-muted")}>
          {note.text}
        </p>
      )}

      <div className="border-t border-line pt-6">
        <Button variant="secondary" onClick={() => void leave()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** Everything you've put in, to take with you. */
export function YourData() {
  return (
    <div>
      <p className="text-callout font-normal text-muted">
        A zip of your collection, sizes and wear history, with every photo.
      </p>
      <a href="/api/export" download className={buttonClass({ variant: "secondary", className: "mt-4 gap-2" })}>
        <DownloadIcon size={18} />
        Export everything
      </a>
    </div>
  );
}
