import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Table } from "@skeleton/tables/format";
import { z } from "zod";
import { findCell, searchTables, summarize, tableValues } from "./library.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const instructions =
  "Skeleton is a library of tables where every value links to the source that states it. Use list_tables to find a table, " +
  "get_table to read it, and get_cell for a value's source and exact quote. A null value means no acceptable source stated it: " +
  "say it's unknown rather than filling it in. Check a table's scope and lastRead before relying on it, and cite the source when you use a value.";

/** The library as read-only MCP tools, for anyone's agent. */
export function tablesMcpServer(tables: Table[]) {
  const server = new McpServer({ name: "skeleton", version: "1.0.0" }, { instructions });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const bySlug = (slug: string) => tables.find((table) => table.slug === slug);

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
      description: "The evidence for one value: the source, the exact quote, what kind of source it is and when it was read. For a missing value, where we looked.",
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

  return server;
}

/** Answer one MCP request statelessly: a fresh server and transport per request, since the tables never change while running. */
export async function handleMcp(tables: Table[], request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await tablesMcpServer(tables).connect(transport);
  return transport.handleRequest(request);
}
