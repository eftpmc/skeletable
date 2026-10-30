# Frozen product-page benchmark

Step 3: score the extraction engine against saved real pages and independently
transcribed answers. Runs are offline, deterministic, and included in the engine's
normal test suite. They do not measure live discovery, access, crawl speed, or
inventory freshness.

## Run

From the repository root, with Node 22+ and dependencies installed:

```sh
pnpm --filter @skeleton/engine benchmark
pnpm --filter @skeleton/engine benchmark:check
pnpm --filter @skeleton/engine test
pnpm --filter @skeleton/engine typecheck
```

`benchmark` prints scores and every mismatch. Known misses do not fail the run.
`benchmark:check` fails if **any previously correct check becomes wrong**, even
when the aggregate improves. It also rejects changed corpus metadata, missing
checks, or modified snapshot bytes. The same gate runs under `test` and existing CI.

For a machine-readable candidate report, without replacing the baseline:

```sh
pnpm --filter @skeleton/engine benchmark --out candidate.json
```

## Collection and results

Captured October 28, 2026: 24 full HTML snapshots from 16 sites, including
13 non-Shopify product sites, and a Patagonia maintenance-page negative case.
Raw, gzip-compressed HTML is stored in `pages/`, `pages-extra/` and
`pages-expanded/`. `captures.json` in each directory records requested/final URLs,
UTC capture time, HTTP status, uncompressed byte count and SHA-256. Failed fetches
remain in those logs and are not counted as extraction failures or successes.
Platform assignments describe the observed storefront and have evidence in the
manifest; they do not prove API access or inventory coverage.

| Mode | Development | Holdout | Total |
| --- | ---: | ---: | ---: |
| Standard defaults | 65/77 | 40/43 | 105/120 |
| With recipes | 73/77 | 40/43 | 113/120 |

The first collection (18 snapshots, kept as `corpus-initial.json` and
`baseline-initial.json`) scored 68/94 and 79/94. On those same checks the engine
lost none and gained 19, all on development sites; its original holdout stayed at
31/34. `baseline.json` is the reviewed baseline for the expanded corpus.

These are reviewed checks, **not product success rates**. The negative case's
no-reading check is included. Null/unknown checks are included, so the headline
is not positive-field recall. The JSON report breaks results down by site, field,
split and mode and lists every expected/actual value. It also reports whether the
engine emitted a complete reading; emission alone does not establish correctness.

Recipe mode uses the shipped Palace recipe plus three **benchmark-only** recipes:
Penguin and Thomann use small CSS overrides; Sweetwater uses embedded JSON paths.
These recipes are not installed in production. All other pages use defaults in
both modes. The recipe gain demonstrates recovery on development pages, not
generalization to new sites.

Holdout sites are Apple, Dell, Nintendo, OXO UK, World Market, beyerdynamic and
the Patagonia negative case. A site never appears in both splits. No engine or
recipe tuning was performed against them. If a future change is tuned using a
holdout failure, explicitly move that site to development and replace its holdout
coverage before claiming an independent evaluation.

## What an answer means

`corpus.json` is the reviewed source of truth. Every label contains a value and a
source-location explanation. Values were transcribed after inspecting the saved
HTML, not copied from the extraction engine. This is a first, single-reviewer
collection; independent second review would improve confidence.

- Prices are integer minor units. Currency must be stated in the source context.
- A missing label means **not reviewed**, and contributes nothing to the score.
- Explicit `null` means the saved evidence does not establish that value. It must
  not become zero price, false availability, or a guessed currency.
- Text comparison normalizes whitespace only. Images compare the entire labelled
  ordered URL list; a single thumbnail does not earn full-gallery credit.
- `variantTitles` compares sorted purchasable option titles. Palace's size chart
  includes an extra size absent from its actual purchase controls. Variant prices,
  barcodes and per-size stock are not yet labelled; this benchmark does not claim
  variant completeness. Full `variants` labels are also supported.
