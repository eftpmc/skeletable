# Design Doc — working name TBD

> Status: draft v0.2 · Owner: Zack · Last updated: 2026-10-26
> v0.2 replaces the closet-first plan (v0.1) with a search-first shopping app for any product.
> Design canvas (round 4 is current): https://claude.ai/artifact/TPisFH2xJrgToKDWu5DTgb
> The catalog underneath (crawling, matching, feed, measurement): [`CATALOG.md`](CATALOG.md).

## 1. Summary

**One search for every store.** Type what you want, paste a link or snap a photo, and see it from every store: new, used and refurbished. The app tells you whether a price is good, watches prices and searches for you, and pings you when something shows up or drops.

It works for **any product**: clothes, sneakers, tech, gaming, home, gear. You buy from the seller, not from us.

It runs in **our cloud** (sign up and go) or **self-hosted** (`docker compose up`), and the same apps work with both. AI works **behind the scenes** for image search, matching the same product across stores, and tagging. **Chat** happens in the user's own assistant through **MCP**.

Main design reference: **Gem** (one search across resale sites, saved-search alerts, a quiet white UI). Look: **Cosmos**-style black-and-white image grid.

## 2. Principles

1. **Search is the product.** The app opens on a search bar. Everything else (alerts, saved items, verdicts) comes from searching.
2. **Restraint.** White background, system font, black type, real photos. Color comes from the products. The only accent is a red "new" dot.
3. **Answer, don't list.** Each product shows one clear verdict and one best price. The full comparison is one tap away.
4. **New, used and refurb are equal.** The cheapest good option is often secondhand. Show it right next to new.
5. **We work for the shopper.** No sponsored results and no paid ranking. Affiliate links are disclosed and never change the order.
6. **Your data is yours.** Full export, self-hosting as a first-class option, no tracking for ads.

## 3. Target user

Starting persona: **a 20-something who buys things online regularly and hates overpaying or digging through ten tabs**. They know roughly what they want (headphones under $250, a specific sneaker in their size, a used camera) and want the best option without the work.

Later: anyone who shops online, plus self-hosters who want a private price tracker.

## 4. Product

### 4.1 Navigation — four icon tabs, no labels

| Tab | Purpose |
|---|---|
| **Discover** | Where signed-in people land. A feed of products from small brands, all of it or one category at a time; open what you like the look of and the feed learns your taste from the time you spend. Save tracks an item's price |
| **Camera** | Point at anything (or pick a screenshot) and search by image |
| **Alerts** | **New:** feed of price drops and new matches · **Searches:** saved searches by channel (push, morning email) and watched prices |
| **Saved** | Products you're tracking, grouped by day, with price drops |
| **Collection** | What you already have, with sizes, receipts and what it's worth used |

Search isn't a tab. The search box sits in the header on every page (along the bottom on phones, where thumbs are; it tucks away while you scroll down). It opens a palette, also on `/` or ⌘K: recent and saved searches before you type; while typing, search every store first, then what you already have that matches (tracked products with today's price, saved searches, recent searches, brands). A pasted link becomes "Find this product everywhere". Results and products belong to no tab.

