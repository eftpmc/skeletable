# Skeletable

Tables for people and agents, where every value records where it came from: a linked page, a person, a file or another app, or a model. Use one for a tracker, a dataset or a list. A new table works this way by default. A table can also require proof, as every table in the public library does: then each value links to the source and exact words that state it, or says where we looked. People read tables on the site, and agents read and build them through an MCP server.

## Connect

The server takes MCP over HTTP at `/mcp`. Reading needs no account. Proposing a change or building a draft needs a token from Settings, sent as a Bearer token. An agent can only write to drafts its person runs, each value still passes every check, and a person publishes.

```sh
claude mcp add --transport http skeletable https://skeletable.com/mcp
```

| Tool | What it does |
|---|---|
| `list_tables` | Find a table by what it covers |
| `get_table` | Read a table: its scope, columns, a summary of each column, and its rows, live or as a saved version |
| `get_cell` | One value's source, exact quote and date, or where we looked |
| `check_claim` | Test a statement against a cell: it matches, differs, is disputed, or is unknown |
| `export_table` | A table as CSV, live or a saved version, with chosen columns, and optionally each value's source, quote and origin |
| `propose_change` | Suggest a new value with its proof, for the owner to review |
| `create_table` | Make a private draft, ready to fill. `proof: "optional"` makes one for working data |
| `add_columns` | Add columns to a draft, including AI columns with an instruction |
| `add_rows` | Add up to 500 rows a call, each by name or with its values |
| `fill_cells` | Fill a draft's cells with proof, or say where you looked. Where proof is optional, a value can give its origin instead. Replies list only what failed |
| `data_link` | A private CSV address for a notebook, script or spreadsheet, with the lines to load it |
| `save_version` | Freeze a table as a numbered version with a link that never changes |
| `fork_table` | Copy a public table, or one you run, into your account as a private draft |
| `set_instruction` | Make a column an AI column, change its instruction, or clear it |
| `next_ai_cells` | The next prompts for a table's AI columns, each with a fingerprint |
| `fill_ai_cells` | Save the agent's answers to an AI column |

## Datasets

A table whose proof is optional is a dataset. Its values say where they came from: a linked page, a person, a file, or a model. On top of that:

- **AI columns** have an instruction, like `Classify {Pitch} as Horror, Puzzle or Racing`. The person's own agent answers it for each row through `next_ai_cells` and `fill_ai_cells`, so Skeletable never runs a model itself. Each answer records the model and a fingerprint of its prompt, so a changed row shows its answer is out of date. A value a person typed is never overwritten.
- **Versions** freeze a table with a lasting link, at `/owner/slug/v/2` and, for a public table, `/data/owner/slug/v2.csv`.
- **Column summaries** show what each column holds: categories with counts, text lengths, number ranges, and where values came from.
- **Data links** at `/d/<key>.csv` load a private table into pandas or Google Sheets. `?columns=a,b` picks columns and `?names=0` drops row names.
- **Forks** copy a public table into your account to extend or relabel, and remember where they came from.

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
