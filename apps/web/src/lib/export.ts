import type { PublishedTable } from "@/lib/status";

export { tableCsv } from "@skeleton/tables/share";

/** The table's own data, with its address so a copy can credit where it came from. */
export function tableJson(table: PublishedTable, url: string) {
  const { watch: _watch, managed: _managed, moved: _moved, ...data } = table;
  return JSON.stringify({ ...data, url, licence: table.private ? undefined : "CC BY 4.0" }, null, 2);
}

/** Hand the browser a file to save. */
export function saveFile(name: string, type: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
