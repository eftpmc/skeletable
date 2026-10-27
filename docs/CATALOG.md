# Catalog — technical design

> Status: draft v0.1 · Owner: Zack · Last updated: 2026-10-26
> Companion to [`DESIGN.md`](DESIGN.md). That doc says what the app is; this one says how the catalog underneath it works.

## 1. Summary

**A knowledge base of the internet's shops and what they sell, that grows every day and gets smarter as it grows.** Every product, every store that sells it, new, used and refurbished, with real price history. The app is a place to scroll and save on top of it: a feed, boards, alerts and search.

The catalog is the product. The feed, search, alerts, recommendations and the MCP server all read from it.

**Positioning.** We don't build a shopping chatbot or a browser agent; OpenAI, Google and Meta are racing there with different incentives (ads, partner checkout). We build what they aren't:

- **A place**, not a conversation: a feed and boards you come back to.
- **A memory**: price history, your collection and sizes, your saved hunts.
- **Honest**: no paid placement, and deals verified against our own history.
- **The index itself**, strongest in the independent and resale long tail. Assistants can query it over MCP, so they become a channel, not a competitor.

## 2. Principles

1. **Index broadly, surface selectively.** Search reaches everything we know. The feed shows only what passes the quality bar and fits your taste.
2. **The data is the source of truth.** A model never states a price, stock level or fact the catalog can't back. If a pick can't be resolved to real offers, it isn't shown.
3. **AI where it understands, not where it guesses.** Models read listings once at ingest, embed products, interpret what people type and explain picks. They don't rank every card, and they don't browse the web live for each request.
4. **Measured, not felt.** Every stage has a metric, a hand-labeled test set where needed, and a dashboard. A change that makes a metric worse doesn't ship.
5. **A good citizen.** We identify ourselves, crawl politely, follow robots.txt, honor opt-outs and link to stores' own images. We never route around bot protection; blocked sites need a feed or a partnership instead.
6. **Personal data stays personal.** Activity, saves and taste live in the user's own database. The shared catalog holds only public product data.

## 3. Architecture

```
 discovery ──► store registry ──► crawl planner ──► fetchers (connectors) ──► raw snapshots
 (open data,    (platform,          (budget,          shopify · woo · page reader     │
  add your      quality,            freshness,        · site adapters · APIs          ▼
  shop, links)  crawl state)        priority)         · affiliate feeds · browser  parse & normalize
                                                                                       │
     ┌─────────────────────────────────────────────────────────────────────────────────┘
     ▼
 enrich (attributes, taxonomy, sizes) ──► embed (text + image) ──► match (same product) ──► score (quality, deal)
     │                                                                                          │
     ▼                                                                                          ▼
 catalog: product · variant · offer · store · price_point · brand ◄─────────── search index · vector index
     │
     ├──► search API   ├──► feed API (taste + deals + fresh)   ├──► alerts (saved searches, watches)
     └──► MCP server   └──► catalog sync (self-hosted copies read from the hosted catalog)
```

There is no hand-picked starting list. The catalog bootstraps from the open web, ranked by how the web links to each shop, and grows toward whatever people search for and paste.

Every arrow is a job in a durable queue (pg-boss in Postgres to start). Jobs are idempotent and keyed, so they can retry and re-run. Each stage writes its output with the version of the code that produced it, so changing the enrich or match logic means re-running that stage over existing data, not recrawling.

## 4. Finding stores

No hand-picked starting list. Stores come from the open web and from use:

