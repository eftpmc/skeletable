import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ensureAccount } from "../src/accounts.js";
import { createApp } from "../src/app.js";
import { importTables, migrate, readTables, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";
import { createToken } from "../src/proposals.js";

const url = process.env.TEST_DATABASE_URL;
const files = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

describe.skipIf(!url)("building a table through an agent", () => {
  let sql: Sql;
  let tables: typeof files;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let opened: string[];

  const pages = async (page: string) => {
    opened.push(page);
    return { status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" };
  };
  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

  const person = async (email: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, 'Pat') returning id`;
    await ensureAccount(sql, user!.id as string, email, "Pat");
    return (await createToken(sql, user!.id as string, "Agent")).token;
  };

  const call = async (name: string, args: Record<string, unknown>, bearer = token) => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const { result } = (await response.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    return { isError: result.isError, text: result.content[0]!.text, json: () => { try { return JSON.parse(result.content[0]!.text); } catch { throw new Error(result.content[0]!.text); } } };
  };

  // A table that requires proof, which a new table only does when asked.
  const draft = { title: "Keyboards", proof: "required", columns: [{ label: "Weight", type: "number", unit: "g" }, { label: "Colour", type: "text" }], rows: ["Alpha", "Beta"] };
  const held = () => tables.find((table) => table.owner === "pat" && table.slug === "keyboards")!;

  beforeAll(() => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files);
    tables = await readTables(sql);
    opened = [];
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
    token = await person("pat@example.com");
  });

  afterAll(() => sql.end());

  it("makes a private draft, and says where to watch it", async () => {
    const created = (await call("create_table", draft)).json();
    expect(created).toEqual({ owner: "pat", slug: "keyboards", url: "https://skeletable.test/pat/keyboards/sheet", columns: [{ id: "weight", label: "Weight" }, { id: "colour", label: "Colour" }] });
    expect(held()).toMatchObject({ draft: true, private: true });
    expect((await app.request("/api/tables/pat/keyboards")).status).toBe(404);
  });

  it("won't build for anyone without a token, or on another account", async () => {
    expect((await call("create_table", draft, "wrong")).text).toContain("needs a token");
    expect((await call("create_table", { ...draft, owner: "skeletable" })).isError).toBe(true);
  });

  it("saves proved values, gives each bad cell a reason, and opens each page once", async () => {
    await call("create_table", draft);
    const source = "https://maker.example/a";
    const result = (await call("fill_cells", {
      slug: "keyboards",
      cells: [
        { row: "Alpha", column: "weight", value: "900", source, quote: "Weighs 900 g" },
        { row: "Beta", column: "weight", value: "900", source, quote: "Weighs 900 grams" },
        { row: "Beta", column: "colour", value: "Black", source, quote: "Weighs 900 g" },
        { row: "Gamma", column: "weight", value: "900", source, quote: "Weighs 900 g" },
      ],
    })).json();
    expect(result).toMatchObject({ saved: 1, of: 4 });
    expect(result.errors.map((problem: { row: string }) => problem.row)).toEqual(["Beta", "Beta", "Gamma"]);
    expect(result.errors[0].error).toContain("isn't on that page");
    expect(result.errors[1].error).toContain("exact value");
    expect(result.errors[2].error).toContain("no such cell");
    expect(result).not.toHaveProperty("results");
    expect(held().rows[0]!.cells.weight).toMatchObject({ value: 900, read: expect.any(String) });
    expect(held().rows[0]!.cells.weight).not.toHaveProperty("confirmed");
    expect(opened.filter((page) => page === source)).toHaveLength(1);
  });

  it("records where it looked, and a source with no such value", async () => {
    await call("create_table", draft);
    const checked = ["https://maker.example/a"];
    await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "weight", checked }, { row: "Beta", column: "weight", checked, none_stated: true }] });
    expect(held().rows[0]!.cells.weight).toMatchObject({ missing: true, checked });
    expect(held().rows[1]!.cells.weight).toMatchObject({ missing: true, checked, absent: true });
    expect((await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "colour" }] })).json().errors[0].error).toContain("where you looked");
  });

  it("builds out a blank sheet a person started", async () => {
    await call("create_table", draft);
    const { columns } = (await call("add_columns", { slug: "keyboards", columns: [{ label: "Switch", type: "text" }] })).json();
    expect(columns).toEqual([{ id: "switch", label: "Switch" }]);
    expect(held().rows[0]!.cells.switch).toMatchObject({ missing: true });
  });

  it("adds rows, skipping names it already has", async () => {
    await call("create_table", draft);
    expect((await call("add_rows", { slug: "keyboards", rows: ["Beta", "Gamma", "Gamma"] })).json()).toEqual({ added: 1, skipped: 2, names: ["Gamma"] });
    expect(held().rows.map((row) => row.key)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("asks for a quote in a table that requires proof", async () => {
    await call("create_table", draft);
    const result = (await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "colour", value: "Black", origin: "generated" }] })).json();
    expect(result.errors[0].error).toContain("proof optional");
    expect(held().rows[0]!.cells.colour).toMatchObject({ missing: true });
  });

  it("saves values that say where they came from, where proof is optional, without opening a page", async () => {
    const created = (await call("create_table", { ...draft, proof: "optional" })).json();
    expect(created.slug).toBe("keyboards");
    expect(held().proof).toBe("optional");
    const result = (await call("fill_cells", {
      slug: "keyboards",
      cells: [
        { row: "Alpha", column: "colour", value: "Black", origin: "generated", note: "Label each keyboard's colour" },
        { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a" },
        { row: "Beta", column: "colour", value: "White", origin: "entered" },
        { row: "Beta", column: "weight", value: "heavy" },
        { row: "Gamma", column: "colour", value: "Red" },
        { row: "Beta", column: "colour", value: "Grey", origin: "link" },
      ],
    })).json();
    expect(result).toMatchObject({ saved: 3, of: 6 });
    expect(result.errors.map((problem: { error: string }) => problem.error)).toEqual([expect.stringContaining("number"), expect.stringContaining("no such cell"), expect.stringContaining("source")]);
    expect(held().rows[0]!.cells).toMatchObject({
      colour: { value: "Black", origin: "generated", note: "Label each keyboard's colour" },
      weight: { value: 900, origin: "link", source: "https://maker.example/a" },
    });
    expect(held().rows[1]!.cells.colour).toMatchObject({ value: "White", origin: "entered" });
    expect(opened).toEqual([]);

    const values = (await call("get_table", { slug: "keyboards" })).json();
    expect(values.proof).toBe("optional");
    expect(values.rows[0]).toEqual({ key: "Alpha", values: { weight: 900, colour: "Black" }, origins: { weight: "link", colour: "generated" } });
  });

  it("never lets a value without a quote replace a quoted one", async () => {
    await call("create_table", { ...draft, proof: "optional" });
    await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" }] });
    const result = (await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "weight", value: "800", origin: "generated" }] })).json();
    expect(result.errors[0].error).toContain("quoted value");
    expect(held().rows[0]!.cells.weight).toMatchObject({ value: 900, quote: "Weighs 900 g" });
  });

  it("fills a large dataset in a few calls, and exports it as CSV", async () => {
    const rows = Array.from({ length: 300 }, (_, index) => `ex-${index}`);
    await call("create_table", { title: "Clauses", proof: "optional", columns: [{ label: "Text", type: "text" }, { label: "Label", type: "text" }], rows: rows.slice(0, 1) });
    expect((await call("add_rows", { slug: "clauses", rows: rows.slice(1) })).json()).toMatchObject({ added: 299 });
    const long = `We keep your data, "as needed", for ${"a very long time ".repeat(30)}`.trim();
    for (let start = 0; start < rows.length; start += 100) {
      const cells = rows.slice(start, start + 100).flatMap((row) => [
        { row, column: "text", value: row === "ex-0" ? long : `Sentence ${row}`, source: "https://policy.example/privacy" },
        { row, column: "label", value: "Data retention", origin: "generated" },
      ]);
      expect((await call("fill_cells", { slug: "clauses", cells })).json()).toEqual({ saved: 200, of: 200 });
    }
    const clauses = tables.find((table) => table.slug === "clauses")!;
    expect(clauses.rows).toHaveLength(300);

    const csv = (await call("export_table", { slug: "clauses", columns: ["text", "label"], names: false })).text.split("\r\n");
    expect(csv).toHaveLength(301);
    expect(csv[0]).toBe("Text,Label");
    expect(csv[1]).toBe(`"${long.replace(/"/g, '""')}",Data retention`);
    expect(csv[2]).toBe("Sentence ex-1,Data retention");
    const withProof = (await call("export_table", { slug: "clauses", columns: ["label"], proof: true })).text.split("\r\n");
    expect(withProof[0]).toBe("Name,Label,Label: source,Label: quote,Label: origin");
    expect(withProof[1]).toBe("ex-0,Data retention,,,generated");
    expect((await call("export_table", { slug: "clauses", columns: ["nope"] })).isError).toBe(true);
  });

  const dataset = { title: "Pitches", proof: "optional", columns: [{ label: "Pitch", type: "text" }, { label: "Genre", type: "text" }], rows: ["seed"] };
  const pitches = () => tables.find((table) => table.owner === "pat" && table.slug === "pitches")!;

  it("adds whole rows with their values in one call, numbering rows without a name", async () => {
    await call("create_table", dataset);
    const result = (await call("add_rows", {
      slug: "pitches",
      rows: [
        { values: { pitch: "Race lawnmowers across backyards.", Genre: "Racing" } },
        { key: "named", values: { pitch: "A ghost haunts the lift.", genre: "Horror" }, origin: "entered" },
        { values: { pitch: "Stack crates." } },
        { values: { nope: "x" } },
        "seed",
      ],
    })).json();
    expect(result).toMatchObject({ added: 3, skipped: 1, names: ["2", "named", "3"] });
    expect(result.errors).toEqual([{ row: "4", error: "nope: There's no such column." }]);
    expect(pitches().rows.map((row) => row.key)).toEqual(["seed", "2", "named", "3"]);
    expect(pitches().rows[1]!.cells).toMatchObject({ pitch: { value: "Race lawnmowers across backyards.", origin: "generated" }, genre: { value: "Racing" } });
    expect(pitches().rows[2]!.cells.genre).toMatchObject({ value: "Horror", origin: "entered" });
    expect(pitches().rows[3]!.cells.genre).toMatchObject({ missing: true });

    await call("create_table", draft);
    expect((await call("add_rows", { slug: "keyboards", rows: [{ values: { colour: "Black" } }] })).text).toContain("quote");
  });

  it("lets values without quotes into a published table whose proof is optional, but not quoted ones", async () => {
    await call("create_table", dataset);
    await sql`update data_tables set draft = false, question = 'Q', topic = 'T', scope = 'S' where slug = 'pitches'`;
    await sql`update table_columns set rule = 'R' where table_id = (select id from data_tables where slug = 'pitches')`;
    await refresh();
    expect((await call("add_rows", { slug: "pitches", rows: [{ values: { pitch: "Leap between clouds.", genre: "Platformer" } }] })).json()).toMatchObject({ added: 1 });
    expect((await call("add_rows", { slug: "pitches", rows: ["empty"] })).text).toContain("draft");
    expect((await call("fill_cells", { slug: "pitches", cells: [{ row: "seed", column: "genre", value: "Puzzle" }] })).json()).toEqual({ saved: 1, of: 1 });
    const quoted = (await call("fill_cells", { slug: "pitches", cells: [{ row: "seed", column: "pitch", value: "Weighs", source: "https://maker.example/a", quote: "Weighs 900 g" }] })).json();
    expect(quoted.errors[0].error).toContain("propose_change");
  });

  it("gives a private data link that loads in a notebook, and can be replaced", async () => {
    await call("create_table", dataset);
    await call("add_rows", { slug: "pitches", rows: [{ values: { pitch: "Race, fast", genre: "Racing" } }] });
    const link = (await call("data_link", { slug: "pitches" })).json();
    expect(link.url).toMatch(/^https:\/\/skeletable\.test\/d\/[\w-]{24}\.csv$/);
    expect(link.pandas).toBe(`pd.read_csv("${link.url}")`);
    expect((await call("data_link", { slug: "pitches" })).json().url).toBe(link.url);
    const path = new URL(link.url).pathname;
    const csv = await app.request(`${path}?columns=pitch,genre&names=0`);
    expect(csv.headers.get("cache-control")).toBe("private, no-store");
    expect(await csv.text()).toBe('Pitch,Genre\r\n,\r\n"Race, fast",Racing');
    expect((await app.request(path.replace(".csv", ".json"))).status).toBe(200);

    const fresh = (await call("data_link", { slug: "pitches", fresh: true })).json();
    expect(fresh.url).not.toBe(link.url);
    expect((await app.request(path)).status).toBe(404);
    expect((await call("data_link", { slug: "skeletable/data-breach-laws" })).text).toContain("don't run");
  });

  it("saves versions that stay put while the table changes, and says what changed", async () => {
    await call("create_table", dataset);
    await call("add_rows", { slug: "pitches", rows: [{ key: "a", values: { pitch: "One", genre: "Racing" } }] });
    expect((await call("save_version", { slug: "pitches", note: "First" })).json()).toEqual({ number: 1, url: "https://skeletable.test/pat/pitches/v/1" });
    await call("fill_cells", { slug: "pitches", cells: [{ row: "a", column: "genre", value: "Puzzle" }] });
    await call("add_rows", { slug: "pitches", rows: [{ key: "b", values: { pitch: "Two" } }] });
    expect((await call("save_version", { slug: "pitches" })).json().number).toBe(2);

    const v1 = (await call("get_table", { slug: "pitches", version: 1 })).json();
    expect(v1.version).toMatchObject({ number: 1, note: "First", rows: 2 });
    expect(v1.rows.find((row: { key: string }) => row.key === "a").values.genre).toBe("Racing");
    const v2 = (await call("get_table", { slug: "pitches", version: 2 })).json();
    expect(v2.version.changes).toEqual({ rowsAdded: 1, rowsRemoved: 0, valuesChanged: 1 });
    expect((await call("get_table", { slug: "pitches" })).json().versions).toHaveLength(2);
    expect((await call("export_table", { slug: "pitches", version: 1, columns: ["genre"], names: false })).text).toBe("Genre\r\n\r\nRacing");
    expect((await call("get_table", { slug: "pitches", version: 9 })).isError).toBe(true);

    const link = (await call("data_link", { slug: "pitches" })).json();
    const key = new URL(link.url).pathname.slice(3, -4);
    expect(await (await app.request(`/d/${key}/v1.csv?columns=genre&names=0`)).text()).toBe("Genre\r\n\r\nRacing");
    // A draft's versions aren't public.
    expect((await app.request("/data/pat/pitches/v1.csv")).status).not.toBe(200);
  });

  it("summarizes each column, so a reader sees its shape without every row", async () => {
    await call("create_table", dataset);
    await call("add_rows", { slug: "pitches", rows: ["Racing", "Racing", "Racing", "Horror"].map((genre, index) => ({ values: { pitch: `Pitch number ${index}`, genre } })) });
    const read = (await call("get_table", { slug: "pitches", limit: 0 })).json();
    expect(read.rows).toEqual([]);
    expect(read.totalRows).toBe(5);
    expect(read.summaries.genre).toEqual({ kind: "categories", filled: 4, blank: 1, origins: { generated: 4 }, values: [{ value: "Racing", count: 3 }, { value: "Horror", count: 1 }] });
    expect(read.summaries.pitch).toMatchObject({ kind: "text", filled: 4, shortest: 14, longest: 14, duplicates: 0 });
  });

  it("fills an AI column through the agent: prompts with a fingerprint, answers within the choices, never over a person's value", async () => {
    await call("create_table", { ...dataset, columns: [{ label: "Pitch", type: "text" }, { label: "Genre", type: "text", instruction: "Classify this pitch: {Pitch}", choices: ["Racing", "Horror"] }] });
    await call("add_rows", { slug: "pitches", rows: [{ key: "a", values: { pitch: "Drift at midnight." } }, { key: "b", values: { pitch: "The attic barked back." } }, { key: "c", values: { pitch: "Typed", genre: "Horror" }, origin: "entered" }] });
    const next = (await call("next_ai_cells", { slug: "pitches" })).json();
    expect(next).toMatchObject({ column: "genre", choices: ["Racing", "Horror"], remaining: 0 });
    // The seed row has no pitch yet, so it waits, and row c keeps the value a person gave it.
    expect(next.cells.map((cell: { row: string }) => cell.row)).toEqual(["a", "b"]);
    expect(next.cells[0].prompt).toBe("Classify this pitch: Drift at midnight.\nAnswer with exactly one of: Racing, Horror.");

    const [a, b] = next.cells;
    const filled = (await call("fill_ai_cells", { slug: "pitches", column: "genre", model: "test-model", answers: [{ row: "a", value: "racing.", basis: a.basis }, { row: "b", value: "Comedy", basis: b.basis }, { row: "c", value: "Racing", basis: "abc" }] })).json();
    expect(filled).toMatchObject({ saved: 1, of: 3, remaining: 1 });
    expect(filled.errors.map((problem: { row: string }) => problem.row)).toEqual(["b", "c"]);
    expect(pitches().rows.find((row) => row.key === "a")!.cells.genre).toMatchObject({ value: "Racing", origin: "generated", model: "test-model", basis: a.basis });
    expect(pitches().rows.find((row) => row.key === "c")!.cells.genre).toMatchObject({ value: "Horror", origin: "entered" });

    // Changing the pitch makes its answer out of date, and an answer to the old prompt is refused.
    await call("fill_cells", { slug: "pitches", cells: [{ row: "a", column: "pitch", value: "Drift at noon." }] });
    expect((await call("get_table", { slug: "pitches", limit: 0 })).json().ai.genre).toMatchObject({ done: 0, stale: 1, pending: 1, waiting: 1, kept: 1 });
    expect((await call("fill_ai_cells", { slug: "pitches", column: "genre", model: "m", answers: [{ row: "a", value: "Racing", basis: a.basis }] })).json().errors[0].error).toContain("changed");
    const again = (await call("next_ai_cells", { slug: "pitches", limit: 1 })).json();
    expect(again).toMatchObject({ remaining: 1, cells: [{ row: "b" }] });

    expect((await call("set_instruction", { slug: "pitches", column: "Genre", instruction: "" })).json()).toEqual({ column: "genre", cleared: true });
    expect((await call("next_ai_cells", { slug: "pitches" })).text).toContain("no AI columns");
    await call("create_table", draft);
    expect((await call("set_instruction", { slug: "keyboards", column: "colour", instruction: "Guess {Weight}" })).text).toContain("optional");
  });

  it("forks a public table, or your own, into a private draft that remembers where it came from", async () => {
    const forked = (await call("fork_table", { slug: "skeletable/data-breach-laws", title: "My breach laws" })).json();
    expect(forked).toEqual({ owner: "pat", slug: "my-breach-laws", url: "https://skeletable.test/pat/my-breach-laws/sheet" });
    const copy = tables.find((table) => table.slug === "my-breach-laws")!;
    const original = tables.find((table) => table.slug === "data-breach-laws")!;
    expect(copy).toMatchObject({ draft: true, private: true, forkedFrom: "skeletable/data-breach-laws" });
    expect(copy.rows).toEqual(original.rows);

    await call("create_table", dataset);
    const sam = await person("sam@example.com");
    expect((await call("fork_table", { slug: "pat/pitches" }, sam)).text).toContain("no table");
    expect((await call("fork_table", { slug: "pat/pitches" })).json().slug).toBe("pitches-2");
  });

  it("builds a tracker with no web page behind any value: dates, a status list and imported values", async () => {
    const statuses = ["Applied", "Interviewing", "Offer", "Rejected"];
    const created = (await call("create_table", {
      title: "Job applications",
      columns: [{ label: "Status", type: "text", choices: statuses }, { label: "Applied", type: "date" }, { label: "Next step", type: "text" }],
      rows: ["seed"],
    })).json();
    expect(created.slug).toBe("job-applications");
    const tracker = () => tables.find((table) => table.slug === "job-applications")!;
    // A new table doesn't require proof unless asked.
    expect(tracker().proof).toBe("optional");
    expect(tracker().columns[0]!.choices).toEqual(statuses);

    const added = (await call("add_rows", {
      slug: "job-applications",
      rows: [
        { key: "Acme", values: { status: "interviewing", applied: "Oct 28, 2026", "next step": "Prep for the onsite" }, origin: "imported", note: "Gmail: Interview invite from Acme, Oct 30" },
        { key: "Globex", values: { status: "Applied", applied: "10/2/2026" }, origin: "imported", note: "applications.md" },
        { key: "Initech", values: { status: "Ghosted" } },
        { key: "Hooli", values: { applied: "next week" } },
      ],
    })).json();
    expect(added).toMatchObject({ added: 2, names: ["Acme", "Globex"] });
    expect(added).not.toHaveProperty("updated");
    expect(added.errors).toEqual([
      { row: "Initech", error: "status: Status takes one of: Applied, Interviewing, Offer, Rejected." },
      { row: "Hooli", error: "applied: Give Applied as a date, like 2026-10-28." },
    ]);
    const acme = tracker().rows.find((row) => row.key === "Acme")!.cells;
    expect(acme).toMatchObject({ status: { value: "Interviewing", origin: "imported", note: "Gmail: Interview invite from Acme, Oct 30" }, applied: { value: "2026-10-28" } });
    expect(tracker().rows.find((row) => row.key === "Globex")!.cells.applied).toMatchObject({ value: "2026-10-02" });

    expect((await call("fill_cells", { slug: "job-applications", cells: [{ row: "Globex", column: "status", value: "Offer", origin: "entered" }] })).json()).toEqual({ saved: 1, of: 1 });

    // Syncing again updates the rows it already has, and adds the new ones, in one call.
    const synced = (await call("add_rows", {
      slug: "job-applications",
      rows: [
        { key: "Acme", values: { status: "Offer", "next step": "Negotiate" }, origin: "imported", note: "Gmail: 'Offer letter' from Acme, Nov 1" },
        { key: "Umbrella", values: { status: "Applied", applied: "2026-11-01" }, origin: "imported", note: "applications.md" },
        "Globex",
      ],
    })).json();
    expect(synced).toEqual({ added: 1, updated: 1, skipped: 1, names: ["Umbrella"] });
    const acmeNow = tracker().rows.find((row) => row.key === "Acme")!.cells;
    expect(acmeNow).toMatchObject({ status: { value: "Offer", note: "Gmail: 'Offer letter' from Acme, Nov 1" }, next_step: { value: "Negotiate" }, applied: { value: "2026-10-28" } });
    const summary = (await call("get_table", { slug: "job-applications", limit: 0 })).json().summaries;
    expect(summary.applied).toMatchObject({ kind: "date", earliest: "2026-10-02", latest: "2026-11-01", months: [{ month: "2026-10", count: 2 }, { month: "2026-11", count: 1 }] });

    expect((await call("create_table", { title: "Strict", proof: "required", columns: [{ label: "When", type: "date" }], rows: ["a"] })).text).toContain("optional");
  });

  it("tells agents values don't need a page behind them", async () => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
    });
    const { instructions } = ((await response.json()) as { result: { instructions: string } }).result;
    expect(instructions).toMatch(/^Skeletable holds tables for people and agents, where every value records where it came from/);
    expect(instructions).toContain("nothing needs a web page behind it");
  });

  it("can't write to a published table, or someone else's draft", async () => {
    await call("create_table", draft);
    await sql`update data_tables set draft = false, question = 'Q', topic = 'T', scope = 'S' where slug = 'keyboards'`;
    await sql`update table_columns set rule = 'R' where table_id = (select id from data_tables where slug = 'keyboards')`;
    await refresh();
    const cell = { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };
    const published = await call("fill_cells", { slug: "keyboards", cells: [cell] });
    expect(published.json().errors[0].error).toContain("propose_change");

    const other = await person("sam@example.com");
    const strangers = await call("fill_cells", { slug: "pat/keyboards", cells: [cell] }, other);
    expect(strangers.json().errors[0].error).toContain("don't run");
    const official = await call("fill_cells", { slug: "skeletable/data-breach-laws", cells: [cell] });
    expect(official.json().errors[0].error).toContain("don't run");
  });
});