The account button at the foot of the sidebar opens a menu: who you are (and your role), Settings, help, and sign out. Owners and admins find the server sections inside Settings. **Settings** is one page of sections, each at `/settings/<section>`: a list beside the section on wide screens, a list then a page on phones. *You*: Account (name, password, sign out), Notifications, Appearance, Sizes & fit, Your data. *Server* (owners and admins only): Overview (counts and what's switched on), Stores (Shopify shops by address, eBay and Best Buy keys, stored encrypted and applied without a restart), Members (the owner makes admins). A new section is one entry in the list in `routes/settings/SettingsPage.tsx`.

**Frame (wide screens).** The sidebar sits on a `surface` backdrop and the page is a rounded `canvas` panel inset 8px from the window, with a hairline border; the panel scrolls, the frame stays still. Phones keep the full-bleed layout.

**Status** is a mark plus words: a filled ink circle with a check for on or connected, an outlined circle with an X for off. Never color or a dot alone.

**Headers** are sentence case. No all-caps labels anywhere.

**Brand.** The signed-out front page's halftone (the theme color with black printed off-register, on paper) shows up in small doses when signed in: a faint corner on empty states. The wordmark stays plain text. One per view, never behind body text it would muddy.

**Roles.** The first account on a server is its **owner**. The owner can make others **admins**, who set up stores too; everyone else is a **member**. Anything set in the server's environment shows in the admin sections as read-only.

### 4.2 Key screens (canvas round 4)

- **Front page (signed out):** "Find anything, from every store." A big search bar (also takes links), black category chips (Sneakers, Tech, Clothing, Home, Used & refurb), then what the product is and a way to sign up.
- **Signed in, there's no Home:** `/` opens Discover. Search is in the header everywhere, and new matches and drops have Alerts and Saved.
- **Discover:** a masonry feed of products from small brands (photos at their natural shape, a price pill, the title and the brand), loading more as you scroll. Category chips above it (All, then every category with something in it, in the taxonomy's order) narrow it to one; the first visit also asks once what you shop for (Womenswear, Menswear, Everything; unisex shows either way). It's ranked by how close each product's look is to your taste, lower when it's over your price cap, shuffled a little per visit, and never shows one brand twice in a row. An item opens beside the feed on wide screens (arrows step through) and in a pull-down sheet on phones: big photo, brand (to its page), title, price, **Buy at [brand]**, **Save** (reads the product page and tracks its price, so it lands in Saved and Alerts), then *More from [brand]* and *More like this*. Taste is passive: time with an item open counts toward that item's look, and time on a brand page toward the brand's; a look of 8s+ or a second visit counts about half a heart, quick bounces count nothing, and a save counts as a heart. **Settings → Discover** holds the rest: shop for, a price to stay under (over it ranks lower, never hidden), and categories to leave out of the feed. The feed is personal from the first item you open. Brand pages keep "Not for me" and "Not a real brand" in a "…" menu.
- **Results:** the query as the title, the count under it, then one filter bar on every screen (it stays in view while you scroll): **Condition**, **Price** and **Sort** as pills that open their choices, filled with ink and naming the choice once set ("Under $250"), **Clear** when any filter is on, and **Save search** at the end. The grid takes the full width. A product opens beside the grid on wide screens (step through with the arrows or j/k) and in a sheet you pull down to close on phones; both keep your place and link to the full page. Small labels like *Good price*, *Refurb* or *Used · like new* appear on photos only where they help.
- **Product:** a large photo with save and back. Brand and short model name. A **New / Refurb / Used** switch, each with its best price, drives a big price, the store, and a one-line verdict. Then "Compare all 14 stores", and at the bottom **Track price** plus **Buy at [store]**.
- **Alerts:** Gem-style cards ("12 NEW" with three photos) and price-drop cards. The Searches tab holds iOS-style grouped lists with counts and red dots.
- **Saved:** a photo grid with price pills grouped by date.
- **Collection:** items you have, with estimated resale value ("38 items · worth about $1,900").

### 4.3 Core flows

**Search**
1. Type, paste a link or use the camera.
2. The server queries every enabled source at once, normalizes results into offers, groups offers for the same product, and ranks them by relevance, then price.
3. Results stream in. The count and grid update as sources answer.

**Paste a link** (carries over from the Phase 1 importer)
- The server reads the product page (JSON-LD / OpenGraph / Shopify), finds the product's identifiers (GTIN/UPC, MPN, brand plus model), then searches every source for the same product. It opens the product page with all the offers.

**Price verdict**
- From the price history we record for that product and condition: current price vs. the 60-day low, the median and the typical used price.
- Labels: *Good price* (at or near the 60-day low), *Typical*, *High* (well above the median). Plus one plain sentence: "Lowest in 60 days", "Usually $349 new, ~$180 used".
- With no history yet, compare against the other current offers instead ("$19 below the next cheapest").

**Save search → alerts**
- Saving stores the query, filters and your size. A background job re-runs it on a schedule, diffs against listings it has already seen, and creates "N new" events.
- Delivery: push (app), a morning email digest, and ntfy/Apprise for self-hosters.

**Track a product**
- Saving or tracking a product records prices across its offers over time. Drops below your target, or meaningful drops (more than 5% or $10 by default), create alerts.

**Own it**
- "I own this" (or a purchase found in a forwarded receipt) moves a product to **Collection**, with the price paid. Resale value comes from current used offers.

**Share extension (native app)**
- In Safari or any store app, tap Share → our app to search everything for that product, or save it.

### 4.4 Sizes

You set your sizes once (shoe 10, tops M, waist 31, plus per-brand fit notes, carried over from Phase 1). Results and alerts filter by them automatically when a category uses sizes.

## 5. Where results come from (the hard part)

Search quality depends on sources. Each source is an adapter with the same interface: `search(query, filters) → offers[]` and `lookup(identifiers) → offers[]`.

| Source type | Examples | Notes |
|---|---|---|
| Official retail and marketplace APIs | eBay Browse API, Best Buy Products API, Etsy, Walmart/Target affiliate APIs, Amazon Product Advertising API | The most reliable. Most need an API key, and some require affiliate status or minimum sales. |
| Shopping search APIs | Paid Google Shopping result providers | Broad coverage fast, but costs per query. Cloud-only, or a self-hoster's own key. |
| Shopify stores | Public product JSON of stores we index | Covers a huge long tail of indie and secondhand stores, which is how Gem-style coverage works. |
| Resale marketplaces | eBay, Depop, Grailed, Poshmark, Back Market, Swappa, StockX/GOAT | Use official APIs or partner feeds where they exist, and respect terms where they don't. |
| User links | Any product page | The Phase 1 importer. Each link also adds to our catalog. |

**Go upstream, not to aggregators.** The more valuable a site's data, the harder it guards it, so nothing here depends on sites that block bots. Marketplaces and aggregators (Zillow-style sites, Depop, Grailed, Vinted) are reached through an official API or not at all. We read the original sources that want to be found: brands' own stores. Coverage is less than 100%, and that is the accepted trade.

- **Cloud:** we hold the keys, cache results aggressively and earn affiliate revenue.
- **Self-host:** a **Sources** settings page where users plug in their own keys (eBay and Best Buy are free). Shopify and link import work with no keys at all.
- **Matching the same product:** identifiers first (GTIN/UPC/EAN, then MPN plus brand). Fall back to brand plus normalized model name, then image embedding similarity. Low-confidence matches show as "similar", never as the same product.
- **Rules:** official APIs before scraping, rate limits, caching, honest User-Agent, and drop any source on request.

## 6. Platforms

**Decision: Expo (React Native) for iOS and Android, plus React for web, all TypeScript.** It shares code (types, API client, validation) with the server and web. It's one language, and it can still feel native.

Native where it counts:
- **Expo Router native tabs** (the real UITabBar, including the iOS 26 glass look), native search bars, sheets and context menus.
- **SF Symbols** through `expo-symbols`. **Expo UI** (`@expo/ui`) for real SwiftUI controls where they're needed.
- **`expo-image`** plus FlashList for fast photo grids, and haptics.
- **Native targets in Swift** for a **share extension** (core), **widgets** ("3 price drops today") and, later, Live Activities.

We'd reconsider pure SwiftUI only if the app became iPhone-only.

**Feature parity:** core features (search, product, alerts, saved, collection) everywhere. The phone does camera search, the share extension and push best. The web does bulk management, source keys, export, admin and MCP setup best.

## 7. Architecture

```
            ┌── iOS / Android (Expo)  ── share extension, widgets (Swift)
 Clients ───┼── Web (React + Vite)
            └── AI assistants via MCP
                         │
           server URL: cloud (default) or self-hosted
                         │
        ┌────────────────┴──────────────────┐
        │ Server (TypeScript, Hono)         │
        │ API · auth · /mcp                 │
        │ search fan-out → source adapters  │
        │ jobs: saved searches, price checks│
        └───┬───────────┬───────────┬───────┘
        Postgres     File storage   AI provider
        + pgvector   disk | S3/R2   cloud | Ollama | off
```

- **Deployments:** unchanged from v0.1. Cloud (our keys, OAuth, R2, push) or self-hosted (Docker, the user's keys, local disk, ntfy).
- **Front door:** the cloud's landing page is the search itself. Signed-out visitors can search and open products (rate limited per address); saving, tracking, alerts and Collection ask them to sign up and bring them back. What the app does sits under the search bar. A self-hosted server is private: sign-in only, and the first account to sign up owns it and closes sign-ups behind it. `PUBLIC_SEARCH` and `SIGNUPS_ENABLED` switch either behavior on any server. Later, public search can grow into a search engine of its own (browser search provider, public product pages for search engines).
- **Repo:** `apps/server`, `apps/web`, `apps/mobile` (Expo), `packages/shared`, `packages/db`.
- **Stack:** Hono, Drizzle, Postgres + pgvector, pg-boss (jobs), Better Auth, sharp, React + Vite + Tailwind, Expo + Expo Router.

## 8. Data model (v0.2)

Phase 1 tables carry over: `item` becomes **owned**, `media`, `brand`, `brand_fit` (sizes), `wear_log` (optional, may retire).

| Table | Key fields |
|---|---|
| `product` | id, brand_id, title, model, category, gtin, mpn, image, embedding |
| `store` | id, name, domain, kind (retail / marketplace / indie), source |
| `offer` | id, product_id?, store_id, url, title, price_cents, currency, condition (new / refurb / used), size?, image, in_stock, first_seen, last_seen |
| `price_point` | offer_id, price_cents, seen_at |
| `saved_search` | id, user_id, query, condition, max_price, last_run_at, last_viewed_at |
| `saved_search_seen` | saved_search_id, offer_id (to diff for "N new") |
| `watch` | user_id, product_id, condition?, target_price_cents?, created_at |
| `alert_event` | id, user_id, kind (new_matches / price_drop / back_in_stock), payload, read_at, pushed_at, emailed_at |
| `notify_settings` | user_id, ntfy_url, email_digest, timezone, last_digest_at (channels are per person, not per search) |
| `item` (owned) | + product_id?, paid_cents, category (general taxonomy) |
| `user_size` | user_id, kind (shoe / top / waist / …), value |
| `source_key` | user_id or instance, source, encrypted credentials (self-host) |
| `push_token`, `api_token` | for devices and MCP |

**General categories:** Clothing, Shoes, Bags & accessories, Tech, Gaming, Home, Outdoors & sports, Beauty, Other.

## 9. AI (behind the scenes)

Search quality is the immediate priority. Dedicated voice input is deferred: phone
keyboards already provide dictation. Image plus text and aesthetic discovery should
build on the same search pipeline, keeping exact-product comparisons separate from
similar-product recommendations.

The first reliability pass tightens model-code boundaries, keeps bundled products
from being rejected as accessories, excludes sold-out offers from search cards, and
prevents conflicting identifiers or ambiguous fallback matches from grouping new
offers. Existing offer-to-product assignments are retained; this does not repair
historical merges. Regression cases live in the server search tests.

AI interpretation is experimental and disabled by default. The earlier phrase
parser has been removed: ordinary searches use literal keywords and user-selected
filters. A configurable model can propose requirements, preferences and uncertain
attributes for descriptive requests. Proposals are validated, visibly editable,
and frozen for saved searches. Strict budgets preserve cents and currency;
preferences influence ranking without excluding offers. Attribute matching is
explicitly unverified. See [SEARCH-INTENT.md](SEARCH-INTENT.md) for limits and the
evaluation required before enabling this path. No live model evaluation has run.

Next search work: catalog retrieval with fast initial results; image plus text
refinement. Size, currency,
variant availability and offer freshness need explicit handling before promising
that a result satisfies every shopping constraint. Vibe search should propose
interpretations people can refine, rather than silently treating inferred taste
as a hard filter.

- **Image search:** describe the photo (vision model) → query plus attributes, and image-embedding similarity against our catalog.
- **Matching:** embeddings and rules to group offers into products when identifiers are missing.
- **Tagging:** category and attributes for owned items and products.
- **Provider switch:** cloud, Ollama or off. With AI off, search still works by text, link and identifiers.

## 10. MCP

Same approach as v0.1, retargeted at search:

| Tool | Scope | Purpose |
|---|---|---|
| `search_products` | read | One search across every source, with filters |
| `get_product` | read | Offers, verdict and price history |
| `list_saved` / `list_owned` / `list_alerts` | read | |
| `save_search` / `track_product` | write | Create alerts from chat ("tell me when a used XM5 is under $180") |
| `mark_owned` | write | "I just bought these" |

Auth: OAuth on cloud, tokens for self-host, writes opt-in.

## 11. Business model (cloud)

- **Affiliate commissions** on purchases through **Buy at [store]**, disclosed, and never affecting ranking.
- **Free:** search, saving, a few saved searches.
- **Paid:** unlimited alerts, faster checks, price history charts, receipt import.
- **Self-host:** free and open source (AGPL proposed). Users bring their own source keys.

## 12. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 Foundation | Monorepo, auth, Docker, CI | ✅ done |
| 1 Closet | Items, link import (JSON-LD/Shopify, SSRF-safe), images, sizes, export | ✅ done, becomes **Collection** and the link importer |
| 2 Search core | Source adapters (eBay, Best Buy, Shopify index, link), search API with fan-out, results + product pages on web, offers and price history, verdict v0 | ✅ done. Matching handles model codes, nicknames and generations ("sony xm5", "ps5 slim", "airpods pro 2"), judged on `apps/server/test/search-queries.ts`. On the cloud, signed-out visitors can search (rate limited). |
| 3 Alerts | Saved searches, watches, scheduler, alert events, email digest, ntfy | ✅ done: in-app feed, ntfy pushes, morning email digest (SMTP or Resend). Left for later: back-in-stock and target-price alerts. |
| Catalog | Brand discovery and the product catalog ([CATALOG.md](CATALOG.md)) | First slice done: Discover, brand pages, votes, For you, catalog pack shipped in the image. C1 connector foundation added: Shopify and generic product pages share a contract, with temporary-store states and snapshot retention ([details](CONNECTORS.md)). Next: job queue, durable observations and scheduled crawling. |
| 4 Mobile | Expo app: search, results, product, alerts, saved/collection, push, share extension | next |
| 5 Camera + matching | Image search, AI matching and tagging | |
| 6 MCP | Read tools, then write tools | |
| 7 Cloud launch | Affiliate links, billing, OAuth MCP, App Store | Started: deployed on Railway, public front door. Small next steps toward being a search engine: an OpenSearch file so browsers can add skeleton, then server-rendered product pages so search engines can index them. |

## 13. Open questions

1. **Name and brand.** Working name **skeleton**, possibly a play on it.
2. **First sources:** eBay plus Best Buy plus a Shopify index is free and broad. Is it worth a paid shopping-search API from day one?
3. **Country:** US first (stores, currency, affiliate programs)?
4. **Secondhand weight:** should used results be on by default everywhere, or per category?
5. ~~**Owned:** keep it in Saved or drop it for v1?~~ Decided: it's **Collection**, its own section.
6. **License:** AGPL vs MIT.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Source access (API approval, terms, blocking) | Official APIs first, many small sources, link import as the fallback, cache |
| Bad matches across stores | Identifiers first, show "similar" when unsure, user can unlink |
| Stale prices | Show "checked 2h ago", re-check before buying, background refresh for watched items |
| Affiliate trust | Disclose it, never rank by commission |
| Scope for one developer | Web first for Phase 2–3, mobile in Phase 4 |
