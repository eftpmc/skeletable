import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { checkClaim, findCell, searchTables, summarize, tableValues, type PublishedTable } from "./library.js";
import { MAX_GIVEN_TEXT, origins } from "@skeleton/tables/format";
import { tableCsv } from "@skeleton/tables/share";
import { MAX_CELLS_PER_CALL, MAX_QUOTED_PER_CALL, type AgentActions } from "./agents.js";
import type { VersionedTable } from "./versions.js";
import { templates } from "@skeleton/tables/templates";

const templateIds = templates.map((template) => template.id) as [string, ...string[]];
const templateList = templates.map((template) => `\`${template.id}\` (${template.summary.replace(/\.$/, "")})`).join(", ");
import type { ProposalInput } from "./proposals.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const instructions =
  "Skeletable holds tables for people and agents, where every value records where it came from. Use it for any table: a tracker, a dataset, a list you're building. " +
  "Most tables let a value say its origin: `link` (a page, given as `source`), `entered` (a person typed it), `imported` (from a file or another app, like a spreadsheet, notes or an email, said in `note`) or `generated` (written or labeled by a model). That's the default for a new table, so nothing needs a web page behind it. Say the origin truthfully. " +
  "Some tables, like the public library, require proof: each value quotes its source word for word, and `proof` reads `required`. There, use the owner's own pages, copy each quote exactly, never get around a block, and say where you looked when no source states a value. " +
  "To read: list_tables finds a table, get_table reads it with a summary of each column, get_cell shows one value's origin or source and quote, and check_claim tests a statement against a cell. A null value is blank: say it's unknown rather than filling it in. When you use a quoted value, cite its source and the cell's `url`. " +
  "To build (with a token): create_table makes a private draft, from scratch or from a template like a job tracker or a text dataset, add_rows adds up to 500 rows a call with their values, and fill_cells sets cells. Columns can be text, number, yes/no or date (YYYY-MM-DD), and a text column can have `choices`, like a status list. A person reviews and publishes a draft. " +
  "An AI column has an instruction naming other columns in braces, like \"Classify {Pitch}\": call next_ai_cells for prompts, answer each one yourself, and send the answers with fill_ai_cells until nothing remains. " +
  "export_table gives a table as CSV, data_link gives a private address that loads it in a notebook or spreadsheet, save_version freezes a table so a result can name exactly what it used, and fork_table copies a table into your account.";

/** Reads a table's saved version. Only a server with a database has them. */
export type LoadVersion = (table: PublishedTable, number: number) => Promise<VersionedTable | undefined>;

export type Propose = (input: ProposalInput) => Promise<{ id: string; check: string } | { error: string }>;

