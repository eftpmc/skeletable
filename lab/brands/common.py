"""The candidate record every source writes, and the text signals the selection step reads.

A candidate is one website that sells products, before we know whether it is a clothing brand:
  {id, source, host, site, name, platform, apparel, own_brand, brands_seen, pod, blank_share, merch, items}
with items [{title, price, currency, image, url}]. Currency is "" when the source doesn't say.
"""
import collections, re

APPAREL = re.compile(r"\b(t-?shirts?|tees?|shirts?|hoodies?|sweatshirts?|crewnecks?|sweaters?|knit(wear)?|cardigans?|jackets?|coats?|outerwear|"
                     r"pants|trousers|jeans|denim|shorts|skirts?|dresses|dress|tops?|bottoms|joggers|sweatpants|polos?|blazers?|vests?|"
                     r"apparel|clothing|tank tops?|longsleeves?|long sleeve|overshirts?|parkas?|fleece|leggings|jumpsuits?|blouses?)\b", re.I)
POD = re.compile(r"printify|printful|gelato|teelaunch|gooten|spod|cj ?dropshipping|aliexpress|dropship", re.I)
BLANKS = re.compile(r"gildan|next level|bella\s*\+?\s*canvas|comfort colors|hanes|port (&|and) company|district made|customcat|teespring|bonfire|"
                    r"printify|printful|independent trading|champion s|jerzees|fruit of the loom|lane seven|as colour", re.I)
MERCH = re.compile(r"merch|music|records|church|ministr|band\b|tour\b|podcast|school|academy|club\b|league|team\b|fundrais|"
                   r"festival|charity|foundation|association|union\b", re.I)
# Shopify app demos and placeholder stores.
PLACEHOLDER = re.compile(r"\b(demo|test|loader|converter|my store|dev store)\b", re.I)

PLATFORMS = [
    ("shopify", re.compile(r"cdn\.shopify\.com|/cdn/shop/|myshopify\.com")),
    ("woocommerce", re.compile(r"/wp-content/")),
    ("squarespace", re.compile(r"squarespace(-cdn)?\.com")),
    ("bigcartel", re.compile(r"bigcartel")),
    ("wix", re.compile(r"wixstatic\.com")),
    ("bigcommerce", re.compile(r"bigcommerce\.com")),
    ("shopline", re.compile(r"shoplineapp|shopline")),
    ("salesforce", re.compile(r"demandware|/dw/image/")),
]


def platform_of(urls):
    votes = collections.Counter()
    for url in urls:
        for name, pattern in PLATFORMS:
            if pattern.search(url or ""):
                votes[name] += 1
                break
    return votes.most_common(1)[0][0] if votes else "other"


def slug(host):
    return re.sub(r"[^a-z0-9]+", "-", host.lower()).strip("-")[:80]


def candidate(source, host, site, name, items, vendors, extra=None):
    """extra: per-item text the signals should also read (product type, tags), aligned with items."""
    text = [f'{i["title"]} {e}' for i, e in zip(items, extra or [""] * len(items))]
    apparel = sum(1 for t in text if APPAREL.search(t)) / len(items)
    named = [v.strip().lower() for v in vendors if v and v.strip()]
    counts = collections.Counter(named)
    # Own label: one name on most products. Unknown when the source rarely names a brand.
    own = counts.most_common(1)[0][1] / len(named) if len(named) >= len(items) / 2 else None
    return {
        "id": slug(host), "source": source, "host": host, "site": site,
        "name": name.strip() or host.split(".")[0],
        "platform": platform_of([i["image"] for i in items] + [site]),
        "apparel": round(apparel, 2), "own_brand": round(own, 2) if own is not None else None,
        "brands_seen": len(counts),
        "pod": any(POD.search(f'{v} {t}') for v, t in zip(vendors, text)),
        "blank_share": round(sum(1 for t in text if BLANKS.search(t)) / len(items), 2),
        "merch": bool(MERCH.search(f"{name} {host}")),
        "placeholder": bool(PLACEHOLDER.search(name)),
        "items": [{k: i.get(k, "") for k in ("title", "price", "currency", "image", "url")} for i in items],
    }
