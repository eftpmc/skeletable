# skeleton

An experiment in public, living datasets: tables built and kept current by AI, with every cell linked to the source it came from.

The direction is being tested, not settled. The first test is 10 tables on different subjects, spot-checked against a bar of about 95% correct. The earlier shopping app was removed from this branch and remains in git history on `claude/discovery`.

## What's here

```
tables/         The tables themselves, and how each is scored
packages/tables The table format and its checks
apps/hub        Sources, crawls, readings, annotations, jobs, curators, builds
packages/engine Reading sites: safe fetch, robots.txt, polite pace, readers, recipes, benchmark
packages/formats Versioned contracts for readings, field values and jobs
packages/hub-db The hub's schema and migrations
packages/shared The category taxonomy the hub still uses
docker/         The hub's image
docs/           Notes on reading sites and on the old catalog
```

The hub still reflects its shopping origin: its taxonomy and annotation rules are about clothing. See [`apps/hub/README.md`](apps/hub/README.md).

## Develop

Requirements: Node 22+, pnpm 10 (`corepack enable`), Postgres 16 with pgvector (`pgvector/pgvector:pg16` in Docker).

```sh
pnpm install
cp .env.example .env
```

| Command | What it does |
|---|---|
| `pnpm test` | Run tests (the hub needs Postgres, via `HUB_TEST_DATABASE_URL`) |
| `pnpm lint` | Lint |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production builds |
