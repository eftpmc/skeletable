import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { hasValue, isFound } from "@skeleton/tables/format";
import type { PublishedTable } from "./library.js";

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 72;
const TITLE_LINE_LENGTH = 30;
const FONT_DIR = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Words split across at most two lines, cut short if there are more. */
function titleLines(title: string) {
  const lines = [""];
  for (const word of title.split(" ")) {
    const line = lines[lines.length - 1]!;
    if (line && `${line} ${word}`.length > TITLE_LINE_LENGTH) lines.push(word);
    else lines[lines.length - 1] = line ? `${line} ${word}` : word;
  }
  return lines.length > 2 ? [lines[0]!, `${lines[1]!.slice(0, TITLE_LINE_LENGTH - 3)}...`] : lines;
}

/** A table's link preview: what it is, how big, and how much of it has been checked twice. */
export function previewSvg(table: PublishedTable) {
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const filled = cells.filter(hasValue);
  const checked = filled.filter((cell) => isFound(cell) && cell.confirmed).length;
  const facts = [`${table.rows.length} rows`, `${filled.length} of ${cells.length} cells filled`, ...(filled.length ? [`${Math.round((checked / filled.length) * 100)}% of values checked twice`] : [])];
  const title = titleLines(table.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#fafaf7"/>
    <g stroke="#e8e6df" stroke-width="2">
      ${Array.from({ length: 7 }, (_, index) => `<path d="M0 ${index * 90 + 45}H${WIDTH}"/>`).join("")}
      ${Array.from({ length: 6 }, (_, index) => `<path d="M${index * 240}  0V${HEIGHT}"/>`).join("")}
    </g>
    <text x="${MARGIN}" y="118" font-family="Geist" font-size="34" font-weight="600" fill="#16a34a">Skeletable</text>
    ${title.map((line, index) => `<text x="${MARGIN}" y="${250 + index * 88}" font-family="Geist" font-size="72" font-weight="600" fill="#1c1b18">${escape(line)}</text>`).join("")}
    <text x="${MARGIN}" y="${HEIGHT - 76}" font-family="Geist" font-size="32" fill="#57544c">${escape(facts.join("  ·  "))}</text>
  </svg>`;
}

const images = new Map<string, Buffer>();

/** The preview as a PNG, kept until the table is read again. */
export function previewImage(table: PublishedTable) {
  const version = table.rows.flatMap((row) => Object.values(row.cells)).reduce((latest, cell) => (cell.read > latest ? cell.read : latest), table.title);
  const key = `${table.owner}/${table.slug}/${version}`;
  const held = images.get(key);
  if (held) return held;
  const image = new Resvg(previewSvg(table), { font: { fontFiles: [join(FONT_DIR, "Geist-Regular.ttf"), join(FONT_DIR, "Geist-SemiBold.ttf")], loadSystemFonts: false, defaultFontFamily: "Geist" } }).render().asPng();
  images.set(key, image);
  return image;
}
