import { ListFilter } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterChoices, type SheetFilters } from "@/lib/sheet";
import type { PublishedTable } from "@/lib/status";

/** Pick a column, then the values to keep, like a spreadsheet's filter. */
export function FilterButton({ table, filters, onChange, open, onOpenChange }: { table: PublishedTable; filters: SheetFilters; onChange: (filters: SheetFilters) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [columnId, setColumnId] = useState((table.columns.find((column) => filters[column.id]?.length) ?? table.columns[0]!).id);
  const active = table.columns.filter((column) => filters[column.id]?.length).length;
  const picked = filters[columnId] ?? [];
  const toggle = (value: string) => {
    const values = picked.includes(value) ? picked.filter((other) => other !== value) : [...picked, value];
    const { [columnId]: _dropped, ...others } = filters;
    onChange(values.length ? { ...others, [columnId]: values } : others);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" aria-label={active ? `Filter, ${active} on` : "Filter"} className={active ? "shrink-0 bg-selected text-foreground hover:bg-selected" : "shrink-0 text-muted-foreground"}>
          <ListFilter />
          Filter{active > 0 && <span className="tabular-nums">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] gap-2 p-3">
        <label className="block text-xs font-medium">
          Column
          <NativeSelect value={columnId} onChange={(event) => setColumnId(event.target.value)} className="mt-1 w-full font-normal">
            {table.columns.map((column) => <option key={column.id} value={column.id}>{column.label}{filters[column.id]?.length ? " (on)" : ""}</option>)}
          </NativeSelect>
        </label>
        <ul className="max-h-56 overflow-y-auto text-sm">
          {filterChoices(table, columnId).map(({ value, label, count }) => (
            <li key={value}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                <input type="checkbox" className="size-4 shrink-0 accent-green-600" checked={picked.includes(value)} onChange={() => toggle(value)} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
              </label>
            </li>
          ))}
        </ul>
        {active > 0 && <Button variant="ghost" size="xs" className="self-start" onClick={() => onChange({})}>Clear filters</Button>}
      </PopoverContent>
    </Popover>
  );
}
