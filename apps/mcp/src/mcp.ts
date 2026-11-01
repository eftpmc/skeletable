import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { checkClaim, findCell, searchTables, summarize, tableValues, type PublishedTable } from "./library.js";
import { MAX_CELLS_PER_CALL, type AgentActions } from "./agents.js";
import type { ProposalInput } from "./proposals.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const instructions =
  "Skeletable is a library of tables where every value links to the source that states it. Use list_tables to find a table, " +
  "get_table to read it, get_cell for a value's source and exact quote, and check_claim to test a statement against a cell. A null value means no acceptable source stated it: " +
  "say it's unknown rather than filling it in. Check a table's scope and lastRead before relying on it. When you use a value, cite the source and give the cell's `url`, so a reader can see the proof. " +
  "With a token you can build a table: create_table makes a private draft, and fill_cells adds values with their proof. Use the owner's own pages, copy each quote word for word, never get around a block, and say where you looked when no source states a value. A person reviews and publishes a draft.";

export type Propose = (input: ProposalInput) => Promise<{ id: string; check: string } | { error: string }>;

/** The library as MCP tools for anyone's agent. It only gets the tables this caller may read. Reading public tables needs no account, and proposing needs a token. */
export function tablesMcpServer(tables: PublishedTable[], publicUrl: string, propose?: Propose, agent?: AgentActions | null) {
  const server = new McpServer({ name: "skeletable", version: "1.0.0" }, { instructions });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  // An agent with a token can see more than one table of the same name, so "owner/slug" picks one.
  const bySlug = (slug: string) => tables.find((table) => `${table.owner}/${table.slug}` === slug) ?? tables.find((table) => table.slug === slug);

  server.registerTool(
    "list_tables",
    {
      description: "Find tables in the library. Each result gives its slug, the question it answers, its size and when it was last read.",
      inputSchema: { query: z.string().trim().max(200).optional().describe("Words to look for in titles, questions, columns and rows. Leave out to list everything.") },
      annotations: readOnly,
    },
    async ({ query }) => text(searchTables(tables, query).map(summarize)),
  );

  server.registerTool(
    "get_table",
    {
      description: "Read a table: its scope, its columns with the rule for each, and its rows. A null value means no acceptable source stated it.",
      inputSchema: { slug: z.string().max(120).describe("From list_tables") },
      annotations: readOnly,
    },
    async ({ slug }) => {
      const table = bySlug(slug);
      return table ? text(tableValues(table)) : refuse(`No table called ${slug}. Use list_tables to see what exists.`);
    },
  );

  server.registerTool(
    "get_cell",
    {
      description:
        "The evidence for one value: the source, the exact quote, what kind of source it is and when it was read. For a missing value, where we looked, and `absent` means the source was read and gives no such value. " +
        "`url` is the cell's lasting address, showing its proof, for citing. `confirmed` says how a second reader backed it up, and without it the value has been read once. `conflicts` lists sources that state something else, `history` lists past values, and `watch` says whether the quote was still on its page at the last check.",
      inputSchema: {
        slug: z.string().max(120).describe("From list_tables"),
        row: z.string().max(200).describe("The row's key, from get_table"),
        column: z.string().max(80).describe("The column's id, from get_table"),
      },
      annotations: readOnly,
    },
    async ({ slug, row, column }) => {
      const table = bySlug(slug);
      if (!table) return refuse(`No table called ${slug}. Use list_tables to see what exists.`);
      const found = findCell(table, row, column, publicUrl);
      return found ? text(found) : refuse(`${slug} has no cell at row "${row}", column "${column}". Use get_table for its rows and columns.`);
    },
  );

  server.registerTool(
    "check_claim",
    {
      description:
        "Test a statement against one cell, such as whether a value in a draft or an answer is right. The verdict is `matches`, `differs` (with what the source states), `disputed` (sources disagree, see `conflicts`) or `unknown` (no acceptable source stated it, so say so). " +
        "It compares values and doesn't judge meaning, so read the quote before relying on a text verdict. Use list_tables and get_table to find the cell first.",
      inputSchema: {
        slug: z.string().max(120).describe("From list_tables"),
        row: z.string().max(200).describe("The row's key, from get_table"),
        column: z.string().max(80).describe("The column's id, from get_table"),
        value: z.string().max(300).describe("The value being claimed"),
      },
      annotations: readOnly,
    },
    async ({ slug, row, column, value }) => {
      const table = bySlug(slug);
      if (!table) return refuse(`No table called ${slug}. Use list_tables to see what exists.`);
      const checked = checkClaim(table, row, column, value, publicUrl);
      return checked ? text(checked) : refuse(`${slug} has no cell at row "${row}", column "${column}". Use get_table for its rows and columns.`);
    },
  );

  if (propose) {
    server.registerTool(
      "propose_change",
      {
        description:
          "Suggest a new value for a cell, with its proof. The quote must be word for word from the source and state the value. The owner reviews it before anything changes. Needs a token sent as a Bearer token.",
        inputSchema: {
          slug: z.string().max(120).describe("From list_tables"),
          row: z.string().max(200).describe("The row's exact key, from get_table"),
          column: z.string().max(80).describe("The column's id, from get_table"),
          value: z.string().max(300).describe("The new value, following the column's rule"),
          source: z.string().url().max(2000).describe("The page that states it"),
          quote: z.string().max(400).describe("The exact words on that page"),
          note: z.string().max(500).optional().describe("Why this should change"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async ({ slug, ...input }) => {
        const table = bySlug(slug);
        if (!table) return refuse(`No table called ${slug}. Use list_tables to see what exists.`);
        const result = await propose({ ...input, owner: table.owner, slug: table.slug });
        return "error" in result ? refuse(result.error) : text({ proposed: true, ...result });
      },
    );
  }

  // Listed even without a token, so an agent can tell its person what it needs.
  if (agent !== undefined) {
    const withToken = <T,>(run: (actions: AgentActions) => Promise<T | { error: string }>) =>
      agent ? run(agent).then((result) => (result && typeof result === "object" && "error" in result ? refuse(result.error) : text(result))) : Promise.resolve(refuse("Building tables needs a token. Create one in Skeletable under Settings, and send it as a Bearer token."));
    const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

    server.registerTool(
      "create_table",
      {
        description: "Make a private draft table, ready to fill. Only `title`, `columns` and `rows` are needed now, but give `question`, `scope`, and a `rule` for each column if you can: a person has to supply them before publishing. Returns the column ids fill_cells needs, and the sheet's link, so tell your person to open it and watch it fill. Needs a token.",
        inputSchema: {
          title: z.string().max(120),
          question: z.string().max(300).optional().describe("The question the table answers"),
          topic: z.string().max(40).optional().describe("A broad subject, like Law or Consumer tech"),
          scope: z.string().max(800).optional().describe("What belongs in the table and what doesn't"),
          owner: z.string().max(60).optional().describe("A team you're on. Leave out for your own account"),
          columns: z.array(z.object({ label: z.string().max(80), type: z.enum(["text", "number", "boolean"]), unit: z.string().max(30).optional(), rule: z.string().max(500).optional().describe("What counts as this value, so two readers would fill it in the same way") })).min(1).max(20),
          rows: z.array(z.string().max(120)).min(1).max(200),
        },
        annotations: writes,
      },
      (input) => withToken((actions) => actions.create(input)),
    );

    server.registerTool(
      "add_columns",
      {
        description: "Add columns to a draft you run, such as a blank one a person started. Returns the new column ids for fill_cells. Needs a token.",
        inputSchema: {
          slug: z.string().max(120),
          columns: z.array(z.object({ label: z.string().max(80), type: z.enum(["text", "number", "boolean"]), unit: z.string().max(30).optional(), rule: z.string().max(500).optional().describe("What counts as this value, so two readers would fill it in the same way") })).min(1).max(20),
        },
        annotations: writes,
      },
      ({ slug, columns }) => withToken((actions) => actions.addColumns(slug, columns)),
    );

    server.registerTool(
      "add_rows",
      {
        description: "Add rows to a draft you run, as you find what belongs in it. A name it already has is skipped. Needs a token.",
        inputSchema: { slug: z.string().max(120), rows: z.array(z.string().max(120)).min(1).max(200) },
        annotations: writes,
      },
      ({ slug, rows }) => withToken((actions) => actions.addRows(slug, rows)),
    );

    server.registerTool(
      "fill_cells",
      {
        description:
          `Fill up to ${MAX_CELLS_PER_CALL} cells of a draft you run. Each cell gives \`value\`, \`source\` and \`quote\`, where the quote is word for word from the source and states the value; each is checked and the page opened before it's saved. ` +
          "If no acceptable source states it, give `checked` with the pages you read instead of a value, and add `none_stated` only if you read the whole source and it has no such value. Bad cells come back with a reason and don't stop the rest. Needs a token.",
        inputSchema: {
          slug: z.string().max(120).describe("From create_table or list_tables"),
          cells: z.array(z.object({
            row: z.string().max(200),
            column: z.string().max(80).describe("The column's id, from get_table"),
            value: z.string().max(300).optional(),
            source: z.string().max(2000).optional(),
            quote: z.string().max(400).optional(),
            checked: z.array(z.string().max(2000)).max(10).optional(),
            none_stated: z.boolean().optional(),
          })).min(1).max(MAX_CELLS_PER_CALL),
        },
        annotations: writes,
      },
      ({ slug, cells }) => withToken((actions) => actions.fill(slug, cells)),
    );
  }

  return server;
}

/** Answer one MCP request statelessly: a fresh server and transport per request, so nothing carries between callers. */
export async function handleMcp(tables: PublishedTable[], publicUrl: string, request: Request, propose?: Propose, agent?: AgentActions | null): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await tablesMcpServer(tables, publicUrl, propose, agent).connect(transport);
  return transport.handleRequest(request);
}
