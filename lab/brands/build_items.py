"""items.py build: the catalog pack with each brand's products, sorted and embedded. See items.py."""
import base64, collections, concurrent.futures as cf, gzip, io, json, math, os, random, re, subprocess

import numpy as np
from PIL import Image

from common import USD
from items import ITEMS, key_of, photos_of, read_pack
from taxonomy import category, clean_title, department_words, is_kids, women_by_garment

UA = "skeleton-lab/0.1 (research crawl)"
# Read a few more than we keep, since some turn out not to be clothing or not to load.
CANDIDATES = ITEMS + 12
# A brand needs this many products to stay in the catalog.
MIN_ITEMS = 4
# The model's call on a department counts only when it's this sure; between the two it's unisex.
SURE = 0.75
# A brand whose labeled products are this one-sided lends its department to the rest.
BRAND_LEAN = 0.85
BRAND_LABELED = 4


def https(url):
    if not url:
        return None
    url = "https:" + url if url.startswith("//") else url
    return url if url.startswith(("http://", "https://")) else None


def thumb(url):
    if re.search(r"cdn\.shopify\.com|/cdn/shop/", url):
        url = re.sub(r"([?&])width=\d+&?", r"\1", url).rstrip("?&")
        return url + ("&" if "?" in url else "?") + "width=256"
    return url


def handle_of(url):
    m = re.search(r"/products/([^/?#]+)", url or "")
    return m.group(1) if m else None


def shop_products(r):
    """The store's products from products.json, newest first, in the store's currency, or None."""
    path = f"products/{key_of(r['site'] or r['name'])}.json"
    if not os.path.exists(path):
        return None
    d = json.load(open(path))
    if d["status"] != "ok":
        return None
    out = []
    for p in d["products"]:
        variants = p.get("variants") or []
        prices = [float(v["price"]) for v in variants if v.get("price")]
        image = https((p.get("images") or [{}])[0].get("src"))
        if not prices or not image or not p.get("handle"):
            continue
        out.append({
            "title": (p.get("title") or "").strip(), "type": p.get("product_type") or "", "tags": p.get("tags") or [],
            "image": image, "price": min(prices), "url": f"https://{d['host']}/products/{p['handle']}",
            "available": any(v.get("available") for v in variants),
        })
    return out


