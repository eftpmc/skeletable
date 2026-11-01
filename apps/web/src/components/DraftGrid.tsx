import { Plus } from "lucide-react";
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { pasteInto, type Draft } from "@/lib/draft";

const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, Enter: 1 };

/** The start of a table, typed or pasted straight into a grid. */
export function DraftGrid({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const grid = useRef<HTMLTableElement>(null);
  const [headings, ...rows] = draft as [string[], ...string[][]];

  const set = (row: number, column: number, text: string) => {
    const next = draft.map((line) => [...line]);
    next[row]![column] = text;
    // The last row is always empty, so there's always somewhere to type.
    if (row === draft.length - 1 && text) next.push(headings.map(() => ""));
    onChange(next);
  };

  const onPaste = (event: ClipboardEvent, row: number, column: number) => {
    const text = event.clipboardData.getData("text");
    // One word is an ordinary paste into a cell.
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    // A whole sheet into an empty grid starts at the top, so its first row lands on the headings.
    const fresh = /\t|,/.test(text) && draft.flat().slice(1).every((cell) => !cell);
    onChange(fresh ? pasteInto(draft, text, 0, 0) : pasteInto(draft, text, row, column));
  };

  const onKeyDown = (event: KeyboardEvent, row: number, column: number) => {
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    grid.current?.querySelector<HTMLElement>(`[data-at="${row + move}-${column}"]`)?.focus();
  };

  const cell = "h-7 w-full min-w-0 bg-transparent px-2 text-sm outline-none focus:bg-brand/10 focus:ring-2 focus:ring-brand focus:ring-inset placeholder:text-muted-foreground/60";
  const edge = "border-r border-b p-0";
  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      <div className="max-h-[26rem] overflow-auto">
        <table ref={grid} className="min-w-full border-separate border-spacing-0 tabular-nums">
          <thead>
            <tr>
              <th className={`${edge} sticky top-0 left-0 z-30 w-10 min-w-10 bg-muted`}><span className="sr-only">Row</span></th>
              <th scope="col" className={`${edge} sticky top-0 left-10 z-30 min-w-40 bg-muted px-2 text-left text-xs font-medium text-muted-foreground sm:min-w-52`}>Name</th>
              {headings.slice(1).map((heading, index) => (
                <th key={index} scope="col" className={`${edge} sticky top-0 z-20 min-w-36 bg-muted`}>
                  <input aria-label={`Heading of column ${index + 2}`} data-at={`0-${index + 1}`} className={`${cell} text-xs font-medium`} placeholder={index === 0 ? "Heading, like Weight (g)" : "Heading"} value={heading} onChange={(event) => set(0, index + 1, event.target.value)} onPaste={(event) => onPaste(event, 0, index + 1)} onKeyDown={(event) => onKeyDown(event, 0, index + 1)} />
                </th>
              ))}
              <th className="sticky top-0 border-b bg-muted px-1">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Add a column" disabled={headings.length > 20} onClick={() => onChange(draft.map((line) => [...line, ""]))}><Plus /></Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line, rowIndex) => (
              <tr key={rowIndex}>
                <td className={`${edge} sticky left-0 z-10 bg-muted text-center text-xs text-muted-foreground`}>{rowIndex + 1}</td>
                {line.map((text, columnIndex) => (
                  <td key={columnIndex} className={`${edge} ${columnIndex === 0 ? "sticky left-10 z-10 bg-background font-medium" : ""}`}>
                    <input aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} data-at={`${rowIndex + 1}-${columnIndex}`} className={cell} placeholder={rowIndex === 0 && columnIndex === 0 ? "Keychron Q1" : undefined} value={text} onChange={(event) => set(rowIndex + 1, columnIndex, event.target.value)} onPaste={(event) => onPaste(event, rowIndex + 1, columnIndex)} onKeyDown={(event) => onKeyDown(event, rowIndex + 1, columnIndex)} />
                  </td>
                ))}
                <td className="border-b" aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
