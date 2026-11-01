import type { Table, WatchFile } from "@skeleton/tables/format";
import { cellStatus, statusLabels, type CellStatus } from "@skeleton/tables/share";
import { Bone, CircleDashed, CircleSlash, Eye, FileCheck, PenLine, SearchX, ShieldCheck, Square, type LucideIcon } from "lucide-react";

export { cellStatus, type CellStatus };

export type PublishedTable = Table & { watch?: WatchFile; ownerName?: string; private?: boolean; managed?: boolean; moved?: Record<string, string> };

/**
 * How much to trust a cell, worst news first. Each has an icon, so meaning never rests on colour
 * alone. `corner` is the mark in a cell's corner, like a spreadsheet's note: only settled values get one.
 */
export const statuses: Record<CellStatus, { label: string; detail: string; icon: LucideIcon; tint: string; solid: string; corner?: string }> = {
  fracture: { label: statusLabels.fracture, detail: "Sources disagree", icon: Bone, tint: "bg-rose-500/20", solid: "bg-rose-500", corner: "border-t-rose-500" },
  gone: { label: statusLabels.gone, detail: "The quote left its page at the last check", icon: SearchX, tint: "bg-orange-500/20", solid: "bg-orange-500", corner: "border-t-orange-500" },
  once: { label: statusLabels.once, detail: "No second reader yet", icon: Eye, tint: "bg-amber-500/20", solid: "bg-amber-500", corner: "border-t-amber-500" },
  summary: { label: statusLabels.summary, detail: "Matched a summary of the owner's pages", icon: FileCheck, tint: "bg-sky-500/15", solid: "bg-sky-500", corner: "border-t-sky-500" },
  confirmed: { label: statusLabels.confirmed, detail: "A separate reader opened the source without seeing our value", icon: ShieldCheck, tint: "bg-emerald-500/15", solid: "bg-emerald-500", corner: "border-t-emerald-500" },
  none: { label: statusLabels.none, detail: "We read the source and it gives no such value", icon: CircleSlash, tint: "bg-violet-500/15", solid: "bg-violet-500", corner: "border-t-violet-500" },
  unproven: { label: statusLabels.unproven, detail: "Typed in, and not counted until it has a source", icon: PenLine, tint: "bg-muted", solid: "bg-muted-foreground/50", corner: "border-t-muted-foreground/60" },
  gap: { label: statusLabels.gap, detail: "No source we could use stated this", icon: CircleDashed, tint: "", solid: "bg-muted-foreground/30" },
  blank: { label: statusLabels.blank, detail: "Nobody has looked for this yet", icon: Square, tint: "", solid: "bg-muted-foreground/15" },
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
