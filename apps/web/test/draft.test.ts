import { expect, it } from "vitest";
import { blankDraft, columnType, draftBody, parsePaste, pasteInto } from "../src/lib/draft";

it("reads a spreadsheet's tabs and a CSV's commas", () => {
  expect(parsePaste("Name\tWeight\r\nOne\t5\r\n")).toEqual([["Name", "Weight"], ["One", "5"]]);
  expect(parsePaste('Name,Note\nOne,"a, b"')).toEqual([["Name", "Note"], ["One", "a, b"]]);
  expect(parsePaste("Just one, line")).toEqual([["Just one, line"]]);
});

it("grows a draft to fit a paste and keeps the Name heading", () => {
  const pasted = pasteInto(blankDraft(), "Item\tA\tB\tC\tD\nOne\t1\t2\t3\t4", 0, 0);
  expect(pasted[0]).toEqual(["Name", "A", "B", "C", "D"]);
  expect(pasted[1]).toEqual(["One", "1", "2", "3", "4"]);
});

it("works out a column's type, leaving anything mixed as text", () => {
  expect(columnType(["1,200", "5", ""])).toBe("number");
  expect(columnType(["Yes", "no"])).toBe("boolean");
  expect(columnType(["5", "about 6"])).toBe("text");
  expect(columnType(["", ""])).toBe("text");
});

it("splits a unit out of a number column's heading", () => {
  const body = draftBody([["Name", "Weight (g)", "Size (large)"], ["One", "5", "big"], ["", "", ""]]);
  expect(body).toEqual({
    columns: [{ label: "Weight", type: "number", unit: "g" }, { label: "Size (large)", type: "text" }],
    rows: ["One"],
    values: [["5", "big"]],
  });
});

it("says what's stopping a draft", () => {
  expect(draftBody([["Name", "A"], ["", ""]])).toEqual({ error: "Add at least one row." });
  expect(draftBody([["Name", "A"], ["", "1"]])).toEqual({ error: "Row 1 needs a name." });
  expect(draftBody([["Name", ""], ["One", "1"]])).toEqual({ error: "Column 2 needs a heading." });
  expect(draftBody([["Name", ""], ["One", ""]])).toEqual({ error: "Add at least one column." });
  expect(draftBody([["Name", "A"], ["One", "1"], ["One", "2"]])).toEqual({ error: "Each row needs its own name." });
});
