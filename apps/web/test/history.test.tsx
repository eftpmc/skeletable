import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeRow } from "../src/pages/TableActivity";
import type { PublishedTable } from "../src/lib/status";

const table = { columns: [{ id: "weight", label: "Weight" }] } as PublishedTable;
const base = { id: "1", row: "Steam Deck LCD", column: "weight", author: "Previewer", created_at: "2026-11-01T12:00:00Z", previous: { missing: true as const, checked: [], read: "2026-11-01" } };

describe("history entries", () => {
  it("renders a missing value and its checked sources without expecting a quote", () => {
    const html = renderToStaticMarkup(<ChangeRow table={table} change={{ ...base, cell: { missing: true, checked: ["https://www.steamdeck.com/en/tech"], read: "2026-11-01" } }} />);
    expect(html).toContain("Sources checked");
    expect(html).toContain("https://www.steamdeck.com/en/tech");
    expect(html).not.toContain("<blockquote");
  });
  it("renders an empty draft entry", () => {
    const html = renderToStaticMarkup(<ChangeRow table={table} change={{ ...base, cell: base.previous }} />);
    expect(html).toContain("No sources checked yet");
  });
  it("still renders a sourced value and its exact quote", () => {
    const html = renderToStaticMarkup(<ChangeRow table={table} change={{ ...base, cell: { value: 640, source: "https://www.steamdeck.com/en/tech", quote: "Weight is 640 g", kind: "first-hand", read: "2026-11-01" } }} />);
    expect(html).toContain("Weight is 640 g");
    expect(html).toContain("<blockquote");
  });
});