/** The library as MCP tools for anyone's agent. It only gets the tables this caller may read. Reading public tables needs no account, and proposing needs a token. */
export function tablesMcpServer(tables: PublishedTable[], publicUrl: string, propose?: Propose, agent?: AgentActions | null, loadVersion?: LoadVersion) {
  const server = new McpServer({ name: "skeletable", version: "1.0.0" }, { instructions });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  // An agent with a token can see more than one table of the same name, so "owner/slug" picks one.
  const bySlug = (slug: string) => tables.find((table) => `${table.owner}/${table.slug}` === slug) ?? tables.find((table) => table.slug === slug);
  const versionField = z.number().int().min(1).optional().describe("A saved version's number, from `versions` in get_table. Leave out for the live table");
  /** The live table, or one of its saved versions. */
  const pick = async (slug: string, version?: number): Promise<PublishedTable | string> => {
    const table = bySlug(slug);
    if (!table) return `No table called ${slug}. Use list_tables to see what exists.`;
    if (version === undefined) return table;
    const saved = loadVersion && (await loadVersion(table, version));
    return saved ?? `${slug} has no version ${version}. get_table lists its versions.`;
  };

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
      description:
        "Read a table: its scope, its columns with the rule for each, a summary of what each column holds, and its rows. A null value is blank. " +
        "`origins` says where a row's unquoted values came from, `ai` says how far each AI column has got, and `versions` lists saved versions. For a big table, read the summaries first and page through rows with `offset` and `limit`.",
      inputSchema: {
        slug: z.string().max(120).describe("From list_tables"),
        version: versionField,
        offset: z.number().int().min(0).optional().describe("Skip this many rows"),
        limit: z.number().int().min(0).max(1000).optional().describe("Return at most this many rows. 0 returns just the table's shape and summaries"),
      },
      annotations: readOnly,
    },
    async ({ slug, version, offset, limit }) => {
      const table = await pick(slug, version);
      return typeof table === "string" ? refuse(table) : text(tableValues(table, { offset, limit }));
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

  server.registerTool(
    "export_table",
    {
      description:
        "A table as CSV, ready to save as a file or load into a notebook. The first column is each row's name unless `names` is false. `columns` picks columns by id, in that order. " +
        "With `proof`, each column is followed by its source and quote, and in a table whose proof is optional, by where each value came from. An empty field means no value.",
      inputSchema: {
        slug: z.string().max(120).describe("From list_tables"),
        columns: z.array(z.string().max(80)).max(20).optional().describe("Column ids, from get_table. Leave out for every column"),
        names: z.boolean().optional().describe("Whether to start each line with the row's name. Defaults to true"),
        proof: z.boolean().optional().describe("Whether to add each value's source, quote and origin. Defaults to false"),
        version: versionField,
      },
      annotations: readOnly,
    },
    async ({ slug, columns, names, proof, version }) => {
      const table = await pick(slug, version);
      if (typeof table === "string") return refuse(table);
      const unknown = columns?.filter((id) => !table.columns.some((column) => column.id === id)) ?? [];
      if (unknown.length) return refuse(`${slug} has no column ${unknown.join(", ")}. Use get_table for its column ids.`);
      return { content: [{ type: "text" as const, text: tableCsv(table, proof ?? false, { columns, names }) }] };
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
    const columnsField = z.array(z.object({
      label: z.string().max(80),
      type: z.enum(["text", "number", "boolean", "date"]).describe("A date is written YYYY-MM-DD"),
      unit: z.string().max(30).optional(),
      rule: z.string().max(500).optional().describe("What counts as this value, so two readers would fill it in the same way"),
      instruction: z.string().max(1000).optional().describe("Makes it an AI column: what to work out for each row, naming other columns in braces, like \"Classify {Pitch} by genre\". Needs proof to be optional"),
      choices: z.array(z.string().max(80)).max(50).optional().describe("For a text column, the only values it takes, like a status list. An AI column answers with one of them"),
    })).min(1).max(20);
    const valueField = z.union([z.string().max(MAX_GIVEN_TEXT), z.number(), z.boolean()]);

    server.registerTool(
      "create_table",
      {
        description: "Make a private draft table, ready to fill, for anything from a tracker to a dataset. Its values say where they came from unless you set `proof` to `required`. Only `title`, `columns` and `rows` are needed now, but give `question`, `scope`, and a `rule` for each column if you can: a person has to supply them before publishing. Returns the column ids fill_cells needs, and the sheet's link, so tell your person to open it and watch it fill. Needs a token.",
        inputSchema: {
          template: z.enum(templateIds).optional().describe(`Start from a template, with its columns set up: ${templateList}. Then only \`title\` is optional`),
          title: z.string().max(120).optional().describe("Needed unless you use a template"),
          question: z.string().max(300).optional().describe("The question the table answers"),
          topic: z.string().max(40).optional().describe("A broad subject, like Law or Consumer tech"),
          scope: z.string().max(800).optional().describe("What belongs in the table and what doesn't"),
          owner: z.string().max(60).optional().describe("A team you're on. Leave out for your own account"),
          proof: z.enum(["optional", "required"]).optional().describe("`optional` (the default): each value says where it came from, like a person, a file, an email or a page. `required`: every value must quote a source word for word, for a table of public facts"),
          columns: columnsField.optional().describe("Needed unless you use a template"),
          rows: z.array(z.string().max(120)).max(500).optional().describe("Row names. To add rows with their values, use add_rows after"),
        },
        annotations: writes,
      },
      (input) => withToken(async (actions) => {
        if (!input.template && (!input.title || !input.columns?.length || !input.rows?.length)) return { error: "Give a `title`, `columns` and at least one row, or start from a `template`." };
        return actions.create(input);
      }),
    );

    server.registerTool(
      "add_columns",
      {
        description: "Add columns to a draft you run, such as a blank one a person started. Returns the new column ids for fill_cells. Needs a token.",
        inputSchema: {
          slug: z.string().max(120),
          columns: columnsField,
        },
        annotations: writes,
      },
      ({ slug, columns }) => withToken((actions) => actions.addColumns(slug, columns)),
    );

    server.registerTool(
      "add_rows",
      {
        description:
          "Add up to 500 rows to a table you run. Each row is a name, or an object with its `values` by column id or label, so a whole tracker or dataset goes in a few calls. A row without a `key` gets the next free number. A name the table already has gets the values given for it, so syncing again from the same source is one call; with no values it's skipped. " +
          "Say where the values came from with `origin` (`entered`, `imported` with a `note` naming the file or email, `link` with a `source`, or `generated`, which is the default without a source). Rows with values can go into a published table too; rows by name only into a draft. A table that requires proof takes rows by name only. Needs a token.",
        inputSchema: {
          slug: z.string().max(120),
          rows: z.array(z.union([
            z.string().max(120),
            z.object({
              key: z.string().max(120).optional(),
              values: z.record(z.string().max(80), valueField).optional(),
              origin: z.enum(origins).optional(),
              source: z.string().max(2000).optional(),
              note: z.string().max(500).optional(),
            }),
          ])).min(1).max(500),
        },
        annotations: writes,
      },
      ({ slug, rows }) => withToken((actions) => actions.addRows(slug, rows)),
    );

    server.registerTool(
      "fill_cells",
      {
        description:
          `Set up to ${MAX_CELLS_PER_CALL} cells of a table you run. Usually a cell gives \`value\` and \`origin\` (\`entered\`, \`imported\` with a \`note\` like the file or email it came from, \`link\` with its \`source\`, or \`generated\`). Left out, the origin is \`link\` when there's a \`source\` and \`generated\` when there isn't. ` +
          `These can go into a published table too, and never replace a quoted value. A date is written YYYY-MM-DD, and a column with choices takes only one of them. ` +
          `In a table that requires proof, a cell instead gives \`value\`, \`source\` and \`quote\`, word for word from the source; each page is opened before it's saved, so send at most ${MAX_QUOTED_PER_CALL} of these at once, and only into a draft. If no acceptable source states it, give \`checked\` with the pages you read, and \`none_stated\` only if you read the whole source and it has no such value. ` +
          "The reply counts what saved and lists only the cells that didn't, with a reason, and `unchecked` names quoted values whose page couldn't be read. Needs a token.",
        inputSchema: {
          slug: z.string().max(120).describe("From create_table or list_tables"),
          cells: z.array(z.object({
            row: z.string().max(200),
            column: z.string().max(80).describe("The column's id, from get_table"),
            value: z.union([z.string().max(MAX_GIVEN_TEXT), z.number(), z.boolean()]).transform((value) => String(value)).optional(),
            source: z.string().max(2000).optional(),
            quote: z.string().max(400).optional(),
            origin: z.enum(origins).optional().describe("Where a value without a quote came from. Only in a table whose proof is optional"),
            note: z.string().max(500).optional().describe("How a value without a quote was made, such as the prompt that generated it"),
            checked: z.array(z.string().max(2000)).max(10).optional(),
            none_stated: z.boolean().optional(),
          })).min(1).max(MAX_CELLS_PER_CALL),
        },
        annotations: writes,
      },
      ({ slug, cells }) => withToken((actions) => actions.fill(slug, cells)),
    );

    server.registerTool(
      "data_link",
      {
        description: "A private address that loads a table you run as CSV, for a notebook, a script or a spreadsheet, with the lines to do it. Add `?columns=a,b` to pick columns and `?names=0` to leave out row names. Anyone with the link can read the data, and `fresh` makes a new one so the old one stops working. Needs a token.",
        inputSchema: { slug: z.string().max(120), fresh: z.boolean().optional() },
        annotations: writes,
      },
      ({ slug, fresh }) => withToken((actions) => actions.dataLink(slug, fresh)),
    );

    server.registerTool(
      "save_version",
      {
        description: "Freeze a table you run as it stands now, as a numbered version with a lasting link that never changes. Do this before training on a dataset or citing a table, and name the version you used. Needs a token.",
        inputSchema: { slug: z.string().max(120), note: z.string().max(200).optional().describe("What this version is, like \"Before review\"") },
        annotations: writes,
      },
      ({ slug, note }) => withToken((actions) => actions.version(slug, note)),
    );

    server.registerTool(
      "fork_table",
      {
        description: "Copy a table into your own account as a private draft, to extend or relabel: any published public table, or one you run. Every value keeps its proof or origin, and the copy remembers where it came from. Needs a token.",
        inputSchema: {
          slug: z.string().max(120).describe("owner/slug, from list_tables"),
          title: z.string().max(120).optional().describe("A title for the copy. Defaults to the original's"),
          owner: z.string().max(60).optional().describe("A team you're on. Leave out for your own account"),
        },
        annotations: writes,
      },
      ({ slug, title, owner }) => withToken((actions) => actions.fork(slug, title, owner)),
    );

    server.registerTool(
      "set_instruction",
      {
        description: "Make a column an AI column, change its instruction, or turn it back into a plain column with an empty one. The instruction says what to work out for each row and names other columns in braces, like \"Classify {Pitch} by genre\". Its values never overwrite what a person typed, linked or quoted. Needs proof to be optional and a token.",
        inputSchema: {
          slug: z.string().max(120),
          column: z.string().max(80).describe("The column's id or label"),
          instruction: z.string().max(1000),
          choices: z.array(z.string().max(80)).max(50).optional().describe("For a text column, the only answers it takes"),
        },
        annotations: writes,
      },
      ({ slug, column, instruction, choices }) => withToken((actions) => actions.setInstruction(slug, column, instruction, choices)),
    );

    server.registerTool(
      "next_ai_cells",
      {
        description: `The next prompts to answer for a table's AI columns, up to ${MAX_CELLS_PER_CALL} at a time: blank cells first, then answers whose row or instruction has changed. Answer each prompt yourself, then send the answers back with fill_ai_cells, each with its \`row\` and \`basis\`. Repeat until it says \`done\`. \`redo\` also re-answers generated values that came from outside the instruction. Needs a token.`,
        inputSchema: {
          slug: z.string().max(120),
          column: z.string().max(80).optional().describe("One AI column's id or label. Leave out for the first one with work waiting"),
          limit: z.number().int().min(1).max(MAX_CELLS_PER_CALL).optional(),
          redo: z.boolean().optional(),
        },
        annotations: readOnly,
      },
      ({ slug, column, limit, redo }) => withToken((actions) => actions.nextAiCells(slug, column, limit, redo)),
    );

    server.registerTool(
      "fill_ai_cells",
      {
        description: `Save up to ${MAX_CELLS_PER_CALL} answers to an AI column, each with the \`row\` and \`basis\` next_ai_cells gave it. An answer outside the column's choices, or to a prompt that has since changed, comes back with a reason. Each value is saved as generated, with the instruction and \`model\`. Needs a token.`,
        inputSchema: {
          slug: z.string().max(120),
          column: z.string().max(80).describe("The AI column's id, from next_ai_cells"),
          model: z.string().max(80).describe("The model that answered, like the one you are"),
          answers: z.array(z.object({ row: z.string().max(200), value: z.string().max(MAX_GIVEN_TEXT), basis: z.string().max(32) })).min(1).max(MAX_CELLS_PER_CALL),
        },
        annotations: writes,
      },
      ({ slug, column, model, answers }) => withToken((actions) => actions.fillAiCells(slug, column, model, answers)),
    );
  }

  return server;
}

/** Answer one MCP request statelessly: a fresh server and transport per request, so nothing carries between callers. */
export async function handleMcp(tables: PublishedTable[], publicUrl: string, request: Request, propose?: Propose, agent?: AgentActions | null, loadVersion?: LoadVersion): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await tablesMcpServer(tables, publicUrl, propose, agent, loadVersion).connect(transport);
  return transport.handleRequest(request);
}
