# Hub

The hub builds Skeleton's shared catalog. It finds sites, reads them politely, keeps what they showed (readings), collects what people and models conclude about them (annotations), and publishes the catalog file every app loads. It holds no data about the app's users.

Design: [catalog engine design](https://claude.ai/artifact/RhEhZpD1mUcTTkjGwZ3Ckt).

## Parts

| Where | What |
| --- | --- |
| `packages/hub-db` | The hub's database: sources and their assigned readers, recipes, crawls, listings, readings, annotations, final values, embeddings, jobs, catalog builds |
| `packages/formats` | The formats everything agrees on: readings, field values, jobs, the catalog file |
| `packages/engine` | Reading sites safely: the fetcher, robots.txt and sitemaps, store states, recipes, one reader per kind of site |
| `src/engine` | The crawl engine around every reader: robots.txt, one request at a time with a pause, readings stored only when something changed, listings marked gone, a site paused when a crawl finds far less than before |
| `src/lab` | A one-time import of what the brand lab already read |
| `src/api.ts`, `src/mcp.ts` | The contributor API and the same work as MCP tools, both behind a contributor's token |
| `src/roles.ts` | Roles: contributors' answers count when copies agree; curators (applied for, approved by the owner) correct directly |
| `embed/` | Photo vectors (`photos.py`) and a photo classifier scored on a benchmark (`probe.py`) |

## Contributing compute

Anyone the owner issues a token (`hub token <handle> <worker|agent|person>`) can help:

- **A GPU:** `HUB_TOKEN=… hub work https://hub.example qwen3:8b` answers jobs with a local Ollama model.
- **An agent on their own subscription:** connect it to `https://hub.example/mcp` (Streamable HTTP) with the header `Authorization: Bearer <token>`. For Claude Code: `claude mcp add --transport http skeleton-hub https://hub.example/mcp --header "Authorization: Bearer <token>"`. Its tools: `whoami`, `claim_job`, `submit_answer`, `propose_site`.

Every answer is checked against the job's format, and counts only as far as the contributor's role and the agreement of other copies allow.

## Commands

Set `HUB_DATABASE_URL` (a Postgres database of its own, e.g. `postgres://postgres:postgres@localhost:5432/hub`). Each command applies pending migrations first.

```bash
pnpm --filter @skeleton/hub hub add https://maker.example       # add a site, detect its reader
pnpm --filter @skeleton/hub hub crawl maker.example             # crawl one site now
pnpm --filter @skeleton/hub hub crawl --due 10                  # crawl approved sites that are due
pnpm --filter @skeleton/hub hub import-lab <products dir> [vectors.npz]
pnpm --filter @skeleton/hub hub status
```

Tests use `HUB_TEST_DATABASE_URL` (default `…/hub_test`).
