import { describe, expect, it } from "vitest";
import { aiCellState, aiProgress, columnSummary, fingerprint, matchChoice, rowPrompt } from "../src/columns.js";
import type { Cell, Column, Table } from "../src/format.js";

const read = "2026-11-02";
const blank: Cell = { missing: true, checked: [], read };
const made = (value: string | number | boolean, extra: object = {}): Cell => ({ value, origin: "generated", read, ...extra });

describe("columnSummary", () => {
  const rows = (values: (string | number | boolean | undefined)[]) => values.map((value, index) => ({ key: `r${index}`, cells: { c: value === undefined ? blank : made(value) } }));
  const column = (type: Column["type"]): Column => ({ id: "c", label: "C", type, rule: "" });

  it("reads repeated text as categories, most common first", () => {
    expect(columnSummary({ rows: rows(["b", "a", "a", "b", "a", undefined]) }, column("text"))).toEqual({ kind: "categories", filled: 5, blank: 1, origins: { generated: 5 }, values: [{ value: "a", count: 3 }, { value: "b", count: 2 }] });
  });

  it("reads a column with choices as categories, however few rows it has", () => {
    expect(columnSummary({ rows: rows(["Offer", "Applied"]) }, { ...column("text"), choices: ["Applied", "Offer"] })).toMatchObject({ kind: "categories", values: [{ value: "Applied", count: 1 }, { value: "Offer", count: 1 }] });
  });

  it("reads varied text by its length, and counts repeats", () => {
    expect(columnSummary({ rows: rows(["one", "three", "one"]) }, column("text"))).toMatchObject({ kind: "text", shortest: 3, longest: 5, average: 4, duplicates: 1 });
  });

  it("gives numbers their range, middle and spread", () => {
    expect(columnSummary({ rows: rows([1, 9, 5, 3]) }, column("number"))).toMatchObject({ kind: "number", min: 1, max: 9, median: 4, histogram: [1, 0, 1, 0, 1, 0, 0, 1] });
    expect(columnSummary({ rows: rows([true, false, true]) }, column("boolean"))).toMatchObject({ kind: "boolean", yes: 2, no: 1 });
    expect(columnSummary({ rows: rows([undefined]) }, column("number"))).toMatchObject({ kind: "empty", blank: 1 });
  });
});

describe("AI columns", () => {
  const columns: Table["columns"] = [
    { id: "pitch", label: "Pitch", type: "text", rule: "" },
    { id: "genre", label: "Genre", type: "text", rule: "", instruction: "Classify {pitch} from {Name}, not {Nope}", choices: ["Racing", "Horror"] },
  ];
  const genre = columns[1]!;
  const row = (pitch: Cell, cell: Cell = blank) => ({ key: "g-1", cells: { pitch, genre: cell } });

  it("fills a row's prompt from its values, by label or id, and leaves unknown names alone", () => {
    expect(rowPrompt({ columns }, genre, row(made("Drift fast")))).toEqual({ prompt: "Classify Drift fast from g-1, not {Nope}\nAnswer with exactly one of: Racing, Horror.", basis: fingerprint("Classify Drift fast from g-1, not {Nope}\nAnswer with exactly one of: Racing, Horror."), waiting: false });
    expect(rowPrompt({ columns }, genre, row(blank))!.waiting).toBe(true);
  });

  it("knows which cells need an answer, and leaves a person's values alone", () => {
    const { basis } = rowPrompt({ columns }, genre, row(made("Drift")))!;
    expect(aiCellState({ columns }, genre, row(made("Drift")))).toBe("pending");
    expect(aiCellState({ columns }, genre, row(made("Drift"), made("Racing", { basis })))).toBe("done");
    expect(aiCellState({ columns }, genre, row(made("Drift slowly"), made("Racing", { basis })))).toBe("stale");
    expect(aiCellState({ columns }, genre, row(made("Drift"), { value: "Horror", origin: "entered", read }))).toBe("kept");
    expect(aiCellState({ columns }, genre, row(blank))).toBe("waiting");
    expect(aiProgress({ columns, rows: [row(made("A")), row(blank)] }, genre)).toEqual({ done: 0, pending: 1, stale: 0, waiting: 1, kept: 0 });
  });

  it("matches an answer to the column's choices, ignoring case and a full stop", () => {
    expect(matchChoice(genre, " horror. ")).toBe("Horror");
    expect(matchChoice(genre, "Comedy")).toBeUndefined();
    expect(matchChoice(columns[0]!, " anything ")).toBe("anything");
  });
});
