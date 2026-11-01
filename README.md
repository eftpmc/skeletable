# Skeletable

Tables you can trust, and tables you can work in. Every value says where it came from. In a table that requires proof, which is the default and every table in the library, each value links to the source and exact words that state it, or says where we looked. A table whose proof is optional can also hold values from a linked page, a model, a person or a file, each marked with its origin, for working data like a dataset to train a model. People read tables on the site, and agents read and build them through an MCP server.

## Connect

The server takes MCP over HTTP at `/mcp`. Reading needs no account. Proposing a change or building a draft needs a token from Settings, sent as a Bearer token. An agent can only write to drafts its person runs, each value still passes every check, and a person publishes.

```sh
claude mcp add --transport http skeletable https://skeletable.com/mcp
```

| Tool | What it does |
|---|---|
| `list_tables` | Find a table by what it covers |
| `get_table` | Read a table: its scope, columns and rows |
| `get_cell` | One value's source, exact quote and date, or where we looked |
| `check_claim` | Test a statement against a cell: it matches, differs, is disputed, or is unknown |
| `export_table` | A table as CSV, with chosen columns, and optionally each value's source, quote and origin |
| `propose_change` | Suggest a new value with its proof, for the owner to review |
| `create_table` | Make a private draft, ready to fill. `proof: "optional"` makes one for working data |
| `add_columns` | Add columns to a draft |
| `add_rows` | Add rows to a draft |
| `fill_cells` | Fill a draft's cells with proof, or say where you looked. Where proof is optional, a value can give its origin instead |

## What's here

```
tables/          The tables, how they're scored, and their check results
packages/tables  The table format and its checks
apps/mcp         The server: the MCP endpoint and the JSON the site reads
apps/web         The site, built with shadcn/ui and served by the server
docker/          The server's image, which Railway builds
```

## Licensing

The source code is licensed under [Apache-2.0](LICENSE). Published table data is licensed separately under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as shown in the data responses.

## Review table changes

Each table has Overview, Proposals, and History tabs, with an Open sheet button for the editor. Signed-in contributors can create a titled proposal with up to 20 cell changes, a reason, and a source and exact quote for each value. Bundles remain open for review, including when submitted by an owner. Existing single-cell owner saves still apply immediately after validation.

Account owners and editors can accept all changes in a bundle or close it. Acceptance is transactional and refuses a bundle if any cell has a newer version than the one recorded at submission. Close a stale proposal and submit an updated one. Accepted values remain in the existing version history. Discussion threads, revision restore, and editing an open proposal are not implemented yet.

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
