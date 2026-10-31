import { describe, expect, it } from "vitest";
import { coverage, normalize, pageText, pdfText, quoteStates, sampleCells, validateTable, verifyTable, type Fetcher, type Table } from "../src/index.js";

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
        weight: { value: 1200, source: "https://a.example/one", kind: "first-hand", quote: "Weighs 1,200 g", read },
        colour: { missing: true, checked: ["https://a.example/one"], read },
      },
    },
    {
      key: "Two",
      cells: {
        weight: { value: 300, source: "https://b.example/two.pdf", kind: "first-hand", quote: "300 g", read },
        colour: { value: "Red", source: "https://a.example/gone", kind: "first-hand", quote: "Comes in red", read },
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
    bad.rows[0]!.cells.weight = { value: 1300, source: "https://a.example/one", kind: "first-hand", quote: "Weighs 1,200 g", read };
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
    bad.rows[1]!.cells.colour = { value: 3, source: "https://a.example/x", kind: "first-hand", quote: "3", read };
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
    bad.rows[0]!.cells.weight = { value: 1200, source: "https://a.example/one", kind: "first-hand", quote: "1200 g exactly", read };
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
  expect(coverage(table)).toEqual({ filled: 3, missing: 1, share: 0.75, kinds: { "first-hand": 3, archived: 0, "second-hand": 0 } });
});

it("refuses a cell that doesn't say what kind of source it used", () => {
  const bad = structuredClone(table) as unknown as { rows: { cells: { weight: { kind?: string } } }[] };
  delete bad.rows[0]!.cells.weight.kind;
  expect(validateTable(bad).problems.length).toBeGreaterThan(0);
});

it("pdfText reads the words in a PDF", async () => {
  // The smallest PDF with a line of text: PDF.js rebuilds the missing cross-reference table.
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 44>>stream",
    "BT /F1 12 Tf 10 50 Td (Weight 920 g) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  expect(await pdfText(new TextEncoder().encode(pdf))).toContain("Weight 920 g");
});

it("matches a quote however the page spaces it", async () => {
  const spaced = structuredClone(table);
  spaced.rows[0]!.cells.weight = { value: 5, source: "https://a.example/one", kind: "first-hand", quote: "Hobby $5 minimum", read };
  const glued: Fetcher = async () => ({ status: 200, contentType: "text/html", body: "<b>Hobby</b><b>$5</b><i>minimum</i>" });
  expect((await verifyTable(spaced, glued, 0))[0]!.status).toBe("found");
});
