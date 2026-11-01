import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { importTables, migrate, readTables, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";

const url = process.env.TEST_DATABASE_URL;
const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

describe.skipIf(!url)("database", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
  });

  afterAll(() => sql.end());

  const firstCell = async () => {
    const [cell] = await sql`select row_id, column_id, cell from cell_versions order by id limit 1`;
    return cell!;
  };

  it("runs each migration once", async () => {
    await migrate(sql);
    expect(await sql`select version from schema_migrations`).toHaveLength(11);
  });

  it("gives back exactly what went in", async () => {
    await importTables(sql, tables);
    const byAddress = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);
    expect(await readTables(sql)).toEqual([...tables].sort(byAddress).map((table) => ({ ...table, ownerName: "Skeletable" })));
  });

  it("makes one account for all of its tables", async () => {
    await importTables(sql, tables);
    expect(await sql`select handle, name from accounts`).toEqual([{ handle: "skeletable", name: "Skeletable" }]);
  });

  it("serves the newest version of a cell and keeps the old one", async () => {
    await importTables(sql, tables);
    const { row_id, column_id, cell } = await firstCell();
    const changed = { ...cell, value: 1.5, quote: "Costs 1.5 now" };
    await sql`insert into cell_versions (row_id, column_id, cell) values (${row_id}, ${column_id}, ${sql.json(changed)})`;
    const [table] = await readTables(sql);
    expect(table!.rows[0]!.cells[column_id]).toMatchObject({ value: 1.5 });
    expect(await sql`select id from cell_versions where row_id = ${row_id} and column_id = ${column_id}`).toHaveLength(2);
  });

  it("leaves a table's cells alone when it's imported again", async () => {
    await importTables(sql, tables);
    const { row_id, column_id, cell } = await firstCell();
    await sql`insert into cell_versions (row_id, column_id, cell) values (${row_id}, ${column_id}, ${sql.json({ ...cell, value: 1.5, quote: "Costs 1.5 now" })})`;
    await importTables(sql, tables);
    expect((await readTables(sql))[0]!.rows[0]!.cells[column_id]).toMatchObject({ value: 1.5 });
  });

  const smaller = (table: (typeof tables)[number]) => ({ ...table, scope: "Just the first row.", rows: table.rows.slice(0, 1) });

  it("gives a table it already has the file's new rows and scope", async () => {
    const table = tables[0]!;
    await importTables(sql, [smaller(table)]);
    await importTables(sql, [table]);
    const [fresh] = await readTables(sql);
    expect(fresh!.rows).toEqual(table.rows);
    expect(fresh!.scope).toBe(table.scope);
  });

  it("keeps a row added on the site after the file's rows", async () => {
    const table = tables[0]!;
    await importTables(sql, [smaller(table)]);
    const [{ id: tableId }] = (await sql`select id from data_tables`) as unknown as [{ id: string }];
    const [added] = await sql`insert into table_rows (table_id, key, position) values (${tableId}, ${"Added on the site"}, ${1}) returning id`;
    for (const column of table.columns) {
      await sql`insert into cell_versions (row_id, column_id, cell) values (${added!.id}, ${column.id}, ${sql.json({ missing: true, checked: [], read: "2026-01-01" })})`;
    }
    await importTables(sql, [table]);
    const [fresh] = await readTables(sql);
    expect(fresh!.rows.map((row) => row.key)).toEqual([...table.rows.map((row) => row.key), "Added on the site"]);
  });

  it("takes a value for a blank and a newer read, and keeps both as new versions", async () => {
    const table = tables[0]!;
    const row = table.rows[0]!;
    const [first, second] = Object.entries(row.cells).filter(([, cell]) => "value" in cell);
    const older = structuredClone(table);
    older.rows[0]!.cells[first![0]] = { missing: true, checked: ["https://a.example/"], read: "2020-01-01" };
    older.rows[0]!.cells[second![0]] = { ...second![1], read: "2020-01-01" } as (typeof row.cells)[string];
    await importTables(sql, [older]);
    await importTables(sql, [table]);
    const [fresh] = await readTables(sql);
    expect(fresh!.rows[0]!.cells[first![0]]).toEqual(first![1]);
    expect(fresh!.rows[0]!.cells[second![0]]).toEqual(second![1]);
    expect(await sql`select v.id from cell_versions v join table_rows r on r.id = v.row_id where r.key = ${row.key} and v.column_id = ${first![0]}`).toHaveLength(2);
  });

  it("takes a newer watch for a table it already has", async () => {
    await importTables(sql, tables);
    const newer = { ...tables[0]!, watch: { slug: tables[0]!.slug, ran: "2030-01-01", cells: {} } };
    await importTables(sql, [newer]);
    const fresh = await readTables(sql);
    expect(fresh.find((table) => table.slug === newer.slug)!.watch?.ran).toBe("2030-01-01");
  });

  it("won't serve a cell that fails its checks", async () => {
    await importTables(sql, tables);
    const { row_id, column_id, cell } = await firstCell();
    await sql`insert into cell_versions (row_id, column_id, cell) values (${row_id}, ${column_id}, ${sql.json({ ...cell, value: 99, quote: "Costs 1.5 now" })})`;
    await expect(readTables(sql)).rejects.toThrow("isn't in its quote");
  });
});
