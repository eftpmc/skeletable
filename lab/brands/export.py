"""Export the lab's catalog for the app: one JSON line per brand, the shape the server imports.

Usage: venv/bin/python -I export.py <lab.json> <brands_in.json> <catalog.jsonl[.gz]>
Then either import it into one database:
  DATABASE_URL=… pnpm --filter @skeleton/server catalog:import <catalog.jsonl>
or ship it with the app as the catalog pack (gzipped), which the server imports on start when new:
  venv/bin/python -I export.py lab.json brands_in.json apps/server/catalog/pack.jsonl.gz
Reads <lab>.npy and <lab>.starts.npy from rank.py. Photo URLs come from brands_in.json (the
records embed.py read), matched by the same URL hash the photo cache uses.
"""
import gzip, hashlib, json, sys
import numpy as np

PHOTOS = 8


def key_of(url):
    return hashlib.sha1(url.encode()).hexdigest()[:20]


def https(url):
    if not url:
        return None
    url = "https:" + url if url.startswith("//") else url
    return url if url.startswith(("http://", "https://")) else None


def photos(b, urls):
    items = {i["photo"]: i for i in b.get("items", [])}
    out = []
    for k in b["photos"]:
        image = https(urls.get(k))
        if not image:
            continue
        item = items.get(k, {})
        out.append({"imageUrl": image, "title": (item.get("title") or None) and item["title"][:300],
                    "priceUsd": item.get("price_usd"), "productUrl": https(item.get("url"))})
        if len(out) == PHOTOS:
            break
    return out


def record(b, look, urls, kind):
    where = (b.get("country") or None, b.get("city") or None)
    return {
        "kind": kind, "name": b["name"].strip()[:200], "site": https(b.get("site")) or None,
        "platform": b["platform"] if kind == "store" else None,
        "country": where[0], "city": where[1], "description": (b.get("description") or "")[:1000] or None,
        "priceLowUsd": int(b["price_low_usd"]) if kind == "store" else None,
        "priceHighUsd": int(b["price_high_usd"]) if kind == "store" else None,
        "quality": round(min(max(float(b["quality"]), 0), 1), 4), "seenAt": b.get("seen_at") if kind == "name" else None,
        # Four decimals keep cosine scores to about 1e-4 and the pack small.
        "look": [round(float(x), 4) for x in look / np.linalg.norm(look)], "photos": photos(b, urls),
    }


def main(lab_path, brands_in_path, out_path):
    lab = json.load(open(lab_path))
    base = lab_path.rsplit(".", 1)[0]
    V, S = np.load(base + ".npy"), np.load(base + ".starts.npy")
    urls = {key_of(i["image"]): i["image"] for b in json.load(open(brands_in_path)) for i in b["items"]}
    n = 0
    # mtime=0 so the same catalog always makes the same file (the server skips packs it has seen).
    opener = (lambda p: gzip.GzipFile(p, "wb", mtime=0)) if out_path.endswith(".gz") else (lambda p: open(p, "wb"))
    with opener(out_path) as out:
        for kind, rows, vecs in (("store", lab["brands"], V), ("name", lab.get("starts", []), S)):
            for b, v in zip(rows, vecs):
                r = record(b, v, urls, kind)
                if r["photos"]:
                    out.write((json.dumps(r, ensure_ascii=False) + "\n").encode())
                    n += 1
    print(n, "brands exported")


if __name__ == "__main__":
    main(*sys.argv[1:4])