| Source | What it gives | Notes |
|---|---|---|
| **Web Data Commons** (schema.org extractions from Common Crawl) | Pages with `Product` markup, so a list of domains that sell things | Free, released periodically. The bulk bootstrap. |
| **Common Crawl web graph** | Host-level rank (PageRank-style) from how the web links to each site | An objective, uncurated order to crawl in: most-linked shops first. |
| **Demand** | Stores behind live-source results (eBay, Best Buy, APIs) for what people search | The catalog gets deepest where people look. |
| **Pasted links** | A store we don't know | Detect the platform; if it's crawlable, add the whole store. |
| **Shop-to-shop links** | Brand "stockists" and "where to buy" pages, links to collaborators and sister brands | Crawling outward surfaces independent shops that web rank undervalues. |
| **Profiles and link-in-bio** | Instagram profile, Linktree → the brand's store | How small brands from Instagram get in with one paste. |
| **Add your shop** | Stores submit themselves | Free listing for indie brands; the supply side of the network. |
| **Affiliate networks** | Full catalogs from large retailers and brands | Impact, CJ, Rakuten, Awin. Approval per retailer, usually after launch. |
| **Marketplace APIs** | eBay, Etsy, Best Buy | Live queries plus periodic pulls for watched products. |

**Crawl budget split.** Web rank alone favors big brands. A fixed share of the crawl budget goes to stores found through demand, pasted links and shop-to-shop links (the long tail), so independent shops are never crowded out.

**Platform detection** runs on every new domain: Shopify (`/products.json`, `cdn.shopify.com` assets), WooCommerce (`/wp-json/wc/store/products`), BigCommerce, Squarespace, Wix, or custom. The result picks the connector.

## 5. Connectors

Cheapest first; a store uses the first rung that works.

