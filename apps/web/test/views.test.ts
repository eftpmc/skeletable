import { describe, expect, it } from "vitest";
import type { Column } from "@skeleton/tables/format";
import { availableViews, boardLanes, defaultDateColumn, relativeDay, shortDay, upcomingGroups } from "@/lib/views";

const status: Column = { id: "status", label: "Status", type: "text", rule: "", choices: ["Applied", "Interviewing", "Offer"] };
const applied: Column = { id: "applied", label: "Applied", type: "date", rule: "" };
const followUp: Column = { id: "follow_up", label: "Follow up", type: "date", rule: "" };
const read = "2026-11-02";
const row = (key: string, values: Record<string, string>) => ({ key, cells: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value, origin: "entered" as const, read }])) });
const keys = (rows: { key: string }[]) => rows.map((r) => r.key);

describe("views", () => {
  it("offers a board for a column with choices, and upcoming for a date column", () => {
    expect(availableViews({ columns: [status, applied] })).toEqual(["sheet", "board", "upcoming"]);
    expect(availableViews({ columns: [{ ...status, choices: undefined }] })).toEqual(["sheet"]);
    expect(defaultDateColumn({ columns: [applied, followUp] })).toBe(followUp);
    expect(defaultDateColumn({ columns: [applied] })).toBe(applied);
  });

  it("lays out a lane for each choice, then other values, then rows with none", () => {
    const rows = [row("Acme", { status: "Offer" }), row("Globex", { status: "Applied" }), row("Hooli", { status: "Ghosted" }), row("Initech", {})];
    const lanes = boardLanes({ columns: [status] }, rows, status);
    expect(lanes.map((lane) => [lane.label, keys(lane.rows)])).toEqual([
      ["Applied", ["Globex"]],
      ["Interviewing", []],
      ["Offer", ["Acme"]],
      ["Ghosted", ["Hooli"]],
      ["No status", ["Initech"]],
    ]);
  });

  it("groups by date, flagging past follow-ups as overdue", () => {
    const today = "2026-11-02";
    const rows = [
      row("late", { follow_up: "2026-10-30" }),
      row("now", { follow_up: today }),
      row("soon", { follow_up: "2026-11-09" }),
      row("sooner", { follow_up: "2026-11-04" }),
      row("far", { follow_up: "2026-12-25" }),
      row("none", {}),
    ];
    expect(upcomingGroups(rows, followUp, today).map((group) => [group.label, keys(group.rows)])).toEqual([
      ["Overdue", ["late"]],
      ["Today", ["now"]],
      ["Next 7 days", ["sooner", "soon"]],
      ["Later", ["far"]],
      ["No follow up", ["none"]],
    ]);
    // A date that only records when something happened isn't overdue, just earlier, most recent first.
    const past = [row("a", { applied: "2026-10-01" }), row("b", { applied: "2026-10-20" })];
    expect(upcomingGroups(past, applied, today).map((group) => [group.label, keys(group.rows)])).toEqual([["Earlier", ["b", "a"]]]);
  });

  it("reads days as people say them", () => {
    expect(shortDay("2026-10-28", "2026-11-02")).toBe("Oct 28");
    expect(shortDay("2025-10-28", "2026-11-02")).toBe("Oct 28, 2025");
    expect(["2026-11-02", "2026-11-03", "2026-11-01", "2026-11-06", "2026-10-28"].map((day) => relativeDay(day, "2026-11-02"))).toEqual(["today", "tomorrow", "yesterday", "in 4 days", "5 days ago"]);
  });
});
