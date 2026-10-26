# Working name TBD

One search for every store: new, used and refurbished, with price verdicts and alerts. Use the cloud or host it yourself.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the product and architecture plan.

## Self-host

Requirements: Docker with Compose.

```sh
curl -O https://raw.githubusercontent.com/eftpmc/skeleton/main/docker-compose.yml
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
docker compose up -d
```

Open http://localhost:3000 and create an account. Data lives in `./data` (Postgres and uploaded files). Back up that folder.

| Variable | Default | Notes |
|---|---|---|
| `AUTH_SECRET` | required | Long random string. Keep it secret and don't change it. |
| `PUBLIC_URL` | `http://localhost:3000` | The URL you open the app at. Must match, or sign-in fails. |
| `PORT` | `3000` | Port on the host. |
| `SIGNUPS_ENABLED` | `true` | Set to `false` after creating your accounts. |
| `SERVER_NAME` | `Closet` | Shown on the sign-in screen. |
| `TRUST_PROXY` | `false` | Set to `true` if a reverse proxy (Caddy, nginx, Traefik) sits in front of the app, so sign-in rate limits apply per visitor. Leave `false` if the app is reached directly. |
| `POSTGRES_PASSWORD` | `closet` | Database password (internal to the stack). |

### Stores to search

Pasting a product link always works. Searching by name needs at least one source:

| Variable | What it adds | How to get it |
|---|---|---|
| `SHOPIFY_STORES` | Indie and secondhand shops on Shopify | Comma-separated domains. Add `\|used` for secondhand shops and `\|name=Shop Name` to label them, e.g. `shop.example.com\|used\|name=Second Spin` |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay: new, used and refurbished | Free developer account at developer.ebay.com → create a production app keyset |
| `BESTBUY_API_KEY` | Best Buy | Free key at developer.bestbuy.com |

Store logos are read from each store's own site. When a site has none the server can read, it asks Google's favicon service, which only sees the store's domain. Set `STORE_ICON_FALLBACK=none` to keep every request on the store itself; those stores then show their initial.

## Develop

Requirements: Node 22+, pnpm 10 (`corepack enable`), and Postgres 16 with the pgvector extension (`pgvector/pgvector:pg16` in Docker, or your distro's `postgresql-16-pgvector`).

```sh
pnpm install
cp .env.example .env        # then set AUTH_SECRET
pnpm db:migrate
pnpm dev                    # web on :5173, API on :3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Run web and server with reload |
| `pnpm test` | Server tests (needs Postgres; uses `TEST_DATABASE_URL` or `closet_test` locally) |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production builds |
| `pnpm db:generate` | Create a migration after changing `packages/db/src/schema` |

Build the Docker image locally with `docker build -f docker/Dockerfile -t closet .`.

### Layout

```
apps/server     Hono API, auth, (later) MCP and jobs. Serves the web build in production.
apps/web        React + Vite + Tailwind
packages/db     Drizzle schema and migrations (applied automatically on server start)
packages/shared Types and zod schemas shared by server and clients
docker/         Dockerfile and entrypoint
```
