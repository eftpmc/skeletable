/**
 * The page a curator works through what waits for them: proposals (each site with who proposed it and
 * why, and the sample products the hub read) and, for the owner, requests for the curator's role. Every value on it comes from
 * contributors, so it is set as text on elements it builds, never as HTML. It talks to the hub's API
 * with the curator's token, which it keeps in this browser only.
 */
export function curatePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curate</title>
<link rel="icon" href="data:,">
<style>
  :root { --bg: #fafaf9; --card: #fff; --ink: #1c1917; --muted: #78716c; --line: #e7e5e4; --accent: #4f46e5; --good: #15803d; --bad: #b91c1c; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --card: #1c1917; --ink: #f5f5f4; --muted: #a8a29e; --line: #292524; --accent: #818cf8; --good: #4ade80; --bad: #f87171; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; }
  .muted { color: var(--muted); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .grow { flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
  .samples { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
  .samples img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; background: var(--line); display: block; }
  .samples a { color: inherit; text-decoration: none; font-size: 13px; overflow-wrap: anywhere; }
  a { color: var(--accent); }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  button.yes { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .done { color: var(--good); } .error { color: var(--bad); }
  form.token { display: flex; gap: 8px; flex-wrap: wrap; }
  form.token input { flex: 1 1 260px; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
</style>
</head>
<body>
<main>
  <h1>Curate</h1>
  <p class="muted">Approve independent makers and small sellers with their own shop; not marketplaces, resellers or drop-shippers.</p>
  <div id="app"><p class="muted">Loading…</p></div>
</main>
<script>
const app = document.getElementById("app");
let token = localStorage.getItem("hub-token") || "";

// Build an element with text only: nothing a contributor wrote is ever read as HTML.
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : String(child));
  return node;
}
// Links only to http(s) pages, so a contributor can't slip in a script link.
const safeUrl = (u) => { try { const url = new URL(u); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; } };
const money = (p) => p ? new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.amount / 10 ** (new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2)) : "";

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { localStorage.removeItem("hub-token"); token = ""; askToken("That token wasn't accepted."); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function askToken(message) {
  const input = el("input", { id: "t", type: "password", autocomplete: "off", required: "" });
  const form = el("form", { class: "token", on: { submit: (e) => { e.preventDefault(); token = input.value.trim(); localStorage.setItem("hub-token", token); load(); } } },
    el("label", { for: "t", style: "width:100%" }, "Your hub token (a curator's)"), input, el("button", { class: "yes" }, "Start"));
  app.replaceChildren(form, message ? el("p", { class: "error" }, message) : "");
  input.focus();
}

// A decision: both buttons give way to what happened.
function decide(path, approve, yes, no) {
  return (event) => {
    const actions = event.target.closest(".actions");
    actions.replaceChildren(el("span", { class: "muted" }, "Saving…"));
    api("POST", path, { approve })
      .then(() => actions.replaceChildren(el("span", { class: "done" }, approve ? yes : no)))
      .catch((e) => actions.replaceChildren(el("span", { class: "error" }, e.message)));
  };
}
const actions = (path, yes, no, yesLabel = "Approve", noLabel = "Reject") =>
  el("div", { class: "actions row" },
    el("button", { class: "yes", on: { click: decide(path, true, yes, no) } }, yesLabel),
    el("button", { on: { click: decide(path, false, yes, no) } }, noLabel));

async function load() {
  if (!token) return askToken();
  let me;
  try { me = await api("GET", "/api/me"); } catch (e) { if (e.message !== "unauthorized") app.replaceChildren(el("p", { class: "error" }, e.message)); return; }
  if (me.role !== "curator" && me.role !== "owner") { localStorage.removeItem("hub-token"); return askToken("This page is for curators."); }
  const [proposals, applications] = await Promise.all([
    api("GET", "/api/proposals"),
    me.role === "owner" ? api("GET", "/api/applications") : Promise.resolve(null),
  ]);
  const site = (domain) => { const url = safeUrl("https://" + domain); return url ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, domain) : domain; };

  const proposalCards = proposals.map((p) => el("div", { class: "card" },
    el("div", { class: "row" },
      el("div", { class: "grow" }, el("strong", {}, site(p.domain)),
        el("span", { class: "muted" }, " · from " + p.proposer + " · read " + (p.reader === "recipe" ? "with their recipe" : "by the " + p.reader + " reader") + " · " + p.report.read + " of " + p.report.pages.length + " samples read")),
      actions("/api/proposals/" + p.id + "/decision", "Approved: crawled from the next cycle.", "Rejected.")),
    el("p", { style: "margin:8px 0 0;white-space:pre-wrap" }, p.note),
    el("div", { class: "samples" }, p.report.pages.filter((page) => page.reading).map((page) => {
      const img = safeUrl(page.reading.images?.[0]?.url);
      const link = safeUrl(page.url);
      return el("a", { href: link || undefined, target: "_blank", rel: "noopener noreferrer" },
        img ? el("img", { src: img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : el("div", { style: "aspect-ratio:4/5;background:var(--line);border-radius:8px" }),
        el("div", {}, page.reading.title), el("div", { class: "muted" }, money(page.reading.price)));
    }))));

  const applicationCards = (applications || []).map((a) => el("div", { class: "card" },
    el("div", { class: "row" }, el("div", { class: "grow" }, el("strong", {}, a.handle), el("span", { class: "muted" }, " asks to curate")),
      actions("/api/applications/" + a.id + "/decision", "Approved: now a curator.", "Declined.", "Approve", "Decline")),
    el("p", { style: "margin:8px 0 0;white-space:pre-wrap" }, a.note)));

  const section = (title, cards, empty) => [el("h2", {}, title + " (" + cards.length + ")"), ...(cards.length ? cards : [el("p", { class: "muted" }, empty)])];
  app.replaceChildren(
    ...section("Proposals", proposalCards, "No proposals waiting."),
    ...(applications ? section("Requests to curate", applicationCards, "No requests waiting.") : []),
  );
}
load();
</script>
</body>
</html>`;
}
