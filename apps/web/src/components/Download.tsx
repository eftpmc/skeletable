import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { saveFile, tableCsv, tableJson } from "@/lib/export";
import type { PublishedTable } from "@/lib/status";

/** Saves the table as you're seeing it, so a filtered sheet downloads as filtered. Icon-only on a phone, where the bar is full. */
export function DownloadButton({ table, size = "lg" }: { table: PublishedTable; size?: "lg" | "sm" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} aria-label="Download"><Download /><span className="hidden sm:inline">Download</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DownloadItems table={table} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shared export actions; receives the filtered table when used in a sheet. */
export function DownloadItems({ table }: { table: PublishedTable }) {
  const save = (kind: "csv" | "proof" | "json") => {
    const url = `${location.origin}/${table.owner}/${table.slug}`;
    if (kind === "json") saveFile(`${table.slug}.json`, "application/json", tableJson(table, url));
    else saveFile(`${table.slug}.csv`, "text/csv;charset=utf-8", `\uFEFF${tableCsv(table, kind === "proof")}`);
    toast.success(`Downloaded ${table.rows.length} ${table.rows.length === 1 ? "row" : "rows"}`);
  };
  return <>
        <DropdownMenuItem onSelect={() => save("csv")}>Download CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => save("proof")}>Download CSV with sources and quotes</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => save("json")}>Download JSON</DropdownMenuItem>
  </>;
}
