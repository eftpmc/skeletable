import { isFound, sourceKinds, type SourceKind, type Table } from "./format.js";

export type SampledCell = { row: string; column: string; value: string | number | boolean; kind: SourceKind; source: string; quote: string };

/** A repeatable random draw of filled cells for a person to check by hand. */
export function sampleCells(table: Table, count: number, seed: number): SampledCell[] {
  const cells: SampledCell[] = [];
  for (const row of table.rows) {
    for (const [column, cell] of Object.entries(row.cells)) {
      if (isFound(cell)) cells.push({ row: row.key, column, value: cell.value, kind: cell.kind, source: cell.source, quote: cell.quote });
    }
  }
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells.slice(0, count);
}

/** How much of the table is filled in, and from how close to the origin. */
export function coverage(table: Table): { filled: number; missing: number; share: number; kinds: Record<SourceKind, number> } {
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const found = cells.filter(isFound);
  const kinds = Object.fromEntries(sourceKinds.map((kind) => [kind, found.filter((cell) => cell.kind === kind).length])) as Record<SourceKind, number>;
  return { filled: found.length, missing: cells.length - found.length, share: found.length / Math.max(1, cells.length), kinds };
}
