"""The brand name index: brands we know from other stores' listings, so people can start from any
brand they already know (Uniqlo, a label sold at a few stockists) even when we can't read its own site.

Usage:
  python3 -I names.py add <names.db> <mentions.jsonl> [...]       # mentions from sources/wdc.py
  python3 -I names.py index <names.db> <lookup.csv> <out.json>     # brands seen at enough stores

A mention is one clothing product a store lists under a brand that isn't its own label (stockists,
department stores, resale). A brand enters the index once it's seen at MIN_SITES different stores
with MIN_ITEMS photos, which keeps out one shop's odd data. Its look is learned from those photos
exactly like a store's (embed.py); its prices are left out, since resale prices say little about
the brand. Where the brand has its own site in Web Data Commons, the index links it.
"""
import collections, csv, json, sqlite3, sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import BLANKS, POD, display_name, slug  # noqa: E402

MIN_SITES, MIN_ITEMS, PHOTOS = 2, 8, 20
TLDS = ["com", "co", "co.uk", "com.au", "ca", "de", "fr", "it", "es", "nl", "se", "dk", "no", "jp", "store", "shop", "net", "us", "eu"]


def connect(path):
    db = sqlite3.connect(path)
    db.execute("""create table if not exists mention (key text, name text, host text, title text, image text, price_usd real,
                  url text, unique (key, image))""")
    db.execute("create index if not exists mention_key on mention (key)")
    return db


def add(db_path, paths):
    db = connect(db_path)
    n = 0
    for path in paths:
        rows = [json.loads(line) for line in open(path)]
        db.executemany("insert or ignore into mention values (:key, :name, :host, :title, :image, :price_usd, :url)", rows)
        n += len(rows)
    db.commit()
    total, keys = db.execute("select count(*), count(distinct key) from mention").fetchone()
    print(json.dumps({"added": n, "mentions": total, "brand_names": keys}))


def own_site(key, domains):
    compact, dashed = key.replace(" ", ""), key.replace(" ", "-")
    for base in dict.fromkeys([compact, dashed]):
        for tld in TLDS:
            if f"{base}.{tld}" in domains:
                return f"{base}.{tld}"
    return None


def index(db_path, lookup_path, out_path):
    db = connect(db_path)
    keys = db.execute("""select key from mention group by key
                         having count(distinct host) >= ? and count(*) >= ?""", (MIN_SITES, MIN_ITEMS)).fetchall()
    with open(lookup_path) as f:
        domains = {row[0] for row in csv.reader(f)}
    brands = []
    for (key,) in keys:
        if POD.search(key) or BLANKS.search(key):  # print-on-demand services and blank-tee makers aren't brands
            continue
        rows = db.execute("select name, host, title, image, price_usd, url from mention where key = ?", (key,)).fetchall()
        names = collections.Counter(r[0].strip() for r in rows)
        by_host = collections.defaultdict(list)
        for r in rows:
            by_host[r[1]].append(r)
        # Photos round-robin across stores, so one big reseller doesn't define the brand's look.
        items, queues = [], [list(v) for v in sorted(by_host.values(), key=len, reverse=True)]
        while len(items) < PHOTOS and any(queues):
            for q in queues:
                if q and len(items) < PHOTOS:
                    name, host, title, image, price, url = q.pop(0)
                    items.append({"title": title, "price": price, "currency": "USD", "image": image, "url": url})
        site = own_site(key, domains)
        brands.append({
            "id": "name-" + slug(key), "key": key, "name": display_name(names.most_common(1)[0][0], key),
            "site": f"https://{site}" if site else "", "host": site or "", "source": "names", "platform": "names",
            "myshopify": None, "currency": "USD", "price_low": 0, "price_mid": 0, "price_high": 0,
            "seen_at": len(by_host), "stores": [h for h, _ in sorted(by_host.items(), key=lambda kv: -len(kv[1]))[:5]],
            "items": items,
        })
    json.dump(brands, open(out_path, "w"))
    print(json.dumps({"indexed": len(brands), "with_own_site": sum(1 for b in brands if b["site"])}))


if __name__ == "__main__":
    if sys.argv[1] == "add":
        add(sys.argv[2], sys.argv[3:])
    else:
        index(sys.argv[2], sys.argv[3], sys.argv[4])
