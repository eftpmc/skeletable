"""Turn the catalog's brands into a catalog of products, sorted into departments and categories.

Usage (run from a work directory; photos and vectors are cached there like embed.py's):
  python3 -I items.py fetch <pack.jsonl.gz>                 # each Shopify store's products.json, once
  venv/bin/python -I items.py build <pack.jsonl.gz> <out.jsonl.gz>

fetch reads every store's /products.json (one request per store, after checking its robots.txt),
which has the tags and product types the export didn't keep. build picks up to ITEMS products per
brand, embeds their photos, sorts each into a category and a department (taxonomy.py), and writes
the pack again with the products in it. Stores we can't read keep the products the pack already had.
"""
import concurrent.futures as cf, gzip, hashlib, json, os, re, sys, time, urllib.parse, urllib.request, urllib.robotparser

sys.path.insert(0, __file__.rsplit("/", 1)[0])

UA = "skeleton-lab/0.1 (research crawl; one request per store)"
CA = "/root/.ccr/ca-bundle.crt"
# Products per brand in the pack. Shopify lists newest first, so these are the brand's current ones.
ITEMS = 24


def opener():
    import ssl
    try:
        ctx = ssl.create_default_context(cafile=CA)
    except OSError:
        ctx = ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))


def read_pack(path):
    return [json.loads(line) for line in gzip.open(path, "rt") if line.strip()]


def photos_of(r):
    """A brand's products in the pack: "photos" before items.py first ran, "items" after."""
    return r.get("items") or r.get("photos") or []


def key_of(url):
    return hashlib.sha1(url.encode()).hexdigest()[:20]


def hosts_of(r):
    """Where a store's catalog can be read: its own domain first, then the myshopify address its products use."""
    hosts = [urllib.parse.urlsplit(r["site"]).hostname] if r.get("site") else []
    for p in photos_of(r):
        h = urllib.parse.urlsplit(p.get("productUrl") or "").hostname
        if h and h not in hosts:
            hosts.append(h)
    return hosts


def allowed(http, host, path):
    rp = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(f"https://{host}/robots.txt", headers={"User-Agent": UA})
        with http.open(req, timeout=15) as res:
            rp.parse(res.read(500_000).decode("utf-8", "ignore").splitlines())
    except urllib.error.HTTPError as e:
        # No robots.txt means no rules; a 401/403 on it means stay out.
        return e.code not in (401, 403)
    except Exception:
        return False
    return rp.can_fetch(UA, f"https://{host}{path}")


def fetch_store(http, r):
    path = "/products.json?limit=250"
    for host in hosts_of(r):
        if not allowed(http, host, path):
            return {"status": "robots", "host": host}
        try:
            req = urllib.request.Request(f"https://{host}{path}", headers={"User-Agent": UA, "Accept": "application/json"})
            with http.open(req, timeout=20) as res:
                data = json.loads(res.read(20_000_000))
            return {"status": "ok", "host": urllib.parse.urlsplit(res.geturl()).hostname, "products": data.get("products") or []}
        except Exception as e:  # noqa: BLE001 - a store that refuses is skipped, never retried harder
            last = str(e)[:120]
    return {"status": "failed", "error": last if hosts_of(r) else "no host"}


def fetch(pack_path, workers=1, pause=5.0):
    """Shopify answers 429 to one address reading many stores quickly, so this goes slowly, and a
    re-run only asks again where the answer was a 429."""
    os.makedirs("products", exist_ok=True)
    stores = [r for r in read_pack(pack_path) if r["platform"] == "shopify"]
    path = lambda r: f"products/{key_of(r['site'] or r['name'])}.json"  # noqa: E731

    def due(r):
        if not os.path.exists(path(r)):
            return True
        old = json.load(open(path(r)))
        return old["status"] == "failed" and "429" in old.get("error", "")

    todo = [r for r in stores if due(r)]
    http = opener()

    def one(r):
        out = fetch_store(http, r)
        json.dump(out, open(path(r), "w"))
        time.sleep(pause)
        return out["status"]

    counts = {}
    with cf.ThreadPoolExecutor(workers) as pool:
        for n, status in enumerate(pool.map(one, todo), 1):
            counts[status] = counts.get(status, 0) + 1
            if n % 50 == 0:
                print(n, "of", len(todo), counts, flush=True)
    print("done", counts, flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "fetch":
        fetch(sys.argv[2])
    elif sys.argv[1] == "build":
        from build_items import build  # noqa: E402

        build(sys.argv[2], sys.argv[3])
