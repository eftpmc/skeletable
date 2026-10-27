# Coverage audit — 26 October 2026

## Decision

Build a layered acquisition path: official feeds/APIs where accessible, inexpensive
HTTP fetching with stronger extraction, then a browser fallback. **Browser-backed
acquisition merits the next experiment.** Local browser checks recovered storefront
navigation on Kith, H&M and Patagonia after the HTTP baseline failed or returned a
placeholder. This is evidence to test a cloud browser, not a measured cloud-provider
success rate. A larger Shopify-only index would leave significant gaps.

Extraction needs its own work: Palace's product price was present in the raw HTML
but missed by our metadata parser. A browser returning that same HTML would not,
by itself, repair the parser.

## Scope and method

- Purposeful sample: 24 stores/sites, 8 clothing, 5 electronics, 5 home, 6 resale.
  These categories are audit assignments, not claims that each store sells only
  those products. Etsy is included as a marketplace with vintage/secondhand inventory.
- US-oriented entry URLs; one local-machine observation window starting
  2026-10-26 22:29 UTC. Not random, market-weighted, or a market-share estimate.
- Actual current `pageConnector` and `shopifyConnector`, 8-second socket timeout,
  5 MB response limit, at most 3 simultaneous store audits. No credentials.
- Homepage inspection, generic link discovery, Shopify feed discovery only when
  the fetched page contains Shopify signals; at most 2 discovered product reads.
  A bounded robots.txt read collected sitemap leads; no sitemap crawl was run.
- The discovery connectors fetch the entry page again. Brooklinen became
  restricted on those later requests; its initial HTTP 200 is not a successful crawl.
- A usable **basic product** means title and non-null price. Currency, image and
  identifiers are measured separately. This is not variant/stock correctness.
- Diagnostic follow-ups are separate from the baseline: four accessible sites
  with zero discoveries, one Palace raw-HTML check, and four local browser checks.
  The broad Wayfair diagnostic selected category pages and found no product;
  it does not establish that Wayfair product pages are unreadable.

## Measured baseline

| Stage | Stores | Interpretation |
|---|---:|---|
| Initial page classified accessible | 8 / 24 | Includes a Patagonia placeholder |
| Initial HTTP access restriction | 14 / 24 | 403 or 429; cause and persistence unknown |
| Initial timeout | 2 / 24 | Uniqlo and Best Buy; not evidence of no support |
| Discovered at least one candidate product link | 3 / 24 | Palace, Adafruit, IKEA |
| Read at least one basic product | 2 / 24 | Adafruit, IKEA |

Six product reads yielded four basic products. All four had currency and an image;
two had a brand and MPN, none had a GTIN. This tiny first-two-products sample cannot
establish general product accuracy. It exposes the difference between discovery,
extraction, and complete inventory support.

| Store | Category | Initial page | Unique candidate links | Parsed / attempted |
|---|---|---|---:|---:|
| H&M | clothing | restricted | 0 | 0 / 0 |
| Kith | clothing | restricted | 0 | 0 / 0 |
| Noah | clothing | restricted | 0 | 0 / 0 |
| Palace | clothing | open | 30 | 0 / 2 |
| Patagonia | clothing | open, placeholder on inspection | 0 | 0 / 0 |
| Supreme | clothing | restricted | 0 | 0 / 0 |
| Uniqlo | clothing | timeout | 0 | 0 / 0 |
| Zara | clothing | restricted | 0 | 0 / 0 |
| Adafruit | electronics | open | 7 | 2 / 2 |
| B&H | electronics | restricted | 0 | 0 / 0 |
| Best Buy | electronics | timeout | 0 | 0 / 0 |
| Framework | electronics | restricted | 0 | 0 / 0 |
| Newegg | electronics | restricted | 0 | 0 / 0 |
| Article | home | open | 0 | 0 / 0 |
| Brooklinen | home | open, later restricted | 0 | 0 / 0 |
| IKEA | home | open | 10 | 2 / 2 |
| Schoolhouse | home | restricted | 0 | 0 / 0 |
| Wayfair | home | open | 0 | 0 / 0 |
| Back Market | resale | open | 0 | 0 / 0 |
| Depop | resale | restricted | 0 | 0 / 0 |
| Etsy | resale | restricted | 0 | 0 / 0 |
| Grailed | resale | restricted | 0 | 0 / 0 |
| ThredUp | resale | restricted | 0 | 0 / 0 |
| eBay | resale | restricted | 0 | 0 / 0 |

Zero attempted reads means **untested product extraction**, not an extraction
failure. The 24-store denominator measures this limited discovery-to-read path,
not everything the application could access by API or with a supplied product URL.

## Browser comparison and failure diagnosis

| Selected case | Plain HTTP/current parser | Local browser observation | Implication |
|---|---|---|---|
| Kith homepage | 429 | Product links and prices visible | Browser path recovered access |
| H&M homepage | 403 | Storefront/category navigation visible | Browser path recovered navigation; product reads untested |
| Patagonia homepage | 200 placeholder, zero links | Normal storefront/category navigation | HTTP 200 is not sufficient success evidence |
| Palace product | Accessible, parser returns null product | Title, $1,898 and size controls visible | Raw HTML also contains the price: extraction gap |