def usd_rate(r, products):
    """Prices in products.json are in the store's currency. The pack has the same products in dollars,
    so their ratio is the rate; it snaps to the nearest known currency so one odd price can't skew it."""
    usd = {handle_of(p["productUrl"]): p["priceUsd"] for p in photos_of(r) if p.get("priceUsd")}
    ratios = [usd[h] / p["price"] for p in products if (h := handle_of(p["url"])) in usd and p["price"] > 0]
    if not ratios:
        if not r.get("priceLowUsd") or not products:
            return None
        mid_usd = (r["priceLowUsd"] + r["priceHighUsd"]) / 2
        ratios = [mid_usd / max(sorted(p["price"] for p in products)[len(products) // 2], 0.01)]
    raw = sorted(ratios)[len(ratios) // 2]
    return min(USD.values(), key=lambda rate: abs(math.log(rate / raw)))


def candidates(r):
    """Up to CANDIDATES products for a brand, as {title, type, tags, image, priceUsd, url}, one per style."""
    shop = shop_products(r)
    rate = usd_rate(r, shop) if shop else None
    if shop and rate:
        # In stock first, keeping the store's order otherwise.
        rows = sorted(shop, key=lambda p: not p["available"])
        rows = [dict(p, priceUsd=round(p["price"] * rate, 2)) for p in rows]
    else:
        rows = [{"title": p.get("title") or "", "type": "", "tags": [], "image": p["imageUrl"], "priceUsd": p.get("priceUsd"),
                 "url": p.get("productUrl")} for p in photos_of(r)]
    out, styles = [], set()
    for p in rows:
        # One colour of a style is enough: "Sofia Dress - Oat Leopard" and "Sofia Dress - Black" are one style.
        style = clean_title(p["title"]).strip().lower() or p["image"]
        if style in styles or is_kids(p["title"], p["type"], p["tags"]):
            continue
        cat, how = category(p["title"], p["type"], p["tags"])
        if cat == "other":
            continue
        styles.add(style)
        out.append(dict(p, category=cat, how=how, words=department_words(p["title"], p["type"], p["tags"])))
        if len(out) == CANDIDATES:
            break
    return out


def fetch_image(url):
    k = key_of(url)
    path = f"img/{k}.jpg"
    if not os.path.exists(path):
        try:
            data = subprocess.run(["curl", "-sS", "-L", "-m", "25", "-A", UA, "--max-filesize", "8000000", thumb(url)],
                                  capture_output=True, timeout=30).stdout
            Image.open(io.BytesIO(data)).convert("RGB").resize((224, 224)).save(path, quality=85)
        except Exception:  # noqa: BLE001 - a photo that won't load just isn't used
            return k, None
    return k, path


def embed(urls):
    from fastembed import ImageEmbedding

    os.makedirs("img", exist_ok=True)
    cache = {}
    if os.path.exists("item_vectors.npz"):
        z = np.load("item_vectors.npz")
        cache = dict(zip(z["keys"].tolist(), z["vecs"].astype(np.float32)))
    with cf.ThreadPoolExecutor(24) as pool:
        paths = {k: p for k, p in pool.map(fetch_image, sorted(set(urls))) if p}
    print("photos", len(paths), "of", len(set(urls)), flush=True)
    todo = [k for k in paths if k not in cache]
    if todo:
        model = ImageEmbedding("Qdrant/clip-ViT-B-32-vision")
        for start in range(0, len(todo), 2000):
            chunk = todo[start:start + 2000]
            for k, v in zip(chunk, model.embed([paths[k] for k in chunk], batch_size=64)):
                cache[k] = np.asarray(v, dtype=np.float32) / np.linalg.norm(v)
            np.savez("item_vectors.tmp.npz", keys=np.array(list(cache)), vecs=np.stack(list(cache.values())).astype(np.float16))
            os.replace("item_vectors.tmp.npz", "item_vectors.npz")
            print("embedded", start + len(chunk), "of", len(todo), flush=True)
    return cache


def fit(X, y, name):
    """A logistic regression on photo vectors, with its accuracy on a fifth held out."""
    from sklearn.linear_model import LogisticRegression

    idx = list(range(len(y)))
    random.Random(3).shuffle(idx)
    cut = len(idx) // 5
    test, train = idx[:cut], idx[cut:]
    m = LogisticRegression(max_iter=3000, C=4.0, class_weight="balanced")
    m.fit(X[train], [y[i] for i in train])
    acc = float(np.mean(m.predict(X[test]) == np.array([y[i] for i in test])))
    print(f"{name}: {len(train)} train, {len(test)} held out, accuracy {acc:.3f}", flush=True)
    m.fit(X, y)
    return m, acc


def pack_vector(v):
    """512 floats as 512 signed bytes: the importer normalizes again, so the scale doesn't matter."""
    q = np.clip(np.round(v / (np.abs(v).max() or 1) * 127), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode()


def build(pack_path, out_path):
    pack = [r for r in read_pack(pack_path) if r["kind"] == "store"]
    per = {r["name"]: candidates(r) for r in pack}
    vecs = embed([p["image"] for ps in per.values() for p in ps])
    rows = [(r, p) for r in pack for p in per[r["name"]] if key_of(p["image"]) in vecs]
    X = np.stack([vecs[key_of(p["image"])] for _, p in rows])
    stats = collections.Counter()

    # Category: the words when they name one; otherwise a model trained on the products whose words did.
    known = [i for i, (_, p) in enumerate(rows) if p["category"]]
    cat_model, cat_acc = fit(X[known], [rows[i][1]["category"] for i in known], "category")
    for i, (_, p) in enumerate(rows):
        if not p["category"]:
            probs = cat_model.predict_proba(X[i:i + 1])[0]
            best = int(np.argmax(probs))
            p["category"], p["how"] = (cat_model.classes_[best], "photo") if probs[best] >= 0.5 else (None, None)
        stats[f"category by {p['how']}"] += 1

    # Department: the words first, then what the garment says, then the brand's lean, then the photo.
    labeled = [i for i, (_, p) in enumerate(rows) if p["words"] in ("women", "men")]
    dep_model, dep_acc = fit(X[labeled], [rows[i][1]["words"] for i in labeled], "department")
    women_col = list(dep_model.classes_).index("women")
    p_women = dep_model.predict_proba(X)[:, women_col]
    lean = {}
    for r in pack:
        sides = [("women" if p["words"] == "women" or (not p["words"] and women_by_garment(p["category"], p["title"])) else p["words"])
                 for p in per[r["name"]]]
        sides = [s for s in sides if s in ("women", "men")]
        if len(sides) >= BRAND_LABELED:
            for side in ("women", "men"):
                if sides.count(side) / len(sides) >= BRAND_LEAN:
                    lean[r["name"]] = side
    for i, (r, p) in enumerate(rows):
        if p["words"]:
            p["department"], how = p["words"], "words"
        elif women_by_garment(p["category"], p["title"]):
            p["department"], how = "women", "garment"
        elif r["name"] in lean:
            p["department"], how = lean[r["name"]], "brand"
        else:
            pw = p_women[i]
            p["department"], how = ("women" if pw >= SURE else "men" if pw <= 1 - SURE else "unisex"), "photo"
        stats[f"department by {how}"] += 1

    by_brand = collections.defaultdict(list)
    for i, (r, p) in enumerate(rows):
        if p["category"]:
            by_brand[r["name"]].append((p, X[i]))
    n_brands = n_items = 0
    deps, cats = collections.Counter(), collections.Counter()
    with gzip.GzipFile(out_path, "wb", mtime=0) as out:
        for r in pack:
            items = by_brand.get(r["name"], [])[:ITEMS]
            if len(items) < MIN_ITEMS:
                stats["brands dropped (too few products)"] += 1
                continue
            share = collections.Counter(p["department"] for p, _ in items)
            sided = share["women"] + share["men"]
            department = ("women" if share["women"] >= 0.8 * sided else "men" if share["men"] >= 0.8 * sided else "both") if sided else "both"
            rec = {k: v for k, v in r.items() if k not in ("photos", "items")}
            rec["department"] = department
            rec["items"] = [{
                "imageUrl": p["image"], "title": (p["title"] or None) and p["title"][:300], "priceUsd": p["priceUsd"],
                "productUrl": https(p["url"]), "category": p["category"], "department": p["department"], "look": pack_vector(v),
            } for p, v in items]
            out.write((json.dumps(rec, ensure_ascii=False) + "\n").encode())
            n_brands += 1
            n_items += len(items)
            deps[department] += 1
            cats.update(p["category"] for p, _ in items)
    report = {"brands": n_brands, "items": n_items, "category_accuracy": round(cat_acc, 3), "department_accuracy": round(dep_acc, 3),
              "brand_departments": dict(deps), "categories": dict(cats.most_common()), **dict(stats)}
    json.dump(report, open("items_report.json", "w"), indent=1)
    print(json.dumps(report, indent=1))