| Rung | Connector | Cost | Coverage |
|---|---|---|---|
| 1 | **Platform feed**: Shopify `/products.json` (250 per page), WooCommerce Store API | Very low | Millions of Shopify stores, many Woo stores |
| 2 | **Page reader**: sitemap → product pages → schema.org `Product` JSON-LD / microdata | Low (one request per product) | Most of the rest of the web |
| 3 | **Site adapter**: per-site parser for embedded state (e.g. Uniqlo's `__PRELOADED_STATE__`) | Low per page, maintenance per site | High-value custom sites |
| 4 | **Headless browser** (Playwright, ours or hosted) | 10–100× rung 2 | Sites that only render products with JavaScript |
| — | **APIs and affiliate feeds** | Varies | Marketplaces, large retailers |

Each connector returns the same `RawListing` shape (store, URL, title, brand, variants with size, color, price, compare-at price, stock, images, identifiers), so everything downstream is shared. This is the same pattern as today's search sources, extended from "answer a query" to "list a store".

**Example (checked 2026-10-26):** Uniqlo US publishes a sitemap with 1,908 product URLs. Product pages load for a plain request and embed full product state (price, sale price, sizes), so it needs a rung-3 adapter. The homepage returns 403 to plain requests; we use the sitemap and product pages, not the homepage.

## 6. Crawling and freshness

- **Budget-driven planner.** Each store has a crawl interval that it earns: watched and popular products daily, active stores weekly, the long tail monthly, dead stores dropped. The interval adapts to how often a store's prices actually change.
- **Incremental.** ETags and Last-Modified where offered; product content hashes so unchanged products skip enrich and embed.
- **Polite.** One concurrent request per host, a per-host delay, an identifying User-Agent with a contact URL, robots.txt followed, and an opt-out list honored at the planner.
- **Change events.** A changed price, a restock or a new product emits an event. Alerts, the feed and deal detection consume these instead of rescanning.

Rough scale: 100,000 good stores × 500 products is 50M products. A weekly pass over Shopify-style feeds is about 200k requests per pass, well within a small worker pool.

## 7. Pipeline

1. **Parse and normalize.** Units, currency, condition vocabulary, URL canonicalization, image URL normalization.
2. **Enrich (model, once per new or changed product).** Category in our taxonomy, color, material, style tags, gender and fit, size system, condition detail for used items. A small, cheap model reads title, description and the main image and returns structured fields with a confidence. Low-confidence fields are left empty rather than guessed. **Today:** department (women, men, unisex) and category (18 of them, in four groups: `packages/shared/src/taxonomy.ts`) for every catalog product, from the store's own words first and a classifier on the photo vector for the rest, with held-out accuracy reported on each build ([lab/brands/README.md](../lab/brands/README.md#products-and-categories)). Products the classifier isn't sure of are left out rather than misfiled.
3. **Embed.** One text vector and one image vector per product, from an embedding model (open models like CLIP-style image encoders self-host well). Re-embedded only when the content hash changes.
4. **Match.** Decide which listings are the same product (section 9).
5. **Score.** Store and product quality (section 10), and deal strength from price history.

## 8. Data model

New and changed tables, extending what exists:

| Table | Key fields |
|---|---|
| `store` | + platform, connector, crawl_interval, last_crawled_at, next_crawl_at, product_count, quality_score, web_rank, discovered_via (wdc / demand / link / stockist / submit / affiliate), robots_ok, opted_out |
| `store_link` | from_store_id, to_store_id, kind (stockist / collab / outbound), seen_at |
| `crawl_run` | store_id, started_at, finished_at, pages, products_seen, changed, errors |
| `listing` | One product page at one store (today's `offer`, widened): store_id, url, title, brand, description_hash, images, identifiers, product_id |
| `variant` | listing_id, size, color, sku, gtin, price_cents, compare_at_cents, currency, in_stock, last_seen_at |
| `price_point` | variant_id, price_cents, in_stock, seen_at (written on change or daily) |
| `product` | Canonical product: brand_id, title, model, category, attributes (json), gtin, image, text_embedding, image_embedding |
| `match_decision` | listing_id, product_id, method (gtin / model / vector / model-verified / human), confidence, decided_at |
| `event` | kind (price_change / restock / new_product / delisted), variant_id or listing_id, before, after, at |
| `interaction` | user_id, product_id, kind (impression / tap / dwell / save / track / buy_click / hide / more_like / not_for_me), reason, position, surface, at |
| `taste_profile` | user_id, label, vector, weight, updated_at (a few per user) |

Vectors live in pgvector with HNSW indexes and half-precision storage. Postgres plus pgvector carries us to tens of millions of products; past that, a dedicated vector store and read replicas.

## 9. Recognizing the same product

The step that turns listings into knowledge. In order of trust:

1. **Identifiers.** GTIN, UPC or EAN match: same product (variants grouped by size and color).
2. **Brand plus model code.** "WH-1000XM5", "DRY-EX polo 445174": strong, normalized as today.
3. **Vectors.** Nearest neighbors on image and text within the same brand and category, giving candidates.
4. **Model verification.** For candidates in the uncertain band, a model compares the two listings and answers same / different / unsure. Unsure stays separate.
5. **Human review.** A small queue of disputed matches, used to grow the test set.

Matching never merges across brands without an identifier. False merges ("same jacket" that isn't) hurt trust more than missed ones.

## 10. Quality and trust

- **Store quality score.** Age, catalog originality (duplicate images across unrelated stores signal dropshipping), price stability, broken links, delist rate, whether it's a known brand or reseller, and human flags. Below the bar, a store is searchable but never in the feed.
- **Image fingerprints.** Perceptual hashes find stolen and duplicated photos across stores.
- **Deal truth.** A "deal" needs our own history: current price at or near the 60-day low, or a real drop since we last saw it. A store's compare-at price is shown as "store says was $X" and never counts on its own. We track the share of deal labels that hold up.
- **Fresh or hidden.** An offer not confirmed within its freshness window shows "last seen 3 days ago"; past a hard limit, it's hidden.

## 11. Search

Hybrid retrieval over the catalog: full-text (Postgres `tsvector`, brand and title weighted) plus vector search on the query embedding, merged and re-ranked by relevance, quality and price. Live sources (eBay, Best Buy) still run alongside and their results are stored, so search keeps growing the catalog. Target: p95 under 300 ms for catalog results; live sources stream in after.

## 12. Feed and personalization

**Candidates** (a few hundred per refresh), drawn from:
- products near the user's taste profiles (vector search)
- verified deals in their categories and sizes
- new arrivals from saved stores and brands
- saved-search matches and watched-product drops (the alerts system)
- exploration: popular items just outside their taste

**Ranking v1** is a weighted score (taste similarity, deal strength, freshness, quality) with variety rules: no more than N from one store or category in a row. **v2** (hosted) is a model learned from everyone's anonymous interactions, with position bias corrected.

**Signals**, strongest first: buy click, save, track or add to a board, dwell on the product page, tap, impression without a tap (weak; only meaningful in bulk), hide (strong negative).

**Controls**, kept light rather than thumbs on every card:
- **More like this** and **Not for me** on each card's menu (long-press on phones). "Not for me" asks one optional reason: style, price, brand, already have one.
- **Taste quiz at sign-up:** about 20 quick swipes across styles, plus sizes. Fixes the empty-feed problem.
- **Steer by typing:** "less techwear, more vintage, nothing over $150". A model turns the text into changes to taste weights and filters.

**Taste model.** A few profiles per person (interest clusters, not one average: streetwear and ceramics don't blend). Each is a vector that moves toward saved items and away from hidden ones, with older activity weighing less. A fixed share of each page goes to exploration so the feed never closes in.

**Transparency.** "Why am I seeing this?" on any card ("Because you saved 3 Arc'teryx jackets · 40% under its usual price"), and an Interests page where people see and remove what the feed thinks they like.

**Privacy.** Interactions stay in the user's database (local when self-hosted). Only anonymous aggregates train shared ranking, opt-in for self-hosted copies.

## 13. AI: where and where not

| Use | When it runs | Notes |
|---|---|---|
| Enrich listings (attributes, taxonomy, sizes) | Once per new or changed product, in the background | Small, cheap model; structured output with confidence |
| Embeddings (text and image) | Once per new or changed product | Dedicated embedding model; local options for self-host |
| Match verification | Only for uncertain candidate pairs | Bounded by the uncertain band's size |
| Interpret typed queries and steering | Once per query or instruction | Turns text into filters plus a query vector |
| "Why" lines and research summaries | Generated once, cached | Always built from catalog facts |
| Identify a product from a photo or screenshot | Per upload | Vision model, then catalog lookup |
| **Not:** ranking each card, stating prices, browsing live per request | | Too slow or costly per item, or untrustworthy |

**Self-hosting modes:** hosted AI (the instance's own API keys), local (Ollama for text models and embeddings), or off. With AI off: full-text search, identifier and model-code matching, rule-based deals. Still useful, just less clever.

## 14. Hosted and self-hosted

- **Hosted** runs the full pipeline over the whole catalog and serves a **catalog sync API**: public product, store and price data only, versioned, incremental.
- **Self-hosted** copies either sync from the hosted catalog to start large, or start empty and grow from their users' searches and pasted links. No starting list either way. Personal data never leaves the instance.
- **Optional contribution:** a self-hosted copy can share anonymous price observations and new stores back, opt-in.

## 15. Measurement

Built in phase 1, before the catalog gets big.

| Metric | How | First target |
|---|---|---|
| Coverage | Share of a hand-picked set of 500 stores per category we index | 90% of the set |
| Freshness | Median age of the price shown for feed items | < 24 h |
| Stale shown | Share of clicked offers that turned out sold out or repriced | < 3% |
| Match precision / recall | Hand-labeled test set of 2,000 listing pairs, run automatically on every change | Precision ≥ 98%, recall ≥ 85% |
| Enrich accuracy | 500 hand-labeled products: category, color, size system | ≥ 95% category, ≥ 90% others |
| Deal truth | Share of "deal" labels verified against history on a weekly sample | ≥ 95% |
| Feed junk rate | Weekly human review of 200 random feed cards | < 2% |
| Search relevance | Fixed set of 200 queries with judged results (nDCG@10), run like tests | Improves release over release |
| Feed engagement | Save rate per session, return rate, scroll depth | Baseline first, then improve |
| Pipeline health | Queue lag, job failure rate, crawl cost per 1,000 pages | Dashboards and alerts |

## 16. Crawling policy

- User-Agent: `<name>-catalog/<version> (+<url>/crawler)`, with a page explaining what we do and how to opt out.
- robots.txt is followed; an opt-out request removes a store within 24 hours.
- Per-host limits: one request at a time, with a delay that grows if the host slows down or errors.
- Images are linked from the store, not copied. Descriptions are used for enrichment and not republished wholesale.
- No residential proxies, no fingerprint spoofing, no CAPTCHA solving. A site that blocks crawlers needs a feed, an affiliate relationship or a partnership.

## 17. Infrastructure by stage

| Stage | Catalog size | Setup |
|---|---|---|
| Now | < 1M products | One app service (web plus workers) and one Postgres with pgvector, on Railway Hobby or above (no sleep) |
| Growth | 1–20M | Separate worker service for crawl and enrich; larger Postgres; object storage for raw snapshots |
| Scale | 20M+ | Crawler fleet, read replicas, dedicated vector store, a warehouse for interaction logs |

## 18. Phases

Each phase stands on its own and ends with measurable exit criteria.

| Phase | Scope | Exit criteria |
|---|---|---|
| **C1 Foundation** | Job queue (pg-boss) replacing the in-process scheduler; connector framework; Shopify feed, page reader and a Uniqlo adapter; store registry with platform detection; crawl planner; discovery from demand, pasted links and stockists pages; quality score v0 (it gates everything, since nothing is hand-picked); `listing` / `variant` / `price_point`; measurement scaffolding | The catalog grows on its own from searches and links; first 1,000 stores crawled nightly; dropshipping filter measured on a labeled sample; dashboards live |
| **C2 Understanding** | Enrich, embeddings, matching v1, quality score v1, deal truth | Match and enrich targets met on test sets |
| **C3 Feed** | Feed API, interactions, taste profiles, controls, explanations; Home becomes the feed; taste quiz | Feed junk rate < 2%; save rate baseline set |
| **C4 Discovery at scale** | Web Data Commons import ranked by the Common Crawl web graph, platform detection at scale, add-your-shop, link-in-bio resolution | 10k stores indexed, long-tail share of the budget held, freshness target met |
| **C5 Network** | Catalog sync API for self-hosted copies, MCP read tools on the catalog, affiliate feeds | One self-hosted copy syncing; one assistant using the MCP tools |

## 19. Open questions

1. **Launch categories.** Best index of a few categories (fashion and home, indie plus brands like Uniqlo) first, or breadth from day one?
2. ~~**Seed list.**~~ Decided: no hand-picked list. The catalog bootstraps from the open web (web-graph rank) and grows from demand, links and stockists pages.
3. **Embedding model.** Hosted embeddings vs. open models we run ourselves; this decides the cost per product and self-host parity.
4. **Affiliate timing.** When to apply to networks, and whether affiliate feeds count as an independent data source or a partnership.
5. **Catalog sync terms.** Free for self-hosted copies, or a paid tier above some volume?
6. **Coupons.** Left out for now; revisit only with verified codes.

## 20. Risks

| Risk | Mitigation |
|---|---|
| Junk floods a broad index | Quality score gates the feed from phase C1; image fingerprints catch dropshipping |
| Web rank favors big brands | A reserved share of crawl budget and feed exploration for long-tail shops |
| False product matches erode trust | Conservative merging, model verification, a test set run on every change |
| Stores block or object | Polite crawling, fast opt-out, affiliate and partnership paths |
| Costs grow with the catalog | Tiered freshness, content hashes to skip unchanged work, per-item AI only at ingest |
| A big platform builds the same feed | Independence: every store, used and refurb, real price history, no ads, self-hostable |