- Stock labels describe what the captured page asserts, not actual warehouse stock
  or availability at a selected postcode. Conflicting manufacturer assertions are
  left unlabelled, as on World Market's OXO product.
- Apple's lower-bound aggregate price is deliberately labelled as a from-price;
  it is not a selected configuration. OXO UK's product information page correctly
  has an unknown price. Dell redirected to a different product: labels follow the
  final captured page, not the original URL slug.

## What still fails

With recipes, seven checks miss. The rest are standard-only misses a recipe fixes.

1. **Malformed merchant JSON (three checks):** the first Adafruit page has unescaped
   quotation marks in its JSON-LD description, so stock, SKU and the full gallery are
   lost. Do not make unsafe broad JSON repairs just to pass this page.
2. **Configurator prices (two, holdout):** Dell's price and currency aren't extracted.
3. **Identifiers in page text (one):** Penguin's ISBN.
4. **Site suffixes in titles (one, holdout):** OXO UK's metadata title keeps its suffix.

Sweetwater is a useful trap: `$143.99` is a separate open-box offer; the new item is
`$199.99`. The German beyerdynamic page independently checks sale versus regular price.

## Outside score

Our own collection is picked and marked by us, and it leans toward pages with structured data. On October 30, 2026 the standard reader, untuned, was scored on [Zyte's public benchmark](https://github.com/scrapinghub/product-extraction-benchmark): 140 pages from 62 sites, including marketplaces we'd never read, with answers we didn't write. The scorer first reproduced the published numbers for all three other systems.

| F1 | Zyte | Diffbot | extruct | Skeleton |
| --- | ---: | ---: | ---: | ---: |
| Price | 0.918 | 0.824 | 0.685 | 0.679 |
| SKU | 0.841 | 0.765 | 0.537 | 0.533 |
| Availability | 0.957 | 0.943 | 0.626 | 0.607 |

Skeleton's precision is 0.83 to 0.90 and its recall 0.39 to 0.55: when it answers it's usually right, but it finds nothing on pages without structured data unless a recipe says where to look. Treat 113/120 as a regression gate, not a measure of how well the engine reads the web.

## Add or refresh a case

1. Add explicit public product URLs to a target JSON file (see `targets.json`).
   Capture into a **new** directory; existing capture logs cannot be overwritten:

   ```sh
   pnpm --filter @skeleton/engine exec tsx benchmark/capture.ts benchmark/targets.json benchmark/new-capture
   ```

   Capture uses the engine's safe fetcher, robots handling and pacing, with bounded
   timeouts and no access-block escalation. Review every HTTP 200 for placeholders.
   The target list is a purposeful convenience sample, not a market-coverage sample.

2. Inspect the saved source independently:

   ```sh
   pnpm --filter @skeleton/engine exec tsx benchmark/inspect.ts benchmark/new-capture/example.html.gz
   pnpm --filter @skeleton/engine exec tsx benchmark/snippet.ts benchmark/new-capture/example.html.gz 'specific source text'
   ```

   Neither inspection helper imports engine extraction. Verify product identity,
   offer/edition, sale versus regular price, currency, and page-level availability.
   Label only supported facts and record exact evidence locations. Never generate
   gold labels by running the engine. Ambiguous fields should stay unlabelled.

3. Add provenance, site split and labels to `corpus.json`. Keep original snapshots
   unchanged. Use a new case ID for a new observation and explain any removals.
4. Inspect the candidate report and diff. After explicit baseline review, use
   `--out benchmark/baseline.json` from the engine package to record the new
   baseline. Do not regenerate it automatically in CI or simply to hide failures.

This starter set is US-heavy and electronics/home-heavy, with one German EUR
case. It still needs resale, more languages/currencies, additional page snapshots
per site, and fully reviewed variant stock and identifiers. Transport reliability
and repeated live refresh tests belong in a separate benchmark.
