"""Keep candidates that look like clothing brands: mostly apparel, own label, not merch or printed blanks.

Usage: python3 -I select.py <brands.json> <candidates.jsonl> [<candidates.jsonl> ...]
The same website from two sources is kept once, preferring the Shopify catalog (fresher, fuller).
"""
import collections, json, re, sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import display_name  # noqa: E402

# Storefronts inside marketplaces and wholesale sites: never one brand's own shop.
MARKETPLACE = re.compile(r"alibaba|aliexpress|made-in-china|dhgate|etsy|ebay|amazon|temu|shein|depop|poshmark|vinted|catalogmode")


def keep(c):
    if c["placeholder"] or c["merch"] or c["pod"] or MARKETPLACE.search(c["host"]):
        return False
    if c["apparel"] < 0.4 or c["blank_share"] > 0.15:
        return False
    # A known label share must be high; an unknown one (the source rarely names brands) passes,
    # and the image and quality checks decide.
    return c["own_brand"] is None or c["own_brand"] >= 0.7


def host_key(c):
    h = c["host"].lower()
    return h[4:] if h.startswith("www.") else h


def main(out_path, paths):
    chosen, seen = {}, collections.Counter()
    for path in paths:
        for line in open(path):
            c = json.loads(line)
            seen[c["source"]] += 1
            if not keep(c):
                continue
            k = host_key(c)
            if k in chosen and chosen[k]["source"] == "shopify":
                continue
            chosen[k] = c
    brands = []
    for c in chosen.values():
        items = [i for i in c["items"] if i["image"] and i["price"] and i["price"] > 0]
        if len(items) < 8:
            continue
        prices = sorted(i["price"] for i in items)
        currencies = collections.Counter(i["currency"] for i in items if i["currency"])
        brands.append({
            "id": c["id"], "name": display_name(c["name"], c["host"]), "site": c["site"], "host": c["host"],
            "source": c["source"], "platform": c["platform"], "myshopify": c.get("myshopify"),
            "currency": currencies.most_common(1)[0][0] if currencies else "",
            "price_low": prices[len(prices) // 4], "price_mid": prices[len(prices) // 2], "price_high": prices[(len(prices) * 3) // 4],
            "items": items[:20],
        })
    json.dump(brands, open(out_path, "w"))
    by = collections.Counter((b["source"], b["platform"]) for b in brands)
    print(json.dumps({"candidates": dict(seen), "kept": len(brands), "by_source_platform": {f"{s}/{p}": n for (s, p), n in by.most_common()}}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
