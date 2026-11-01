import { expect, it } from "vitest";
import type { Cell } from "@skeleton/tables/format";
import { tableCsv, tableJson } from "../src/lib/export";
import type { PublishedTable } from "../src/lib/status";

const found = (value: number | string, quote = String(value)): Cell => ({ value, source: "https://a.example/x", kind: "first-hand", quote, read: "2026-11-01" });
const missing: Cell = { missing: true, checked: [], read: "2026-11-01" };

const table = {
  owner: "pat",
  slug: "demo",
  title: "Demo",
  columns: [{ id: "weight", label: "Weight", type: "number", unit: "g", rule: "Stated." }, { id: "note", label: "Note", type: "text", rule: "Stated." }],
  rows: [
    { key: "Alpha, the first", cells: { weight: found(20), note: found('Says "hi"', "Says hi") } },
    { key: "Beta", cells: { weight: missing, note: found("=HYPERLINK(1)") } },
  ],
  watch: { slug: "demo", ran: "2026-11-01", cells: {} },
  managed: true,
} as unknown as PublishedTable;

it("writes values, quoting what needs it and leaving blanks empty", () => {
  expect(tableCsv(table, false).split("\r\n")).toEqual(["Name,Weight (g),Note", '"Alpha, the first",20,"Says ""hi"""', "Beta,,'=HYPERLINK(1)"]);
});

it("adds each value's source and quote on request", () => {
  const [header, first] = tableCsv(table, true).split("\r\n");
  expect(header).toBe("Name,Weight (g),Weight (g): source,Weight (g): quote,Note,Note: source,Note: quote");
  expect(first).toContain("20,https://a.example/x,20");
});

it("gives JSON the table's address and licence, without server details", () => {
  const data = JSON.parse(tableJson(table, "https://skeletable.com/pat/demo"));
  expect(data).toMatchObject({ url: "https://skeletable.com/pat/demo", licence: "CC BY 4.0", title: "Demo" });
  expect(data).not.toHaveProperty("watch");
  expect(data).not.toHaveProperty("managed");
});

it("doesn't put a public licence on a private table", () => {
  expect(JSON.parse(tableJson({ ...table, private: true }, "x"))).not.toHaveProperty("licence");
});
