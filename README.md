# skeleton

One search for every store: new, used and refurbished, with price verdicts and alerts. Use the cloud or host it yourself.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the product and architecture plan.

## Self-host

Requirements: Docker with Compose.

```sh
curl -O https://raw.githubusercontent.com/eftpmc/skeleton/main/docker-compose.yml
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
echo "MEILI_MASTER_KEY=$(openssl rand -base64 32)" >> .env
docker compose up -d
```

Open http://localhost:3000 and create the first account: it owns the server, and sign-ups close behind it. Data lives in `./data` (Postgres, uploaded files and the search index). Back up that folder; the search index (`./data/meili`) is rebuilt from the database if it's lost. Search runs on [Meilisearch](https://github.com/meilisearch/meilisearch) Community Edition (MIT).

A self-hosted server is private: searching needs an account, and there's no landing page, just sign-in. The hosted version (`DEPLOYMENT=cloud`) opens search to everyone and shows what the app does under the search bar.

| Variable | Default | Notes |
|---|---|---|
| `AUTH_SECRET` | required | Long random string. Keep it secret and don't change it. |
| `MEILI_MASTER_KEY` | required | Long random string; the app and the search service share it. |
| `CATALOG_PACK` | none | The catalog to load: a file path, or a URL to download, usually the hub's `/catalog/latest.jsonl.gz`. Loaded only when it changes. |
| `CATALOG_PACK_SHA256` | none | The catalog's SHA-256; a download that doesn't match is refused. Without it, a hub's published hash (`<url>.sha256`) is checked. |
| `CATALOG_REFRESH_HOURS` | `6` | How often a catalog served from a URL is checked for a new build (`0`: only at start). |
| `PUBLIC_URL` | `http://localhost:3000` | The URL you open the app at. Must match, or sign-in fails. |
| `PORT` | `3000` | Port on the host. |
| `SIGNUPS_ENABLED` | `false` | Set to `true` to let anyone create an account. The first account can always be created. |
| `PUBLIC_SEARCH` | `false` | Set to `true` to let signed-out visitors search and open products, using your store keys. Each address gets 30 searches a minute. |
| `SERVER_NAME` | `skeleton` | Shown on the sign-in screen. |
| `TRUST_PROXY` | `false` | Set to `true` if a reverse proxy (Caddy, nginx, Traefik) sits in front of the app, so sign-in rate limits apply per visitor. Leave `false` if the app is reached directly. |
| `POSTGRES_PASSWORD` | `skeleton` | Database password (internal to the stack). |

### Stores to search

Pasting a product link always works. Searching by name needs at least one source. The easiest way is in the app: the first account is the server's owner, and **Settings → Stores** adds Shopify shops by address and takes eBay and Best Buy keys (stored encrypted with `AUTH_SECRET`; changes apply without a restart). [docs/STORE-KEYS.md](docs/STORE-KEYS.md) walks through getting the keys. The variables below do the same from the environment; anything set there shows as read-only in the app.

| Variable | What it adds | How to get it |
|---|---|---|
| `SHOPIFY_STORES` | Indie and secondhand shops on Shopify | Comma-separated domains. Add `\|used` for secondhand shops and `\|name=Shop Name` to label them, e.g. `shop.example.com\|used\|name=Second Spin` |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay: new, used and refurbished | Free developer account at developer.ebay.com → create a production app keyset |
| `BESTBUY_API_KEY` | Best Buy | Free key at developer.bestbuy.com |

Store logos are read from each store's own site. When a site has none the server can read, it asks Google's favicon service, which only sees the store's domain. Set `STORE_ICON_FALLBACK=none` to keep every request on the store itself; those stores then show their initial.

### Optional search interpretation

AI interpretation is an experiment, disabled by default. Keyword search and manual
filters need no AI provider. See [search interpretation](docs/SEARCH-INTENT.md)
for configuration, limits and evaluation before enabling it.

### Alerts

Saved searches re-run and tracked prices are checked every `ALERTS_INTERVAL_MINUTES` (default 360; `0` turns it off). Each person picks where alerts go under **Settings → Notifications**:

- **Phone, with [ntfy](https://ntfy.sh):** paste a topic link (`https://ntfy.sh/<topic>` or your own ntfy server). Alerts arrive as they're found. To reach an ntfy server on your own network, set `ALLOW_PRIVATE_FETCH=true`.
- **Morning email:** one digest a day at `DIGEST_HOUR` (default 8) in each person's time zone, only when there's something new. Needs the server to send email:

| Variable | Notes |
|---|---|
| `EMAIL_FROM` | Sender, e.g. `skeleton <alerts@example.com>` |
| `SMTP_URL` | `smtp://user:pass@host:587` (or `smtps://…:465`) |
| `RESEND_API_KEY` | Instead of SMTP: a [Resend](https://resend.com) key. Use this where outbound SMTP is blocked, as on some Railway plans. |

## Develop

Requirements: Node 22+, pnpm 10 (`corepack enable`), Postgres 16 with the pgvector extension (`pgvector/pgvector:pg16` in Docker, or your distro's `postgresql-16-pgvector`), and Meilisearch (the `docker run` line in `.env.example`).

```sh
pnpm install
cp .env.example .env        # then set AUTH_SECRET
pnpm db:migrate
pnpm dev                    # web on :5173, API on :3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Run web and server with reload |
| `pnpm test` | Server tests (needs Postgres and Meilisearch; uses `TEST_DATABASE_URL` or `skeleton_test`, and `TEST_MEILI_URL`/`TEST_MEILI_MASTER_KEY` or `localhost:7700` with the key in `test/helpers/setup.ts`) |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production builds |
| `pnpm db:generate` | Create a migration after changing `packages/db/src/schema` |

Build the Docker image locally with `docker build -f docker/Dockerfile -t skeleton .`.

### Layout

```
apps/server     Hono API, auth, (later) MCP and jobs. Serves the web build in production.
apps/web        React + Vite + Tailwind
apps/hub        The shared catalog: sources, crawls, annotations, jobs, curators, catalog builds
packages/engine Reading sites: safe fetch, robots.txt, polite pace, platform readers, recipes, benchmark
packages/formats Versioned contracts between the hub and the app
packages/db     Drizzle schema and migrations (applied automatically on server start)
packages/hub-db The hub's schema and migrations
packages/shared Types and zod schemas shared by server and clients
docker/         Dockerfile and entrypoint
```
