# Store connectors and temporary closures

The catalog foundation supports two connectors with the same `discover` and
`readProduct` contract (`apps/server/src/catalog/connectors/index.ts`):

- `page`: platform-independent JSON-LD/OpenGraph product reading, with discovery
  of same-origin `/product/`, `/products/`, and `/p/` links on a supplied public page.
- `shopify`: a bounded public product feed plus product-page reading, including
  the existing Shopify product JSON fallback when page metadata is incomplete.

The generic connector is not universal site coverage. JavaScript-only sites,
other URL patterns, and sites without product metadata need additional adapters.
Both connectors use the existing SSRF-safe, size-limited fetcher.

## Store states are not stock states

Each read records a timestamp and one of `open`, `locked`, `maintenance`,
`restricted`, `unavailable`, or `unknown`. `open` means the requested public page
is accessible; it does not assert that any product is in stock. A missing product
page is `unknown`, not proof that the whole brand closed.

Password redirects/forms and prominent temporary-closure notices are `locked`.
Maintenance pages are distinct from access restrictions (including rate limits)
and server failures. The Shopify discovery connector checks the front door before
requesting its feed and stops at a gate. No passwords or challenges are bypassed.
Normal account login forms and footer opening hours do not mark a store closed.

`reconcileProduct` retains the last successfully read product and its timestamp
when a subsequent read is closed, fails, or has no usable product. It does not
infer deletions, sold-out states, restocks, or new-product events. Discovery is
always marked incomplete: missing products in a bounded feed/page are not deleted.
On reopening, the previous snapshot remains the comparison baseline.

## Integration boundary

Link imports now reject inaccessible storefronts before parsing products and
return a specific store-unavailable message. The connector API and snapshot
reconciliation are the foundation for the next catalog crawl job; they are not
yet scheduled or persisted by a worker. Existing marketplace/search adapters are
unchanged. Brand-follow alerts, durable store observations, storefront status
badges, drop-time extraction, and automatic reopening checks are subsequent work.

Fixture tests cover a non-Shopify product, Shopify feed and product JSON, a drop
closure/reopening, maintenance, rate limits, missing pages, snapshot retention,
and default private-network protection. These are reproducible local fixtures,
not claims of compatibility with particular live brands.
