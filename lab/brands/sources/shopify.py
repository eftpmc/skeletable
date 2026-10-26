"""Read /products.json from Shopify stores and write one candidate per store.

Usage:
  python3 -I shopify.py crawl <hosts.json> <out.jsonl> <sample-size> [rest] [workers]
  python3 -I shopify.py convert <old-crawl.jsonl> <out.jsonl>   # records from the first lab crawl

hosts.json is [[subdomain, count], ...] from the Common Crawl index (see README). One request per
store, an identifying User-Agent, no retries against stores that refuse.
"""
import concurrent.futures as cf, json, random, ssl, sys, threading, urllib.parse, urllib.request

sys.path.insert(0, __file__.rsplit("/", 2)[0])
from common import candidate  # noqa: E402

CA = "/root/.ccr/ca-bundle.crt"
UA = "skeleton-lab/0.1 (research crawl; one request per store)"


def opener():
    try:
        ctx = ssl.create_default_context(cafile=CA)
    except OSError:
        ctx = ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))


def to_candidate(sub, host, products):
    items, vendors, extra = [], [], []
    for p in products:
        prices = [float(v["price"]) for v in p.get("variants") or [] if v.get("price")]
        imgs = p.get("images") or []
        if not prices or not imgs:
            continue
        site = f"https://{host}" if host else f"https://{sub}.myshopify.com"
        items.append({"title": p.get("title", ""), "price": min(prices), "currency": "", "image": imgs[0].get("src"),
                      "url": f'{site}/products/{p.get("handle")}'})
        vendors.append(p.get("vendor", ""))
        tags = p.get("tags") or []
        extra.append(f'{p.get("product_type", "")} {" ".join(tags[:12]) if isinstance(tags, list) else str(tags)[:200]}')
    if len(items) < 8:
        return None
    top = max(set(v.strip() for v in vendors), key=lambda v: sum(1 for x in vendors if x.strip() == v))
    c = candidate(source="shopify", host=host or f"{sub}.myshopify.com", site=f"https://{host or sub + '.myshopify.com'}",
                  name=top, items=items, vendors=vendors, extra=extra)
    c["myshopify"] = f"{sub}.myshopify.com"
    return c


def fetch(sub, http):
    url = f"https://{sub}.myshopify.com/products.json?limit=30"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with http.open(req, timeout=15) as r:
            host = urllib.parse.urlsplit(r.geturl()).hostname
            data = json.loads(r.read(3_000_000))
    except Exception:
        return None
    return to_candidate(sub, host, data.get("products") or [])


def crawl(hosts_file, out_file, n, rest=False, workers=24):
    hosts = [h for h, _ in json.load(open(hosts_file))]
    random.seed(7)
    sample = random.sample(hosts, min(n, len(hosts)))
    if rest:  # every store the first sample of this size didn't cover
        seen = set(sample)
        sample = [h for h in hosts if h not in seen]
    http, lock, done, kept = opener(), threading.Lock(), [0], [0]
    with open(out_file, "w") as out, cf.ThreadPoolExecutor(workers) as pool:
        for result in pool.map(lambda s: fetch(s, http), sample):
            with lock:
                done[0] += 1
                if result:
                    out.write(json.dumps(result) + "\n")
                    kept[0] += 1
                if done[0] % 500 == 0:
                    print(f"{done[0]} checked, {kept[0]} with catalogs", flush=True)
    print(f"done: {done[0]} checked, {kept[0]} with catalogs", flush=True)


def convert(old_file, out_file):
    """The first crawl kept a trimmed product shape; rebuild candidates from it."""
    with open(out_file, "w") as out:
        for line in open(old_file):
            s = json.loads(line)
            products = [{"title": i["title"], "product_type": i["type"], "vendor": i["vendor"], "tags": i["tags"],
                         "handle": i["handle"], "variants": [{"price": i["price"]}], "images": [{"src": i["image"]}]}
                        for i in s["items"] if i.get("image")]
            c = to_candidate(s["sub"], s["host"], products)
            if c:
                out.write(json.dumps(c) + "\n")


if __name__ == "__main__":
    if sys.argv[1] == "convert":
        convert(sys.argv[2], sys.argv[3])
    else:
        args = sys.argv[2:]
        crawl(args[0], args[1], int(args[2]), rest=len(args) > 3 and args[3] == "rest",
              workers=int(args[4]) if len(args) > 4 else 24)
