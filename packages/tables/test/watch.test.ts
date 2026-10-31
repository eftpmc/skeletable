import { describe, expect, it } from "vitest";
import { validateTable, watchTable, type Fetcher, type FoundCell, type Table, type WatchFile } from "../src/index.js";

const read = "2026-10-31";
const cell = (value: number, source: string, quote: string, kind: FoundCell["kind"] = "first-hand"): FoundCell => ({ value, source, kind, quote, read });

const table: Table = {
  format: 1,
  owner: "demo-owner",
  slug: "demo",
  topic: "Demo",
  title: "Demo",
  question: "What do these weigh?",
  scope: "Everything in the demo.",
  columns: [{ id: "weight", label: "Weight", type: "number", unit: "g", rule: "Stated weight." }],
  rows: [
    { key: "Live", cells: { weight: cell(10, "https://a.example/live", "Weighs 10 g") } },
    { key: "Old", cells: { weight: cell(20, "https://web.archive.org/old", "Weighs 20 g", "archived") } },
    { key: "Empty", cells: { weight: { missing: true, checked: ["https://a.example/live"], read } } },
  ],
};

const pages = (body: string, status = 200) => {
  const opened: string[] = [];
  const fetcher: Fetcher = async (url) => {
    opened.push(url);
    return { status, contentType: "text/html", body };
  };
  return { opened, fetcher };
};

describe("watchTable", () => {
  it("marks a quote still on its page as seen today", async () => {
    const { fetcher } = pages("<p>Weighs 10 g</p>");
    const watch = await watchTable(table, fetcher, "2026-11-01", undefined, 0);
    expect(watch).toMatchObject({ slug: "demo", ran: "2026-11-01" });
    expect(watch.cells["Live/weight"]).toEqual({ status: "found", seen: "2026-11-01" });
  });

  it("doesn't open archived copies, which can't change", async () => {
    const { opened, fetcher } = pages("<p>Weighs 10 g</p>");
    const watch = await watchTable(table, fetcher, "2026-11-01", undefined, 0);
    expect(opened).toEqual(["https://a.example/live"]);
    expect(watch.cells["Old/weight"]).toEqual({ status: "pinned" });
  });

  it("skips missing cells", async () => {
    const { fetcher } = pages("<p>Weighs 10 g</p>");
    expect((await watchTable(table, fetcher, "2026-11-01", undefined, 0)).cells["Empty/weight"]).toBeUndefined();
  });

  it("keeps the last day a quote was seen once it's gone", async () => {
    const previous: WatchFile = { slug: "demo", ran: "2026-11-01", cells: { "Live/weight": { status: "found", seen: "2026-11-01" } } };
    const { fetcher } = pages("<p>Now 12 g</p>");
    expect((await watchTable(table, fetcher, "2026-11-08", previous, 0)).cells["Live/weight"]).toEqual({ status: "not-on-page", seen: "2026-11-01" });
  });

  it("tells a blocked page apart from a missing quote", async () => {
    const { fetcher } = pages("", 503);
    expect((await watchTable(table, fetcher, "2026-11-01", undefined, 0)).cells["Live/weight"]).toEqual({ status: "unreadable" });
  });
});

describe("conflicts and history", () => {
  const withCell = (changes: Partial<FoundCell>): Table => ({
    ...table,
    rows: [{ key: "One", cells: { weight: { ...cell(10, "https://a.example/one", "Weighs 10 g"), ...changes } } }],
  });

  it("accepts a confirmed cell with a conflict and a past value", () => {
    const { problems } = validateTable(
      withCell({
        confirmed: "blind-read",
        conflicts: [cell(12, "https://b.example/one", "Weighs 12 g")],
        history: [{ ...cell(9, "https://a.example/one", "Weighs 9 g"), until: "2026-10-30" }],
      }),
    );
    expect(problems).toEqual([]);
  });

  it("holds a conflicting value to its own quote", () => {
    const { problems } = validateTable(withCell({ conflicts: [cell(12, "https://b.example/one", "Weighs 13 g")] }));
    expect(problems).toEqual(["One.weight: 12 isn't in its quote"]);
  });

  it("holds a past value to its own quote", () => {
    const { problems } = validateTable(withCell({ history: [{ ...cell(9, "https://a.example/one", "Weighs 8 g"), until: "2026-10-30" }] }));
    expect(problems).toEqual(["One.weight: 9 isn't in its quote"]);
  });

  it("refuses a confirmation it doesn't know", () => {
    const { problems } = validateTable(withCell({ confirmed: "vibes" as FoundCell["confirmed"] }));
    expect(problems).toHaveLength(1);
  });
});
