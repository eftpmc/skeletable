/** The site's only stylesheet: one typeface, one ink, and lines where a table needs them. */
export const style = `
:root {
  color-scheme: light dark;
  --paper: #fbfbfa;
  --raised: #ffffff;
  --ink: #1b1b1a;
  --dim: #6b6a65;
  --line: #e5e4df;
  --hover: #f1f0ec;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #141413;
    --raised: #1c1c1a;
    --ink: #ecebe6;
    --dim: #9a9892;
    --line: #2d2c29;
    --hover: #232321;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: inherit; }
a:focus-visible, input:focus-visible, .scroll:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
.wrap.wide { max-width: 1120px; }
.brand { font-weight: 600; text-decoration: none; }
.lead { margin: 48px 0 24px; font-size: 22px; line-height: 1.3; letter-spacing: -0.01em; }
.dim { color: var(--dim); }
.hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

input[type="search"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: inherit;
  font: inherit;
}
.list { margin: 24px 0 0; padding: 0; list-style: none; }
.list li { border-top: 1px solid var(--line); }
.list a { display: block; padding: 14px 0; text-decoration: none; }
.list a:hover .name { text-decoration: underline; }
.name { font-weight: 600; }
.list p { margin: 2px 0; }
.meta { font-size: 13px; color: var(--dim); }
.connect { margin-top: 56px; font-size: 13px; color: var(--dim); }
code { display: block; margin-top: 6px; overflow-wrap: anywhere; font: 13px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--ink); }

h1 { margin: 40px 0 4px; font-size: 22px; line-height: 1.3; letter-spacing: -0.01em; }
.question { margin: 0 0 24px; }
.scroll { overflow-x: auto; border-top: 1px solid var(--line); }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; }
th, td { padding: 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; font-weight: 400; }
thead th { padding: 8px 12px; color: var(--dim); font-size: 13px; white-space: nowrap; }
thead th:first-child, tbody th { padding-left: 0; }
tbody th {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 120px;
  padding: 8px 12px 8px 0;
  background: var(--paper);
  font-weight: 600;
}
td a { display: block; min-width: 14ch; padding: 8px 12px; text-decoration: none; }
td.number a { min-width: 0; }
.number { text-align: right; white-space: nowrap; }
td a:hover, td a[aria-current] { background: var(--hover); }
td a.missing { color: var(--dim); }
.scope { max-width: 68ch; margin: 24px 0 0; font-size: 13px; color: var(--dim); }

.evidence {
  display: none;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 400px;
  max-width: 100%;
  padding: 20px;
  overflow-y: auto;
  border-left: 1px solid var(--line);
  background: var(--raised);
}
.evidence:target { display: block; }
.evidence:focus { outline: none; }
.evidence h2 { margin: 0; font-size: 13px; font-weight: 400; color: var(--dim); padding-right: 56px; }
.close { position: absolute; top: 20px; right: 20px; font-size: 13px; color: var(--dim); }
.value { margin: 8px 0 16px; font-size: 22px; line-height: 1.3; overflow-wrap: anywhere; }
blockquote { margin: 0 0 16px; padding-left: 12px; border-left: 2px solid var(--line); overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0 0 16px; font-size: 13px; }
dt { color: var(--dim); }
dd { margin: 0; overflow-wrap: anywhere; }
.checked { margin: 0 0 16px; padding: 0; list-style: none; font-size: 13px; }
.checked li { overflow-wrap: anywhere; }
.rule { margin: 0; font-size: 13px; color: var(--dim); }

@media (max-width: 640px) {
  .lead { margin-top: 32px; }
  tbody th { min-width: 0; max-width: 38vw; }
  td a { min-width: 12ch; }
  .evidence {
    top: auto;
    left: 0;
    width: auto;
    max-height: 70vh;
    padding: 16px;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .close { top: 16px; right: 16px; }
}
`;
