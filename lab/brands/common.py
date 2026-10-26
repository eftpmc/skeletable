"""The candidate record every source writes, and the text signals the selection step reads.

A candidate is one website that sells products, before we know whether it is a clothing brand:
  {id, source, host, site, name, platform, apparel, own_brand, brands_seen, pod, blank_share, merch, items}
with items [{title, price, currency, image, url}]. Currency is "" when the source doesn't say.
"""
import collections, re, unicodedata

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


GENERIC_NAMES = re.compile(r"^(shop|store|home|mysite|my site|online store|official store|official site|boutique|apparel|clothing|"
                           r"fashion|website|site|sale|new|true|false|null|none|n\/a|株式会社.*)$", re.I)


def display_name(name, host):
    """The name to show: the store's own, unless it's empty or generic, then the domain's first label."""
    name = (name or "").strip()
    if not name or GENERIC_NAMES.match(name):
        label = host.lower().removeprefix("www.").removeprefix("shop.").removeprefix("store.").split(".")[0]
        return label.replace("-", " ").title()
    return name.title() if name == name.lower() else name


# Rough rates to US dollars; prices are shown as approximate.
USD = {"USD": 1, "CAD": 0.73, "AUD": 0.66, "NZD": 0.6, "EUR": 1.08, "GBP": 1.27, "JPY": 0.0067, "SEK": 0.095, "DKK": 0.145,
       "NOK": 0.094, "CHF": 1.12, "INR": 0.012, "SGD": 0.74, "HKD": 0.128, "KRW": 0.00073, "MXN": 0.055, "ZAR": 0.055, "PHP": 0.017,
       "MYR": 0.21, "IDR": 0.000063, "BRL": 0.18, "AED": 0.27, "PLN": 0.25, "CZK": 0.043, "THB": 0.028, "TWD": 0.031, "ILS": 0.27,
       "CNY": 0.14, "TRY": 0.03, "RON": 0.22, "HUF": 0.0028, "ISK": 0.0072, "CLP": 0.0011, "COP": 0.00025, "ARS": 0.001, "PEN": 0.27,
       "VND": 0.00004, "NGN": 0.00065, "KES": 0.0077, "SAR": 0.27, "QAR": 0.27, "EGP": 0.02, "PKR": 0.0036, "BGN": 0.55, "UAH": 0.024}

# Words that name no brand, and endings that aren't part of the name.
NO_BRAND = re.compile(r"^(unbranded|no ?brand|non ?branded|generic|brand|n/?a|none|null|true|false|other|others|unknown|various|"
                      r"vintage|handmade|custom|default|test|sample|new|sale|shop|store|home|my store|my site|our brand)$")
NAME_ENDINGS = re.compile(r"(\s+(official store|official site|official shop|official|store|shop|online|clothing|apparel|"
                          r"company|co|inc|ltd|llc|gmbh|sa|bv|pty|limited))+$")


def brand_key(name):
    """One key for every spelling of a brand name: 'UNIQLO', 'Uniqlo Official Store' and 'uniqlo' all give 'uniqlo'.
    Empty when the text names no brand."""
    s = unicodedata.normalize("NFKC", name or "").casefold()
    s = re.sub(r"[™®©]", "", s).strip()
    if not s or NO_BRAND.match(s):
        return ""
    s = re.sub(r"https?://|www\.|\.(com|co|net|org|shop|store|co\.uk|com\.au|de|fr|it|es|nl|jp|ca)\b", " ", s)
    s = re.sub(r"[^\w]+", " ", s).strip()
    core = NAME_ENDINGS.sub("", s).strip() or s  # "Store Co" alone stays as written
    return "" if NO_BRAND.match(core) else core[:60]


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