These are four deliberately selected diagnostic cases, not a browser recovery-rate
sample. The comparison does not isolate JavaScript, headers, cookies, client
fingerprint, timing or network effects. No cloud browser, paid scraping service,
proxy pool, repeated-run reliability, or production cost was benchmarked.

Other observed gaps: Article and Back Market entry pages had navigation but no
links matching current product discovery. Wayfair exposed hundreds of links with
different paths. Palace's public feed did not return an inventory even though its
page contained Shopify assets. Platform signals are hints, not verified API access.

## Freshness and drop brands

No freshness SLA can be established from one run. `checkedAt` measures our fetch
time, not the merchant's last update. `LinkPreview` has no stock/variant fields;
`resolveLink` currently defaults imported offers to `inStock: true` and condition
`new`. Those defaults must not become inventory truth for refurbished or drop stock.
None of the live observations verified a password-locked drop/reopening cycle;
that behavior is covered only by the earlier synthetic connector tests.

Before broad ingestion, preserve source update time (when supplied), observed time,
price currency, condition, variants and **unknown** availability. Treat closure,
access denial, and missing extraction as different outcomes. A browser cannot
recover a legitimately private upcoming collection behind a password gate.

## Recommended next investment

1. **Benchmark a browser fallback plus extraction on this same sample.** Keep
   transport and extraction separate. Compare direct HTML, rendered HTML, and
   structured extraction; record why a request escalates. Add category/sitemap
   discovery so the benchmark does not stop at the homepage. Use fixed product
   URLs as a separate test to isolate extraction from discovery.
2. **Use a shared product extraction fallback.** Read visible DOM prices and
   product structure when JSON-LD/OpenGraph are missing, with evidence and
   validation for currency, price ranges, variants and sale prices. Palace is an
   immediately demonstrated opportunity; do not count every dollar amount as price.
3. **Add bulk feed ingestion when accessible catalogs are verified.** Awin and
   impact.com support multi-advertiser feeds, but membership/access determines
   actual coverage. No named retailer in this audit is claimed to be available
   through those feeds. Obtain the accessible merchant list before ranking networks.
4. **Validate existing eBay/Best Buy adapters with approved keys.** Both adapters
   already exist. Their credentials were absent from this process, so no live API
   calls were tested; blocked retail homepages say nothing about API success.

For the browser experiment, Browserless is a reasonable first candidate because
its official documentation supports both cloud and self-hosted browsers, matching
this project's deployment model. Zyte is a useful comparison for managed product
extraction from HTTP or rendered pages. This is a capability-based shortlist, not
a provider performance or price ranking. No service was purchased or configured.

Measure **additional correctly extracted products**, fields/variants verified on
sampled pages, seconds per successful refresh, repeat-run success, and actual
provider charges per 1,000 successful refreshes. Count failures and retries in
costs. Do not choose a provider based on page-load success alone. Run the same URL
set and region settings across alternatives. Revisit cadence for slow-changing
catalogs versus announced drops only after repeat observations.

## Official integration sources (checked 26 October 2026)

- [Browserless overview](https://docs.browserless.io/overview/intro): managed
  browsers, Playwright/Puppeteer connections, cloud or Docker self-hosting.
- [Zyte extraction](https://docs.zyte.com/zyte-api/usage/extract/index.html): product
  extraction with HTTP, browser HTML, or supplied HTML inputs.
- [Awin feed list](https://help.awin.com/developers/docs/product-feed-list-download):
  accessible feed inventory, joined status and last-update timestamps; separate feed key.
- [impact.com catalogs](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/marketing-content/product-marketplace-and-catalogs/download-product-catalogs-as-a-partner):
  catalogs from joined brands, download/FTP/API options.
- [eBay Browse](https://developer.ebay.com/api-docs/buy/static/api-browse.html):
  keyword/category search and item details; production access must be verified.
- [Best Buy API docs](https://bestbuyapis.github.io/api-documentation/): Products API;
  documentation describes temporary caching and expiring response links, which
  matter before treating API content as a permanent catalog.
- [Google Merchant API](https://developers.google.com/merchant/api/guides/products/add-manage?hl=en):
  manages products in Merchant Center accounts; not evidence of an open all-store
  shopping index we can query.

## Evidence and reproduction

- [Raw HTTP baseline](audits/2026-10-26-coverage.json)
- [HTTP diagnostics](audits/2026-10-26-diagnostics.json)
- [Browser observations](audits/2026-10-26-browser-check.json)
- [Palace extraction check](audits/2026-10-26-palace-check.json)
- [Recomputed summary](audits/2026-10-26-summary.json)
- [Offline Python analysis](audits/analyze_coverage.py)

From the repository root, with dependencies installed and Node 22+:

```sh
node --import ./apps/server/node_modules/tsx/dist/loader.mjs apps/server/scripts/coverage-audit.ts
python docs/audits/analyze_coverage.py
```

The audit command writes a new timestamped observation file. The Python analysis
deliberately recomputes the frozen October 26 baseline. Browser observations are
manual evidence, not an automated cloud benchmark. Live results will vary by time,
network, region, request pacing and storefront changes. Stored response hashes
identify the initial bodies; full storefront HTML was not archived.
