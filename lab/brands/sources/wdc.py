"""Read Web Data Commons schema.org Product parts and write one candidate store per website.

Usage: python3 -I wdc.py <out.jsonl> <part.gz> [<part.gz> ...]

Web Data Commons extracts the schema.org Product markup that stores put on their product pages
(for Google Shopping) out of Common Crawl. Every platform emits it, so this source is not tied to
Shopify. Parts are N-Quads, gzipped, with each page's quads next to each other.
"""
import collections, gzip, json, re, sys, urllib.parse

sys.path.insert(0, __file__.rsplit("/", 2)[0])
from common import candidate  # noqa: E402

QUAD = re.compile(r'^(\S+) <([^>]+)> (.+) <([^>]*)>\s*\.\s*$')
S = "http://schema.org/"
TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"


def literal(obj):
    """The value of an N-Quads object: a URI, a blank node id, or an unescaped string literal."""
    if obj.startswith("<"):
        return obj[1:obj.index(">")]
    if obj.startswith("_:"):
        return obj
    end = obj.rfind('"')
    raw = obj[1:end]
    try:
        return json.loads('"' + raw.replace('\\U', '\\u') + '"')
    except ValueError:
        return raw.replace('\\"', '"').replace("\\n", "\n")


def pages(path):
    """Yield (page url, {subject: {predicate: [values]}}) for each page in a part."""
    page, nodes = None, collections.defaultdict(lambda: collections.defaultdict(list))
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = QUAD.match(line)
            if not m:
                continue
            subj, pred, obj, graph = m.groups()
            if graph != page:
                if page:
                    yield page, nodes
                page, nodes = graph, collections.defaultdict(lambda: collections.defaultdict(list))
            nodes[subj][pred].append(literal(obj))
    if page:
        yield page, nodes


def first(node, prop):
    vals = node.get(S + prop) or node.get(S.replace("http", "https") + prop) or []
    return vals[0] if vals else None


def products(nodes):
    """Name, image, price, currency and brand of each Product on one page."""
    for subj, node in nodes.items():
        types = node.get(TYPE, [])
        if S + "Product" not in types and "https://schema.org/Product" not in types:
            continue
        name = first(node, "name")
        image = first(node, "image")
        if image and image.startswith("_:"):  # an ImageObject node
            image = first(nodes.get(image, {}), "url") or first(nodes.get(image, {}), "contentUrl")
        brand = first(node, "brand")
        if brand and brand.startswith("_:"):
            brand = first(nodes.get(brand, {}), "name")
        price = currency = None
        for offer in (node.get(S + "offers") or [])[:4]:
            o = nodes.get(offer, {}) if offer.startswith("_:") else {}
            price = price or first(o, "price") or first(o, "lowPrice")
            currency = currency or first(o, "priceCurrency")
        try:
            price = float(str(price).replace(",", "")) if price else None
        except ValueError:
            price = None
        if name and image and image.startswith("http") and price:
            yield {"title": name.strip()[:200], "image": image, "price": price, "currency": (currency or "").upper()[:3],
                   "brand": (brand or "").strip()[:80]}


def site_of(url):
    host = urllib.parse.urlsplit(url).hostname or ""
    return host[4:] if host.startswith("www.") else host


def run(out_path, parts):
    stores = collections.defaultdict(dict)  # host -> {title: item}
    for part in parts:
        for page, nodes in pages(part):
            host = site_of(page)
            bucket = stores[host]
            if len(bucket) >= 40:
                continue
            for p in products(nodes):
                if p["title"] not in bucket:
                    bucket[p["title"]] = dict(p, url=page)
        print(part, len(stores), "sites so far", flush=True)
    kept = 0
    with open(out_path, "w") as out:
        for host, items in stores.items():
            items = list(items.values())
            if len(items) < 8:
                continue
            brands = collections.Counter(i["brand"].lower() for i in items if i["brand"])
            name = brands.most_common(1)[0][0] if brands else ""
            c = candidate(source="wdc", host=host, site=f"https://{host}", name=name, items=items,
                          vendors=[i["brand"] for i in items])
            out.write(json.dumps(c) + "\n")
            kept += 1
    print(f"done: {len(stores)} sites, {kept} with 8+ products", flush=True)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2:])
