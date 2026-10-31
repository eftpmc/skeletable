# skeleton

Tables you can trust. Every value links to the source that states it, or says where we looked. Agents read them through an MCP server.

## Connect

The server takes MCP over HTTP at `/mcp`, needs no account, and only reads.

```sh
claude mcp add --transport http skeleton http://localhost:4200/mcp
```

| Tool | What it does |
|---|---|
| `list_tables` | Find a table by what it covers |
| `get_table` | Read a table: its scope, columns and rows |
| `get_cell` | One value's source, exact quote and date, or where we looked |

## What's here

```
tables/          The tables, how they're scored, and their check results
packages/tables  The table format and its checks
apps/mcp         The MCP server
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
| `pnpm dev` | Run the MCP server on port 4200 |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production build |
| `pnpm tables validate <file>` | Check a table's shape, numbers and text against its quotes |
| `pnpm tables verify <file>` | Open each source and look for every quote |
| `pnpm tables sample <file>` | Draw a repeatable sample of cells for spot-checking |

Tables are JSON files in `tables/`, and the server refuses to start if one fails its checks. Adding or changing a table takes a redeploy.
