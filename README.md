# Skeletable

Tables you can trust. Every value links to the source that states it, or says where we looked. People read them on the site, and agents read them through an MCP server.

## Connect

The server takes MCP over HTTP at `/mcp`. Reading needs no account. Proposing a change needs a token from Settings, sent as a Bearer token.

```sh
claude mcp add --transport http skeletable https://skeletable.com/mcp
```

| Tool | What it does |
|---|---|
| `list_tables` | Find a table by what it covers |
| `get_table` | Read a table: its scope, columns and rows |
| `get_cell` | One value's source, exact quote and date, or where we looked |
| `check_claim` | Test a statement against a cell: it matches, differs, is disputed, or is unknown |
| `propose_change` | Suggest a new value with its proof, for the owner to review |

## What's here

```
tables/          The tables, how they're scored, and their check results
packages/tables  The table format and its checks
apps/mcp         The server: the MCP endpoint and the JSON the site reads
apps/web         The site, built with shadcn/ui and served by the server
docker/          The server's image, which Railway builds
```

## Develop

Requirements: Node 22+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm dev` | Run the server on port 4200 |
| `pnpm dev:web` | Run the site on port 5173, reading from that server |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production build |
| `pnpm tables validate <file>` | Check a table's shape, numbers and text against its quotes |
| `pnpm tables verify <file>` | Open each source and look for every quote |
| `pnpm tables watch <file>` | See whether live quotes are still on their pages, and save the result |
| `pnpm tables sample <file>` | Draw a repeatable sample of cells for spot-checking |

New tables start as JSON files in `tables/`, and the server loads them into Postgres when `DATABASE_URL` is set, or serves them directly when it isn't. It refuses to start if a table fails its checks.

Sign-in needs `DATABASE_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `PUBLIC_URL` sets the site's address, and `OWNER_EMAIL` says who runs the official account.

Database tests run when `TEST_DATABASE_URL` is set. They wipe that database.
