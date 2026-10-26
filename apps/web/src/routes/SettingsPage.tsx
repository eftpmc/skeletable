import { type AccentName, Button, IconButton, ListGroup, ListRow, ScreenTitle, TextField, XIcon, accents, buttonClass, cn, focusRing } from "@closet/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import type { NotifySettings } from "@closet/shared";
import { ApiError, api } from "../lib/api";
import { useAccent } from "../lib/accent";
import { signOut } from "../lib/auth-client";

type User = { name: string; email: string };

export function SettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  // Drop everything cached for this account, so signed-out pages (and the next account) start clean.
  const leave = () => signOut().then(() => queryClient.clear());

  return (
    <section className="mx-auto max-w-xl space-y-10">
      <ScreenTitle className="pt-4 md:pt-0">Profile</ScreenTitle>
      <AlertDelivery />
      <ThemeColor />
      <Sources />
      <SizesAndFit />
      <div>
        <h2 className="text-title-3 text-ink">Your data</h2>
        <p className="mt-1 text-callout font-normal text-muted">Download everything: your items, sizes, wear history and photos.</p>
        <a href="/api/export" download className={buttonClass({ variant: "secondary", className: "mt-4" })}>
          Export everything
        </a>
      </div>
      <div>
        <h2 className="text-title-3 text-ink">Account</h2>
        <p className="mt-1 text-callout font-normal text-muted">
          {user.name} · {user.email}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => void leave()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** A topic nobody else will guess: anyone who knows an ntfy.sh topic can read it. */
const newTopic = () => `https://ntfy.sh/skeleton-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

function AlertDelivery() {
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
      <h2 className="text-title-3 text-ink">Get alerts</h2>
      <p className="mt-1 text-callout font-normal text-muted">New matches and price drops, without opening the app.</p>

      <h3 className="mt-6 text-body font-semibold text-ink">On your phone</h3>
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

function ThemeColor() {
  const { name: current, setName } = useAccent();
  return (
    <div>
      <h2 className="text-title-3 text-ink">Theme color</h2>
      <p className="mt-1 text-callout font-normal text-muted">Colors the home page art and the sidebar. Saved in this browser.</p>
      <div role="group" aria-label="Theme color" className="mt-4 flex gap-3">
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

function Sources() {
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  return (
    <div>
      <ListGroup label="Stores we search">
        {sources.map((source) => (
          <ListRow
            key={source.id}
            title={source.label}
            value={
              source.enabled ? (
                "Connected"
              ) : (
                <span className="text-callout font-normal text-muted">
                  Set <code className="text-footnote">{source.needs}</code>
                </span>
              )
            }
          />
        ))}
      </ListGroup>
      <p className="mt-2 px-4 text-footnote text-muted">Pasting a product link always works. These add search by name.</p>
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
      <h2 className="text-title-3 text-ink">Sizes &amp; fit</h2>
      <p className="mt-1 text-callout font-normal text-muted">Your size in each brand, so you never have to guess again.</p>

      {fits.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-surface">
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

      <form onSubmit={submit} className="mt-4 grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]">
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
