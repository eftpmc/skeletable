# Brand discovery lab

An experiment toward the catalog in [docs/CATALOG.md](../../docs/CATALOG.md): find clothing brands
people haven't heard of, from the open web, with no hand-picked starting list, and answer "brands
like this one". Python scripts, run by hand; nothing here ships with the app yet.

## Pipeline

Every step reads and writes files in a work directory (run the scripts from it). Photos are cached in
`img/` and photo vectors in `vectors.npz`, keyed by a hash of the photo URL, so re-runs only fetch and
embed what's new.

| Step | Script | Reads | Writes |
| --- | --- | --- | --- |
| Shopify stores | `sources/shopify.py crawl` | store list from Common Crawl | candidates (`.jsonl`) |
| Every other platform | `sources/wdc.py` | Web Data Commons Product parts | candidates (`.jsonl`) |
| Looks like a clothing label | `select.py` | candidates | `brands.json` |
| Live, photos, mostly clothing | `embed.py` | `brands.json` | `embedded.json` + `embedded.npy` |
| Grade by eye | `quality.py sheets` | `embedded.json` | contact sheets to grade into `labels.json` |
| Learn the grades | `quality.py train` | `embedded.json`, `labels.json` | `scored.json` |
| Neighbors | `rank.py` | `scored.json`, `embedded.npy` | `lab.json` + `lab.npy` |
| Test page | `page/build.py` | `lab.json`, `lab.npy`, `img/` | one HTML file |
| Learn from use | `feedback.py` | the page's votes, `labels.json` | merged grades for `quality.py train` |
| Brand name index | `names.py add` / `index` | brand mentions from `sources/wdc.py` | `names.db`, brands known by name |
| All of it, in rounds | `grow.py` | everything above | the page, `grow.log` |

A candidate is one website that sells products, before we know it's a clothing brand (fields in
`common.py`). Sources only have to produce candidates; everything after is platform-agnostic.

## Sources

**Shopify.** `*.myshopify.com` hostnames from the Common Crawl URL index (`cluster.idx` range lookup on
the SURT prefix `com,myshopify,`, then the matching cdx blocks from `data.commoncrawl.org`), then each
store's public `/products.json?limit=30`, one request per store.

**Web Data Commons.** WDC extracts schema.org markup from Common Crawl and publishes a Product subset:
the markup stores put on product pages for Google Shopping, from every platform. The 2024-12 release
covers about 3.3 million sites in 1,658 gzipped N-Quads files of about 150 MB
(`https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/Product/part_N.gz`;
`Product_lookup.csv` maps each site to its file). No requests to stores are needed to read it. It's a
late-2024 snapshot, so `embed.py` checks each site is still up and photo downloads fail for products
that are gone.

**Brand names.** Stores that stock or resell other labels list them under schema.org `brand`. For
each site, `sources/wdc.py` treats its own label (its domain name, or any brand on half its
products) as the store's, and every other brand's clothing as a mention: a photo of that brand seen
somewhere else. `names.py` keeps mentions in SQLite (`brand_key` in `common.py` folds spellings like
"UNIQLO" and "Uniqlo Official Store" together) and indexes brands seen at 2+ stores with 8+ photos.
Those become starting points (start from Uniqlo without reading uniqlo.com), never results; a name
that matches a store we have is that store. The index links a brand's own domain when Web Data
Commons has it.

Platform is read from photo URLs (`common.platform_of`), which is how the page labels each brand.

## Quality

Selection rules and the photo check remove what's plainly not a clothing label. What's left still
mixes distinct labels with generic boutiques, resale and dropshipping. That's easy to tell by eye
and hard to tell by rules, so we grade a random sample by eye from contact sheets (grades in
`quality.py`), and a logistic regression on the brand photo vectors learns them. Every brand gets a
0–1 score; `rank.py` drops brands below 0.4 and gives neighbors a small boost for quality.

## Learning from use

The test page has three buttons on every brand, and each teaches something different:

- **♥ Like**: the brand is a find. Feeds your taste and, for everyone, the quality score.
- **Not for me**: taste only. It pushes your "For you" away from that look and says nothing about
  whether the brand is real.
- **Not a real brand**: resale, dropshipping, wholesale stock, uniforms, merch. Quality only.

Votes live in the page's `votes` collection, one document per person per brand (`<brand>~<user>`),
so nobody's vote counts twice. **For you** opens after 5 likes and runs in the page: the mean photo
vector of what you liked minus half the mean of what you skipped or flagged, ranked by closeness
plus a small quality nudge. Two of every ten slots go to brands nobody has voted on yet, so new
brands keep getting seen instead of the first popular ones winning. With a taste, "Brands like…"
lists are re-ordered by it too.

To fold everyone's votes into the quality model:

```sh
# export the votes (ArtifactData list on the page's `votes` collection with out_dir=votes/), then
python3 -I feedback.py votes labels.json labels-merged.json
venv/bin/python -I quality.py train embedded.json labels-merged.json scored.json
```

A like counts as grade 2 and a flag as grade 0; "not for me" is left out. A hand grade stands
unless at least two people voted on the brand and disagree with it.

`labels.json` holds the grades so far (250: a random 150, then the 100 the model was least sure
about) and `stats.json` the counts from the last run, which the page shows.

## Growing

`grow.py` runs everything in rounds over the 1,658 Web Data Commons files in a fixed random order,
100 per round by default. Each round only pays for what's new: parts already read are skipped,
live checks are cached for two weeks, photos and their vectors are cached by URL. A stopped run
resumes from `grow_state.json`; `grow.log` has one line of counts per round.

## Crawling rules

Identify ourselves in the User-Agent, one request per store for catalogs, follow robots.txt, never
route around bot protection (no residential proxies, fingerprint spoofing or CAPTCHA solving). A
store that refuses is skipped. See docs/CATALOG.md.

Gap: the Shopify crawl doesn't read each store's robots.txt yet. Shopify's default file doesn't
disallow `/products.json`, but stores can edit theirs, so add the check before any larger crawl.

## Setup

```sh
python3 -m venv venv && venv/bin/pip install fastembed==0.7.4 pillow numpy scikit-learn
```

The CLIP models (`Qdrant/clip-ViT-B-32-vision`, `Qdrant/clip-ViT-B-32-text`) download on first use.
