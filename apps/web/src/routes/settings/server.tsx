import type { AdminKeyedSource, AdminStores, Me } from "@skeleton/shared";
import { ArrowUpRightIcon, Badge, Button, IconButton, Skeleton, StatusMark, StoreIcon, TextField, XIcon, cn, focusRing } from "@skeleton/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { ApiError, api } from "../../lib/api";

const REPO = "https://github.com/eftpmc/skeleton";
const KEYS_GUIDE = `${REPO}/blob/main/docs/STORE-KEYS.md`;

const adminKeys = { overview: ["admin", "overview"], stores: ["admin", "stores"], users: ["admin", "users"] } as const;

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** A labelled group inside a section: a title, a line on what it's for, then its contents. */
function Block({ title, detail, trailing, children }: { title: string; detail?: ReactNode; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-ink">{title}</h3>
          {detail && <p className="mt-1 text-callout font-normal text-muted">{detail}</p>}
        </div>
        {trailing}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The server at a glance: how much is in it and what's switched on. */
export function Overview() {
  const { data } = useQuery({ queryKey: adminKeys.overview, queryFn: api.admin.overview });
  const { data: stores } = useQuery({ queryKey: adminKeys.stores, queryFn: api.admin.stores });
  if (!data) return <Skeleton className="h-48" />;
  const storeCount = (stores?.shopify.length ?? 0) + Number(stores?.ebay.configured ?? 0) + Number(stores?.bestbuy.configured ?? 0);
  const numbers: [string, number][] = [
    ["Accounts", data.counts.users],
    ["Products seen", data.counts.products],
    ["Offers", data.counts.offers],
    ["Saved searches", data.counts.savedSearches],
    ["Tracked prices", data.counts.watches],
  ];
  return (
    <div className="space-y-8">
      {storeCount === 0 && (
        <div className="rounded-xl bg-ink p-5 text-on-ink">
          <p className="text-title-3">Search has no stores yet</p>
          <p className="mt-1 text-callout font-normal opacity-75">Every search comes back empty until you add a store or an API key.</p>
          <Link to="/settings/stores" className={cn("mt-4 inline-flex h-10 items-center rounded-full bg-canvas px-4 text-callout font-semibold text-ink", focusRing)}>
            Set up stores
          </Link>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numbers.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface px-4 py-3">
            <dt className="text-footnote text-muted">{label}</dt>
            <dd className="mt-0.5 text-title-2 text-ink tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {stores && (
        <Block
          title="What search covers"
          trailing={
            <Link to="/settings/stores" className={cn("shrink-0 rounded-full text-callout font-normal text-muted hover:text-ink", focusRing)}>
              Manage
            </Link>
          }
        >
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface">
            {(
              [
                ["Shopify stores", stores.shopify.length > 0, stores.shopify.length ? `${stores.shopify.length} ${stores.shopify.length === 1 ? "store" : "stores"}` : "None added"],
                ["eBay", stores.ebay.configured, stores.ebay.configured ? "Connected" : "No keys"],
                ["Best Buy", stores.bestbuy.configured, stores.bestbuy.configured ? "Connected" : "No key"],
              ] as const
            ).map(([label, on, detail]) => (
              <li key={label} className="flex min-h-12 items-center justify-between gap-4 px-4 text-callout">
                <span className="text-ink">{label}</span>
                <StatusMark ok={on}>{detail}</StatusMark>
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="This server" detail="Set in the server's environment. Change them where it's hosted, then redeploy.">
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface">
          {[
            ["Version", data.version],
            ["Runs as", data.deployment === "cloud" ? "Cloud" : "Self-hosted"],
          ].map(([label, value]) => (
            <li key={label} className="flex min-h-12 items-center justify-between gap-4 px-4 text-callout">
              <span className="text-muted">{label}</span>
              <span className="text-ink">{value}</span>
            </li>
          ))}
          {(
            [
              ["Anyone can sign up", data.signupsEnabled],
              ["Signed-out visitors can search", data.publicSearch],
              ["Email can be sent", data.email],
            ] as const
          ).map(([label, on]) => (
            <li key={label} className="flex min-h-12 items-center justify-between gap-4 px-4 text-callout">
              <span className="text-muted">{label}</span>
              <StatusMark ok={on}>{on ? "On" : "Off"}</StatusMark>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

function useStoresMutation<T>(fn: (input: T) => Promise<AdminStores>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.stores, data);
      // Search, settings and the overview all read which stores are on.
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
    },
  });
}

/** What search looks through: Shopify stores by address, eBay and Best Buy by API key. */
export function Stores() {
  const { data } = useQuery({ queryKey: adminKeys.stores, queryFn: api.admin.stores });
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-10">
      <ShopifyStores stores={data} />
      <KeyedSource
        name="eBay"
        detail="New, used and refurbished listings from eBay's Browse API. Needs a free developer keyset."
        state={data.ebay}
        fields={[
          { name: "clientId", label: "App ID (Client ID)" },
          { name: "clientSecret", label: "Cert ID (Client Secret)", secret: true },
        ]}
        extra={`Marketplace ${data.ebay.marketplace}`}
        save={(values) => api.admin.setEbay({ clientId: values.clientId ?? "", clientSecret: values.clientSecret ?? "" })}
        clear={api.admin.clearEbay}
      />
      <KeyedSource
        name="Best Buy"
        detail="New and open-box products from Best Buy (US). Needs a free API key."
        state={data.bestbuy}
        fields={[{ name: "apiKey", label: "API key", secret: true }]}
        save={(values) => api.admin.setBestBuy({ apiKey: values.apiKey ?? "" })}
        clear={api.admin.clearBestBuy}
      />
      <p className="text-footnote text-muted">
        Keys are stored encrypted and never shown again. Pasting a product link works whatever is set up here.
      </p>
    </div>
  );
}

function ShopifyStores({ stores }: { stores: AdminStores }) {
  const [domain, setDomain] = useState("");
  const [condition, setCondition] = useState<"new" | "used">("new");
  const [error, setError] = useState<string | null>(null);
  const add = useStoresMutation(api.admin.addShopify);
  const remove = useStoresMutation(api.admin.removeShopify);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    add.mutate(
      { domain, condition },
      { onSuccess: () => setDomain(""), onError: (e) => setError(message(e, "Couldn't add that store.")) },
    );
  }

  return (
    <Block
      title="Shopify stores"
      detail="Independent shops running on Shopify, searched through their public storefront. No key needed: add a shop's address."
    >
      {stores.shopify.length > 0 && (
        <ul className="mb-3 divide-y divide-line overflow-hidden rounded-xl bg-surface">
          {stores.shopify.map((s) => (
            <li key={s.domain} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-3">
              <StoreIcon name={s.name} src={`/api/store-icons/${encodeURIComponent(s.domain)}`} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-callout font-semibold text-ink">{s.name}</span>
                <span className="block truncate text-footnote text-muted">
                  {s.domain} · {s.condition === "used" ? "Secondhand" : "New"}
                </span>
              </span>
              {s.origin === "env" ? (
                <Badge tone="outline" className="shrink-0">
                  Environment
                </Badge>
              ) : (
                <IconButton label={`Remove ${s.name}`} className="text-muted" disabled={remove.isPending} onClick={() => remove.mutate(s.domain)}>
                  <XIcon size={18} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <TextField
          aria-label="Store address"
          placeholder="shop.example.com"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
        />
        <select
          aria-label="What it sells"
          value={condition}
          onChange={(event) => setCondition(event.target.value as "new" | "used")}
          className={cn("h-12 rounded-xl bg-surface px-3 text-body text-ink", focusRing)}
        >
          <option value="new">Sells new</option>
          <option value="used">Secondhand</option>
        </select>
        <Button type="submit" disabled={!domain.trim() || add.isPending}>
          {add.isPending ? "Checking…" : "Add store"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-callout font-normal text-alert">
          {error}
        </p>
      )}
    </Block>
  );
}

type KeyField = { name: string; label: string; secret?: boolean };

function KeyedSource({
  name,
  detail,
  state,
  fields,
  extra,
  save,
  clear,
}: {
  name: string;
  detail: string;
  state: AdminKeyedSource;
  fields: KeyField[];
  extra?: string;
  save: (values: Record<string, string>) => Promise<AdminStores>;
  clear: () => Promise<AdminStores>;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const saving = useStoresMutation(save);
  const clearing = useStoresMutation(clear);
  const complete = fields.every((f) => (values[f.name] ?? "").trim().length >= 8);

  const status = (
    <StatusMark ok={state.configured}>
      {state.configured ? "Connected" : "Not connected"}
      {state.configured && (
        <span className="text-footnote text-muted">
          {[state.hint ? `key ${state.hint}` : null, extra].filter(Boolean).join(" · ")}
        </span>
      )}
    </StatusMark>
  );

  return (
    <Block
      title={name}
      detail={
        <>
          {detail}{" "}
          <a href={KEYS_GUIDE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink underline">
            How to get one
            <ArrowUpRightIcon size={13} />
          </a>
        </>
      }
    >
      <div className="rounded-xl bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {status}
          {state.origin === "env" ? (
            <Badge tone="outline">Environment</Badge>
          ) : (
            !editing && (
              <div className="flex gap-2">
                <Button variant="secondary" className="h-9 bg-canvas px-4" onClick={() => setEditing(true)}>
                  {state.configured ? "Replace" : "Add keys"}
                </Button>
                {state.configured && (
                  <Button variant="quiet" className="h-9 px-3" disabled={clearing.isPending} onClick={() => clearing.mutate(undefined)}>
                    Remove
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      </div>
      {editing && (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            saving.mutate(values, {
              onSuccess: () => {
                setEditing(false);
                setValues({});
              },
              onError: (e) => setError(message(e, "Couldn't save those keys.")),
            });
          }}
        >
          {fields.map((f) => (
            <TextField
              key={f.name}
              aria-label={f.label}
              placeholder={f.label}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              value={values[f.name] ?? ""}
              onChange={(event) => setValues({ ...values, [f.name]: event.target.value })}
            />
          ))}
          <div className="mt-1 flex gap-2">
            <Button type="submit" disabled={!complete || saving.isPending}>
              Save
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setValues({});
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-callout font-normal text-alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Block>
  );
}

/** Everyone with an account. The owner can make someone an admin (they can set up stores too). */
export function Members({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: adminKeys.users, queryFn: api.admin.users });
  const [error, setError] = useState<string | null>(null);
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) => api.admin.setRole(id, role),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    onError: (e) => setError(message(e, "Couldn't change that.")),
  });
  if (!users) return <Skeleton className="h-48" />;
  const owner = me.role === "owner";

  return (
    <div>
      <p className="text-callout font-normal text-muted">
        {users.length} {users.length === 1 ? "account" : "accounts"}. Admins can set up stores; only the owner gives out admin.
      </p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-surface">
        {users.map((u) => (
          <li key={u.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-callout font-semibold text-ink">
                {u.name || u.email}
                {u.id === me.id && <span className="font-normal text-muted"> (you)</span>}
              </span>
              <span className="block truncate text-footnote text-muted">
                {u.email} · joined {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </span>
            {u.role === "owner" || !owner ? (
              <Badge tone={u.role === "member" ? "light" : "outline"} className="shrink-0">
                {u.role === "owner" ? "Owner" : u.role === "admin" ? "Admin" : "Member"}
              </Badge>
            ) : (
              <select
                aria-label={`Role for ${u.name || u.email}`}
                value={u.role}
                disabled={setRole.isPending}
                onChange={(event) => {
                  setError(null);
                  setRole.mutate({ id: u.id, role: event.target.value as "admin" | "member" });
                }}
                className={cn("h-9 shrink-0 rounded-full bg-canvas px-3 text-callout text-ink", focusRing)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-callout font-normal text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
