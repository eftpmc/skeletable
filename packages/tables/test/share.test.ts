import { expect, it } from "vitest";
import { validateTable, type Table } from "../src/format.js";
import { emptyLabel, quoteLink } from "../src/share.js";

const read = "2026-11-01";

it("opens a short quote at its words, encoding what a fragment reserves", () => {
  expect(quoteLink("https://a.example/page", "up-front, 45 days")).toBe("https://a.example/page#:~:text=up%2Dfront%2C%2045%20days");
});

it("opens a long quote by its first and last words", () => {
  const quote = "one two three four five six seven eight nine ten eleven twelve thirteen";
  expect(quoteLink("https://a.example/", quote)).toBe("https://a.example/#:~:text=one%20two%20three%20four%20five,nine%20ten%20eleven%20twelve%20thirteen");
});

it("keeps a page's own fragment, and leaves PDFs alone", () => {
  expect(quoteLink("https://a.example/page#part", "stated")).toBe("https://a.example/page#part:~:text=stated");
  expect(quoteLink("https://a.example/spec.pdf", "stated")).toBe("https://a.example/spec.pdf");
});

it("says what kind of empty a cell is", () => {
  expect(emptyLabel({ missing: true, checked: [], read })).toBe("Not looked at yet");
  expect(emptyLabel({ missing: true, checked: ["https://a.example/"], read })).toBe("Not found");
  expect(emptyLabel({ missing: true, checked: ["https://a.example/"], read, absent: true })).toBe("None stated");
});

it("won't let a cell say its source has no value without naming the source", () => {
  const table: Table = {
    format: 1,
    owner: "demo",
    slug: "demo",
    topic: "Demo",
    title: "Demo",
    question: "What?",
    scope: "All.",
    columns: [{ id: "days", label: "Days", type: "number", rule: "As stated." }],
    rows: [{ key: "One", cells: { days: { missing: true, checked: [], read, absent: true } } }],
  };
  expect(validateTable(table).problems).toEqual(["One.days: says its source has no value, without naming the source"]);
});
