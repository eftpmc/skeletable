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
| Neighbors | `rank.py` | `scored.json`, `embedded.npy` | `lab.json` |
| Test page | `page/build.py` | `lab.json`, `img/` | one HTML file |

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

Platform is read from photo URLs (`common.platform_of`), which is how the page labels each brand.

## Quality

Selection rules and the photo check remove what's plainly not a clothing label. What's left still
mixes distinct labels with generic boutiques, resale and dropshipping. That's easy to tell by eye
and hard to tell by rules, so we grade a random sample by eye from contact sheets (grades in
`quality.py`), and a logistic regression on the brand photo vectors learns them. Every brand gets a
0–1 score; `rank.py` drops brands below 0.45 and gives neighbors a small boost for quality.
Ratings on the test page ("good find" / "not it") are the next source of grades.

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
