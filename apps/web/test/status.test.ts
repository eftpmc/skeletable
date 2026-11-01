import { expect, it } from "vitest";
import type { Cell, FoundCell } from "@skeleton/tables/format";
import { cellStatus, statusCounts, type PublishedTable } from "../src/lib/status";

const found: FoundCell = { value: 5, source: "https://a.example", kind: "first-hand", quote: "Weighs 5 g", read: "2026-10-31" };
const missing: Cell = { missing: true, checked: ["https://a.example"], read: "2026-10-31" };
const watch = (status: "found" | "not-on-page") => ({ slug: "demo", ran: "2026-11-01", cells: { "One/weight": { status } } });

it("ranks a cell by how far it can be trusted", () => {
  expect(cellStatus(found, "One", "weight")).toBe("once");
  expect(cellStatus({ ...found, confirmed: "summary" }, "One", "weight")).toBe("summary");
  expect(cellStatus({ ...found, confirmed: "blind-read" }, "One", "weight")).toBe("confirmed");
  expect(cellStatus(missing, "One", "weight")).toBe("gap");
});

it("tells an unread cell from a searched one and from a source with no value", () => {
  expect(cellStatus({ missing: true, checked: [], read: "2026-10-31" }, "One", "weight")).toBe("blank");
  expect(cellStatus({ ...missing, missing: true, checked: ["https://a.example"], read: "2026-10-31", absent: true }, "One", "weight")).toBe("none");
});

it("lets a vanished quote outrank a confirmation", () => {
  expect(cellStatus({ ...found, confirmed: "blind-read" }, "One", "weight", watch("not-on-page"))).toBe("gone");
  expect(cellStatus({ ...found, confirmed: "blind-read" }, "One", "weight", watch("found"))).toBe("confirmed");
});

it("lets a conflict outrank everything", () => {
  expect(cellStatus({ ...found, confirmed: "blind-read", conflicts: [found] }, "One", "weight", watch("not-on-page"))).toBe("fracture");
});

it("counts a table's cells by status", () => {
  const table = {
    columns: [{ id: "weight", label: "Weight", type: "number", rule: "Stated." }],
    rows: [
      { key: "One", cells: { weight: found } },
      { key: "Two", cells: { weight: { ...found, confirmed: "blind-read" } } },
      { key: "Three", cells: { weight: missing } },
    ],
  } as unknown as PublishedTable;
  expect(Object.fromEntries(statusCounts(table))).toEqual({ once: 1, confirmed: 1, gap: 1 });
});
