import { describe, expect, it } from "vitest";
import { hasValue, isAnswered, isFound, isGiven, parseDay, validateTable, type Table } from "../src/format.js";
import { cellStatus, draftChecklist, tableCsv } from "../src/share.js";

const table = (proof?: "optional", cells: Table["rows"][number]["cells"] = {}): Table => ({
  format: 1,
  owner: "pat",
  slug: "clauses",
  ...(proof && { proof }),
  topic: "Privacy",
  title: "Clauses",
  question: "What does each clause say?",
  scope: "Sentences from privacy policies.",
  columns: [
    { id: "text", label: "Text", type: "text", rule: "One sentence, as written." },
    { id: "words", label: "Words", type: "number", rule: "How many words." },
  ],
  rows: [{ key: "ex-1", cells: { text: { missing: true, checked: [], read: "2026-11-01" }, words: { missing: true, checked: [], read: "2026-11-01" }, ...cells } }],
});

const generated = { value: "We keep your data for as long as your account is open.", origin: "generated" as const, note: "Write a retention clause", read: "2026-11-01" };

describe("values that say where they came from", () => {
  it("only fit a table whose proof is optional", () => {
    expect(validateTable(table("optional", { text: generated })).problems).toEqual([]);
    expect(validateTable(table(undefined, { text: generated })).problems).toEqual(["ex-1.text: has no quote, and this table requires one"]);
  });

  it("still have to be the column's type, and a link has to give its page", () => {
    expect(validateTable(table("optional", { words: { value: "twelve", origin: "entered", read: "2026-11-01" } })).problems).toEqual(["ex-1.words: should be number"]);
    expect(validateTable(table("optional", { text: { value: "Hi", origin: "link", read: "2026-11-01" } })).problems).toEqual(["ex-1.text: comes from a link but doesn't give it"]);
  });

  it("can hold a passage longer than a quoted value", () => {
    const long = { ...generated, value: "word ".repeat(300).trim() };
    expect(validateTable(table("optional", { text: long })).problems).toEqual([]);
  });

  it("count as values, but not as quoted ones", () => {
    expect([hasValue(generated), isGiven(generated), isFound(generated), isAnswered(generated)]).toEqual([true, true, false, true]);
    expect(cellStatus(generated, "ex-1", "text")).toBe("generated");
  });

  it("let a draft whose proof is optional be filled rather than proved", () => {
    const draft = { ...table("optional", { text: generated }), draft: true };
    expect(draftChecklist(draft).items.at(-1)).toEqual({ label: "Fill at least one value", done: true });
  });
});

describe("tableCsv", () => {
  const filled = table("optional", { text: generated, words: { value: 12, source: "https://policy.example", kind: "first-hand", quote: "It has 12 words", read: "2026-11-01" } });

  it("picks columns, in order, with or without row names", () => {
    expect(tableCsv(filled, false, { columns: ["words", "text"], names: false })).toBe(`Words,Text\r\n12,${generated.value}`);
    expect(tableCsv(filled, false)).toBe(`Name,Text,Words\r\nex-1,${generated.value},12`);
  });

  it("says where each value came from when proof is optional", () => {
    expect(tableCsv(filled, true).split("\r\n")).toEqual([
      "Name,Text,Text: source,Text: quote,Text: origin,Words,Words: source,Words: quote,Words: origin",
      `ex-1,${generated.value},,,generated,12,https://policy.example,It has 12 words,quote`,
    ]);
    expect(tableCsv({ ...filled, proof: undefined, rows: [{ key: "ex-1", cells: { words: filled.rows[0]!.cells.words! } }] }, true).split("\r\n")[0]).toBe("Name,Text,Text: source,Text: quote,Words,Words: source,Words: quote");
  });
});

describe("dates", () => {
  it("reads the ways people write a day, and refuses ones that aren't real", () => {
    expect(["2026-10-28", "2026-1-5", "10/28/2026", "Oct 28, 2026", "October 28th 2026", "28 Oct 2026", "  sept 3, 2026 "].map(parseDay)).toEqual(["2026-10-28", "2026-01-05", "2026-10-28", "2026-10-28", "2026-10-28", "2026-10-28", "2026-09-03"]);
    expect(["2026-02-30", "13/01/2026", "next week", "Oct 2026", ""].map(parseDay)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("only fit a table whose proof is optional, written YYYY-MM-DD", () => {
    const dated = (proof?: "optional", value = "2026-10-28"): Table => ({ ...table(proof), columns: [{ id: "when", label: "When", type: "date", rule: "The day it happened." }], rows: [{ key: "a", cells: { when: { value, origin: "entered", read: "2026-11-01" } } }] });
    expect(validateTable(dated("optional")).problems).toEqual([]);
    expect(validateTable(dated("optional", "Oct 28")).problems).toEqual(["a.when: should be a date like 2026-10-28"]);
    expect(validateTable(dated()).problems).toContain("when: a date column needs a table whose proof is optional");
  });
});
