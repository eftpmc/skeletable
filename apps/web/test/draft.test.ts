import { expect, it } from "vitest";
import { columnType, gridChange, headingColumn, parsePaste } from "../src/lib/draft";

const empty = { columns: [], rows: [] };
const table = { columns: [{ id: "weight" }, { id: "colour" }], rows: [{ key: "Alpha" }, { key: "Beta" }] };

it("reads a spreadsheet's tabs and a CSV's commas", () => {
  expect(parsePaste("Name\tWeight\r\nOne\t5\r\n")).toEqual([["Name", "Weight"], ["One", "5"]]);
  expect(parsePaste('Name,Note\nOne,"a, b"')).toEqual([["Name", "Note"], ["One", "a, b"]]);
  expect(parsePaste("Just one, line")).toEqual([["Just one, line"]]);
});

it("works out a column's type, leaving anything mixed as text", () => {
  expect(columnType(["1,200", "5", ""])).toBe("number");
  expect(columnType(["Yes", "no"])).toBe("boolean");
  expect(columnType(["5", "about 6"])).toBe("text");
  expect(columnType(["", ""])).toBe("text");
});

it("reads a unit from a heading, for a number column", () => {
  expect(headingColumn("Weight (g)")).toEqual({ label: "Weight", type: "number", unit: "g" });
  expect(headingColumn("Weight (g)", ["5"])).toEqual({ label: "Weight", type: "number", unit: "g" });
  expect(headingColumn("Size (large)", ["big"])).toEqual({ label: "Size (large)", type: "text" });
  expect(headingColumn("Colour")).toEqual({ label: "Colour", type: "text" });
});

it("brings a whole sheet into a blank one, with its headings", () => {
  expect(gridChange(empty, 0, -1, "Item\tWeight (g)\tFolds\nOne\t5\tYes\nTwo\t\tNo")).toEqual({
    addColumns: [{ label: "Weight", type: "number", unit: "g", rule: "" }, { label: "Folds", type: "boolean", rule: "" }],
    addRows: ["One", "Two"],
    cells: [{ row: "One", column: "new:0", value: "5" }, { row: "One", column: "new:1", value: "Yes" }, { row: "Two", column: "new:1", value: "No" }],
  });
});

it("turns a pasted list of names into rows", () => {
  expect(gridChange(table, 2, -1, "Gamma\nDelta")).toEqual({ addColumns: [], addRows: ["Gamma", "Delta"], cells: [] });
});

it("pastes over existing cells, and grows to the right", () => {
  expect(gridChange(table, 0, 1, "red\t9\nblue\t8")).toEqual({
    addColumns: [{ label: "Column 3", type: "number", rule: "" }],
    addRows: [],
    cells: [{ row: "Alpha", column: "colour", value: "red" }, { row: "Alpha", column: "new:0", value: "9" }, { row: "Beta", column: "colour", value: "blue" }, { row: "Beta", column: "new:0", value: "8" }],
  });
});

it("keeps a row's name when a paste lands on it, and skips rows with no name", () => {
  expect(gridChange(table, 1, -1, "Other\t5").addRows).toEqual([]);
  expect(gridChange(table, 1, 0, "5\n6").cells).toEqual([{ row: "Beta", column: "weight", value: "5" }]);
});
