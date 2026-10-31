import { describe, expect, it } from "vitest";
import { coverage, normalize, pageText, quoteStates, sampleCells, validateTable, verifyTable, type Fetcher, type Table } from "../src/index.js";

const read = "2026-10-31";
const table: Table = {
  format: 1,
  slug: "demo",
  title: "Demo",
  question: "What do these weigh?",
  scope: "Everything in the demo.",
  columns: [
    { id: "weight", label: "Weight", type: "number", unit: "g", rule: "Stated weight." },
    { id: "colour", label: "Colour", type: "text", rule: "Stated colour." },
  ],
  rows: [
    {
      key: "One",
      cells: {
        weight: { value: 1200, source: "https://a.example/one", quote: "Weighs 1,200 g", read },
        colour: { missing: true, checked: ["https://a.example/one"], read },
      },
    },
    {
      key: "Two",
      cells: {
        weight: { value: 300, source: "https://b.example/two.pdf", quote: "300 g", read },
        colour: { value: "Red", source: "https://a.example/gone", quote: "Comes in red", read },
      },
    },
  ],
};

const fetcher: Fetcher = async (url) => {
  if (url.endsWith(".pdf")) return { status: 200, contentType: "application/pdf", body: "" };
  if (url.endsWith("gone")) return { status: 404, contentType: "text/html", body: "" };
  return { status: 200, contentType: "text/html", body: "<p>Weighs   1,200 g</p><script>nope</script>" };
};

describe("validateTable", () => {
  it("accepts a well-formed table", () => {
    expect(validateTable(table).problems).toEqual([]);
  });

  it("refuses a number its quote doesn't state", () => {
    const bad = structuredClone(table);
    bad.rows[0]!.cells.weight = { value: 1300, source: "https://a.example/one", quote: "Weighs 1,200 g", read };
    expect(validateTable(bad).problems).toEqual(["One.weight: 1300 isn't in its quote"]);
  });

  it("refuses an empty cell, since a gap must say where we looked", () => {
    const bad = structuredClone(table);
    delete bad.rows[0]!.cells.colour;
    expect(validateTable(bad).problems).toEqual(["One.colour: empty; say where you looked instead"]);
  });

  it("refuses a value of the wrong type and a repeated row", () => {
    const bad = structuredClone(table);
    bad.rows[1]!.key = "One";
    bad.rows[1]!.cells.colour = { value: 3, source: "https://a.example/x", quote: "3", read };
    expect(validateTable(bad).problems).toEqual(["One: appears twice", "One.colour: should be text"]);
  });
});

describe("quoteStates", () => {
  it("reads thousands separators and trailing zeros", () => {
    expect(quoteStates(13.5, "13.50 kWh")).toBe(true);
    expect(quoteStates(1200, "1,200 g")).toBe(true);
    expect(quoteStates(2, "2.0 inches")).toBe(true);
  });

  it("doesn't match inside a longer number", () => {
    expect(quoteStates(13, "13.5 kWh")).toBe(false);
    expect(quoteStates(20, "120 g")).toBe(false);
    expect(quoteStates(5, "13.5 kWh")).toBe(false);
  });
});

describe("verifyTable", () => {
  it("says what happened to every quote", async () => {
    const checks = await verifyTable(table, fetcher, 0);
    expect(checks.map((c) => [c.row, c.column, c.status])).toEqual([
      ["One", "weight", "found"],
      ["Two", "weight", "unreadable"],
      ["Two", "colour", "unreadable"],
    ]);
  });

  it("reports a quote that isn't on the page", async () => {
    const bad = structuredClone(table);
    bad.rows[0]!.cells.weight = { value: 1200, source: "https://a.example/one", quote: "1200 g exactly", read };
    expect((await verifyTable(bad, fetcher, 0))[0]!.status).toBe("not-on-page");
  });

  it("doesn't read a page robots.txt refuses", async () => {
    const checks = await verifyTable(table, async () => ({ status: 451, contentType: "", body: "" }), 0);
    expect(checks.every((c) => c.status === "robots")).toBe(true);
  });
});

it("pageText drops scripts and evens out typography", () => {
  expect(pageText("<p>It’s  here</p><script>hidden</script>")).toBe(normalize("it's here"));
});

it("sampleCells repeats for a seed and skips gaps", () => {
  expect(sampleCells(table, 2, 7)).toEqual(sampleCells(table, 2, 7));
  expect(sampleCells(table, 10, 1)).toHaveLength(3);
});

it("coverage counts gaps", () => {
  expect(coverage(table)).toEqual({ filled: 3, missing: 1, share: 0.75 });
});
