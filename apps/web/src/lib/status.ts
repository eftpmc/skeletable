import type { Cell, Table, WatchFile } from "@skeleton/tables/format";
import { Bone, CircleDashed, Eye, FileCheck, SearchX, ShieldCheck, type LucideIcon } from "lucide-react";

export type CellStatus = "fracture" | "gone" | "once" | "summary" | "confirmed" | "gap";

export type PublishedTable = Table & { watch?: WatchFile; ownerName?: string };

/** How much to trust a cell, worst news first. Each has an icon, so meaning never rests on colour alone. */
export const statuses: Record<CellStatus, { label: string; detail: string; icon: LucideIcon; tint: string; solid: string }> = {
  fracture: { label: "Fracture", detail: "Sources disagree", icon: Bone, tint: "bg-rose-500/20", solid: "bg-rose-500" },
  gone: { label: "Quote gone", detail: "The quote left its page at the last check", icon: SearchX, tint: "bg-orange-500/20", solid: "bg-orange-500" },
  once: { label: "Read once", detail: "No second reader yet", icon: Eye, tint: "bg-amber-500/20", solid: "bg-amber-500" },
  summary: { label: "Matched a summary", detail: "Matched a summary of the owner's pages", icon: FileCheck, tint: "bg-sky-500/15", solid: "bg-sky-500" },
  confirmed: { label: "Confirmed", detail: "A separate reader opened the source without seeing our value", icon: ShieldCheck, tint: "bg-emerald-500/15", solid: "bg-emerald-500" },
  gap: { label: "Not stated", detail: "No source we could use stated this", icon: CircleDashed, tint: "", solid: "bg-muted-foreground/30" },
};

export const cellStatus = (cell: Cell, rowKey: string, columnId: string, watch?: WatchFile): CellStatus => {
  if ("missing" in cell) return "gap";
  if (cell.conflicts?.length) return "fracture";
  if (watch?.cells[`${rowKey}/${columnId}`]?.status === "not-on-page") return "gone";
  if (cell.confirmed === "blind-read") return "confirmed";
  return cell.confirmed === "summary" ? "summary" : "once";
};

/** How many cells of a table sit at each status. */
export function statusCounts(table: PublishedTable) {
  const counts = new Map<CellStatus, number>();
  for (const row of table.rows) {
    for (const [columnId, cell] of Object.entries(row.cells)) {
      const status = cellStatus(cell, row.key, columnId, table.watch);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }
  return counts;
}
