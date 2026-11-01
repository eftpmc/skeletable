import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { findCell, searchTables, summarize, tableValues, type PublishedTable } from "./library.js";
import type { ProposalInput } from "./proposals.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const instructions =
  "Skeletable is a library of tables where every value links to the source that states it. Use list_tables to find a table, " +
  "get_table to read it, and get_cell for a value's source and exact quote. A null value means no acceptable source stated it: " +
  "say it's unknown rather than filling it in. Check a table's scope and lastRead before relying on it, and cite the source when you use a value.";

export type Propose = (input: ProposalInput) => Promise<{ id: string; check: string } | { error: string }>;

/** The library as MCP tools for anyone's agent. It only gets the tables this caller may read. Reading public tables needs no account, and proposing needs a token. */
export function tablesMcpServer(tables: PublishedTable[], propose?: Propose) {
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
        "The evidence for one value: the source, the exact quote, what kind of source it is and when it was read. For a missing value, where we looked. " +
        "`confirmed` says how a second reader backed it up, and without it the value has been read once. `conflicts` lists sources that state something else, `history` lists past values, and `watch` says whether the quote was still on its page at the last check.",
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
      const found = findCell(table, row, column);
      return found ? text(found) : refuse(`${slug} has no cell at row "${row}", column "${column}". Use get_table for its rows and columns.`);
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

  return server;
}

/** Answer one MCP request statelessly: a fresh server and transport per request, so nothing carries between callers. */
export async function handleMcp(tables: PublishedTable[], request: Request, propose?: Propose): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await tablesMcpServer(tables, propose).connect(transport);
  return transport.handleRequest(request);
}
