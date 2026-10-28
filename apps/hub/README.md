# Hub

The hub builds Skeleton's shared catalog. It finds sites, reads them politely, keeps what they showed (readings), collects what people and models conclude about them (annotations), and publishes the catalog file every app loads. It holds no data about the app's users.

Design: [catalog engine design](https://claude.ai/artifact/RhEhZpD1mUcTTkjGwZ3Ckt).

## Parts

| Where | What |
| --- | --- |
| `packages/hub-db` | The hub's database: sources and their assigned readers, recipes, crawls, listings, readings, annotations, final values, embeddings, jobs, catalog builds |
| `packages/formats` | The formats everything agrees on: readings, field values, jobs, the catalog file |
| `packages/readers` | Reading sites safely: the fetcher, robots.txt and sitemaps, store states, recipes |
| `src/readers` | One reader per kind of site. Shopify so far; each site points at one |
| `src/engine` | The crawl engine around every reader: robots.txt, one request at a time with a pause, readings stored only when something changed, listings marked gone, a site paused when a crawl finds far less than before |
| `src/lab` | A one-time import of what the brand lab already read |

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
