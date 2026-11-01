import { expect, it } from "vitest";
import type { Cell } from "@skeleton/tables/format";
import { NAME_COLUMN, matchingRows, nextSort, sortedRows } from "../src/lib/sheet";
import type { PublishedTable } from "../src/lib/status";

const found = (value: number | string): Cell => ({ value, source: "https://a.example", kind: "first-hand", quote: String(value), read: "2026-11-01" });
const missing: Cell = { missing: true, checked: [], read: "2026-11-01" };

const table = {
  columns: [{ id: "weight", label: "Weight", type: "number", rule: "Stated." }, { id: "chip", label: "Chip", type: "text", rule: "Stated." }],
  rows: [
    { key: "Beta", cells: { weight: found(20), chip: found("Zen") } },
    { key: "Alpha", cells: { weight: missing, chip: found("Intel") } },
    { key: "Gamma", cells: { weight: found(9), chip: found("Arm") } },
  ],
} as unknown as PublishedTable;

const order = (sort: Parameters<typeof sortedRows>[2]) => sortedRows(table, table.rows, sort).map((row) => row.key);

it("sorts numbers as numbers, with empty cells last both ways", () => {
  expect(order({ column: "weight", descending: false })).toEqual(["Gamma", "Beta", "Alpha"]);
  expect(order({ column: "weight", descending: true })).toEqual(["Beta", "Gamma", "Alpha"]);
});

it("sorts text and row names", () => {
  expect(order({ column: "chip", descending: false })).toEqual(["Gamma", "Alpha", "Beta"]);
  expect(order({ column: NAME_COLUMN, descending: true })).toEqual(["Gamma", "Beta", "Alpha"]);
});

it("keeps the table's order with no sort", () => {
  expect(order(null)).toEqual(["Beta", "Alpha", "Gamma"]);
});

it("finds rows by name or value, needing every word", () => {
  expect(matchingRows(table, "gamma").map((row) => row.key)).toEqual(["Gamma"]);
  expect(matchingRows(table, "ZEN").map((row) => row.key)).toEqual(["Beta"]);
  expect(matchingRows(table, "alpha zen")).toEqual([]);
  expect(matchingRows(table, "  ")).toHaveLength(3);
});

it("cycles a column's sort up, down, then off", () => {
  const up = nextSort(null, "weight");
  expect(up).toEqual({ column: "weight", descending: false });
  const down = nextSort(up, "weight");
  expect(down).toEqual({ column: "weight", descending: true });
  expect(nextSort(down, "weight")).toBeNull();
  expect(nextSort(down, "chip")).toEqual({ column: "chip", descending: false });
});
