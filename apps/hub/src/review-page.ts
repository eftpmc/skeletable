import { areas, catalogCategories, categoryGroups, departments } from "@skeleton/shared";

/**
 * The page a person checks a benchmark set on: one listing at a time, its photo and words, the
 * draft's answers filled in. Enter confirms and moves on; any field can be changed first. It talks
 * to the hub's API with the person's token, which it keeps in this browser only.
 */
export function reviewPage(name: string): string {
  const taxonomy = scriptJson({ areas, groups: categoryGroups, categories: catalogCategories, departments });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Check ${escape(name)}</title>
<link rel="icon" href="data:,">
<style>
  :root { --bg: #fafaf9; --card: #fff; --ink: #1c1917; --muted: #78716c; --line: #e7e5e4; --accent: #4f46e5; --good: #15803d; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --card: #1c1917; --ink: #f5f5f4; --muted: #a8a29e; --line: #292524; --accent: #818cf8; --good: #4ade80; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 16px; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 18px; margin: 0; }
  .muted { color: var(--muted); }
  .bar { height: 6px; background: var(--line); border-radius: 3px; margin: 12px 0 16px; overflow: hidden; }
  .bar > div { height: 100%; background: var(--good); width: 0; }
  .item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  @media (max-width: 720px) { .item { grid-template-columns: 1fr; } }
  .photo { width: 100%; aspect-ratio: 4 / 5; object-fit: contain; background: var(--line); border-radius: 8px; }
  h2 { font-size: 17px; margin: 0 0 4px; overflow-wrap: anywhere; }
  .words { max-height: 180px; overflow: auto; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  select { width: 100%; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
  select:focus-visible, button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .changed { border-color: var(--accent); }
  .actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  button { font: inherit; padding: 9px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  .status { min-height: 20px; margin-top: 8px; font-size: 13px; }
  .done { color: var(--good); }
  .error { color: #dc2626; }
  form.token { display: flex; gap: 8px; flex-wrap: wrap; }
  form.token input { flex: 1 1 260px; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
</style>
</head>
<body>
<main>
  <header>
    <h1>Check: ${escape(name)}</h1>
    <span id="progress" class="muted" aria-live="polite"></span>
  </header>
  <div class="bar" aria-hidden="true"><div id="bar"></div></div>
  <div id="app"><p class="muted">Loading…</p></div>
</main>
<script>
const NAME = ${scriptJson(name)};
const TAX = ${taxonomy};
const app = document.getElementById("app");
let token = localStorage.getItem("hub-token") || "";
let items = [];
let at = 0;

const api = async (method, path, body) => {
  const res = await fetch(path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { localStorage.removeItem("hub-token"); token = ""; askToken("That token wasn't accepted."); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
};

function askToken(message) {
  app.innerHTML = '<form class="token"><label for="t" style="width:100%">Your hub token (from <code>hub token &lt;you&gt; person</code>)</label><input id="t" type="password" autocomplete="off" required><button class="primary">Start</button></form>' + (message ? '<p class="status error">' + message + '</p>' : "");
  app.querySelector("form").onsubmit = (e) => { e.preventDefault(); token = app.querySelector("input").value.trim(); localStorage.setItem("hub-token", token); load(); };
  app.querySelector("input").focus();
}

async function load() {
  if (!token) return askToken();
  try { items = await api("GET", "/api/benchmark/" + encodeURIComponent(NAME)); } catch (e) { if (e.message !== "unauthorized") app.innerHTML = '<p class="status error">' + e.message + '</p>'; return; }
  at = Math.max(0, items.findIndex((i) => !i.answer));
  if (items.every((i) => i.answer)) at = 0;
  render();
}

const option = (value, label, selected) => '<option value="' + value + '"' + (selected ? " selected" : "") + ">" + label + "</option>";
const text = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function render() {
  const checked = items.filter((i) => i.answer).length;
  document.getElementById("progress").textContent = checked + " of " + items.length + " checked";
  document.getElementById("bar").style.width = (items.length ? (100 * checked) / items.length : 0) + "%";
  if (!items.length) { app.innerHTML = '<p class="muted">This set is empty.</p>'; return; }
  const item = items[at];
  const start = item.answer || item.draft || { area: null, category: null, department: null, audience: "adults" };
  const i = item.input;
  app.innerHTML = '<article class="item" aria-label="Listing ' + (at + 1) + ' of ' + items.length + '">' +
    (item.image ? '<img class="photo" alt="" src="' + text(item.image) + '">' : '<div class="photo"></div>') +
    '<div><h2>' + text(i.title) + '</h2>' +
    '<p class="muted">' + text([i.maker, i.productType].filter(Boolean).join(" · ")) + ' · <a href="' + text(item.url) + '" target="_blank" rel="noopener noreferrer">open</a></p>' +
    '<div class="words">' + text(i.description || "") + (i.tags.length ? "<p>" + text(i.tags.join(", ")) + "</p>" : "") + '</div>' +
    '<label for="area">Area</label><select id="area">' + option("", "None of these", start.area === null) + TAX.areas.map((a) => option(a.id, a.label, start.area === a.id)).join("") + '</select>' +
    '<label for="category">Category</label><select id="category"></select>' +
    '<label for="department">Cut for</label><select id="department">' + option("", "Not said", start.department === null) + TAX.departments.map((d) => option(d, d, start.department === d)).join("") + '</select>' +
    '<label for="audience">Made for</label><select id="audience">' + option("adults", "Adults", start.audience === "adults") + option("kids", "Kids", start.audience === "kids") + '</select>' +
    '<div class="actions"><button class="primary" id="save">' + (item.answer ? "Save" : "Confirm") + ' <span class="muted" style="color:inherit;opacity:.8">Enter</span></button>' +
    '<button id="back">Back</button><button id="skip">Skip</button></div>' +
    '<p class="status" id="status" aria-live="polite">' + (item.answer ? '<span class="done">Checked.</span>' : item.draft ? "Draft answers filled in; change anything that's wrong." : "No draft; fill these in.") + '</p></div></article>';
  const area = app.querySelector("#area");
  const category = app.querySelector("#category");
  const fillCategories = (keep) => {
    const groups = TAX.groups.filter((g) => g.area === area.value);
    category.innerHTML = option("", "None fits", !keep) + groups.map((g) => '<optgroup label="' + g.label + '">' + TAX.categories.filter((c) => c.group === g.id).map((c) => option(c.id, c.label, keep === c.id)).join("") + "</optgroup>").join("");
    category.disabled = !area.value;
  };
  fillCategories(start.category);
  area.onchange = () => { fillCategories(null); mark(); };
  const mark = () => app.querySelectorAll("select").forEach((s) => s.classList.toggle("changed", (s.value || null) !== (start[s.id] ?? null)));
  app.querySelectorAll("select").forEach((s) => s.addEventListener("change", mark));
  app.querySelector("#save").onclick = save;
  app.querySelector("#back").onclick = () => { at = (at - 1 + items.length) % items.length; render(); };
  app.querySelector("#skip").onclick = next;
  app.querySelector("#save").focus();
}

function next() {
  const open = items.findIndex((x, k) => k > at && !x.answer);
  at = open >= 0 ? open : (at + 1) % items.length;
  render();
}

async function save() {
  const value = (id) => app.querySelector("#" + id).value || null;
  const area = value("area");
  const check = { area, category: area ? value("category") : null, department: area === "clothing" ? value("department") : null, audience: value("audience") };
  const status = app.querySelector("#status");
  status.textContent = "Saving…";
  try {
    items[at].answer = await api("PUT", "/api/benchmark/" + encodeURIComponent(NAME) + "/" + items[at].listingId, check);
    next();
  } catch (e) { if (e.message !== "unauthorized") { status.className = "status error"; status.textContent = e.message; } }
}

document.addEventListener("keydown", (e) => {
  // Buttons and links answer Enter themselves; fields keep it for their own use.
  if (e.key === "Enter" && !["INPUT", "SELECT", "BUTTON", "A", "TEXTAREA"].includes(e.target.tagName) && app.querySelector("#save")) { e.preventDefault(); save(); }
});
load();
</script>
</body>
</html>`;
}

// JSON inside a <script>: "<" escaped, so no value can close the script and start its own.
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
