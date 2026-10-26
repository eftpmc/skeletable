// Generates CSS from tokens.json, the one source for colors, type, spacing, radius and shadows:
//   src/tokens.css   CSS variables (light on :root, dark via prefers-color-scheme or [data-theme="dark"])
//   src/theme.css    Tailwind v4 theme that maps utilities (bg-ink, text-title-1, rounded-xl…) onto those variables
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const tokens = JSON.parse(readFileSync(new URL("tokens.json", root), "utf8"));
const [first, ...others] = tokens.color.themes.map((t) => t.id);

const resolve = (value) => value.replace(/^\{(.+)\}$/, "var(--$1)");
const themed = (token, theme) => (typeof token.value === "string" ? token.value : (token.value[theme] ?? token.value[first]));

function themeBlock(theme) {
  const lines = [];
  for (const family of [tokens.color, tokens.shadow]) {
    for (const t of family?.tokens ?? []) {
      if (theme !== first && (typeof t.value === "string" || t.value[theme] === undefined)) continue;
      lines.push(`  --${t.name}: ${resolve(themed(t, theme))};`);
    }
  }
  return lines.join("\n");
}

const constant = [
  ...Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`),
  ...tokens.spacing.tokens.map((t) => `  --${t.name}: ${t.value};`),
  ...tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`),
].join("\n");

let css = `/* ${tokens.name} — generated from tokens.json */\n:root {\n${themeBlock(first)}\n${constant}\n}\n`;
for (const theme of others) {
  css += `@media (prefers-color-scheme: ${theme}) {\n  :root:not([data-theme="${first}"]) {\n${themeBlock(theme).replace(/^/gm, "  ")}\n    color-scheme: ${theme};\n  }\n}\n`;
  css += `:root[data-theme="${theme}"] {\n${themeBlock(theme)}\n  color-scheme: ${theme};\n}\n`;
}
writeFileSync(new URL("src/tokens.css", root), css);

// Tailwind theme. "inline" makes utilities use var(--token) directly so they follow the theme at
// runtime; "reference" stops Tailwind from re-declaring the variables, so tokens.css stays the only
// place a value is set.
const theme = ["/* Generated from tokens.json by scripts/build-tokens.mjs. Do not edit. */", "@theme inline reference {"];
for (const t of tokens.color.tokens) theme.push(`  --color-${t.name}: var(--${t.name});`);
for (const key of Object.keys(tokens.type.families)) theme.push(`  --font-${key}: var(--font-${key});`);
for (const t of tokens.radius.tokens) theme.push(`  --${t.name}: var(--${t.name});`);
for (const t of tokens.shadow.tokens) theme.push(`  --shadow-${t.name.replace(/^elevation-/, "")}: var(--${t.name});`);
for (const group of tokens.type.groups) {
  for (const s of group.styles) {
    theme.push(`  --text-${s.name}: ${s.fontSize};`);
    theme.push(`  --text-${s.name}--line-height: ${s.lineHeight};`);
    theme.push(`  --text-${s.name}--font-weight: ${s.fontWeight};`);
    if (s.letterSpacing) theme.push(`  --text-${s.name}--letter-spacing: ${s.letterSpacing};`);
  }
}
theme.push("}", "");
writeFileSync(new URL("src/theme.css", root), theme.join("\n"));
console.log("tokens.css + theme.css written");
