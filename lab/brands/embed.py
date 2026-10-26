"""Check each selected brand is live, embed its product photos, and keep the ones that are mostly clothing.

Usage: venv/bin/python -I embed.py <brands.json> <embedded.json>
Writes <embedded.json> plus <embedded>.npy (one normalized CLIP vector per kept brand, same order).
Photos are cached in img/ and photo vectors in vectors.npz, both keyed by a hash of the photo URL,
so a re-run only fetches and embeds what is new.
"""
import concurrent.futures as cf, hashlib, io, json, os, re, subprocess, sys, urllib.parse
import numpy as np
from PIL import Image
from fastembed import ImageEmbedding, TextEmbedding

UA = "skeleton-lab/0.1 (research crawl)"
USD = {"USD": 1, "CAD": 0.73, "AUD": 0.66, "NZD": 0.6, "EUR": 1.08, "GBP": 1.27, "JPY": 0.0067, "SEK": 0.095, "DKK": 0.145,
       "NOK": 0.094, "CHF": 1.12, "INR": 0.012, "SGD": 0.74, "HKD": 0.128, "KRW": 0.00073, "MXN": 0.055, "ZAR": 0.055, "PHP": 0.017,
       "MYR": 0.21, "IDR": 0.000063, "BRL": 0.18, "AED": 0.27, "PLN": 0.25, "CZK": 0.043, "THB": 0.028, "TWD": 0.031, "ILS": 0.27,
       "CNY": 0.14, "TRY": 0.03, "RON": 0.22, "HUF": 0.0028, "ISK": 0.0072, "CLP": 0.0011, "COP": 0.00025, "ARS": 0.001, "PEN": 0.27,
       "VND": 0.00004, "NGN": 0.00065, "KES": 0.0077, "SAR": 0.27, "QAR": 0.27, "EGP": 0.02, "PKR": 0.0036, "BGN": 0.55, "UAH": 0.024}
# Country-code domains that are used as generic ones.
GENERIC_TLDS = {"co", "io", "me", "tv", "ai", "cc", "ly", "gg", "is", "to", "fm", "vc", "ws", "la", "sh", "so", "st", "us"}
FASHION_LABELS = {
    "fashion": ["a fashion photo of clothing", "a photo of a person wearing clothes", "a product photo of a jacket, shirt, pants or dress"],
    "other": ["a graphic t-shirt mockup with a printed logo", "a book cover", "a poster", "a sticker", "a mug", "a placeholder image",
              "a photo of food", "a vinyl record", "a toy", "a piece of jewelry", "a pair of shoes", "a bag"],
}
PHOTOS_PER_BRAND = 16


def run(args, timeout=25):
    try:
        return subprocess.run(["curl", "-sS", "-m", str(timeout), "-A", UA, *args], capture_output=True, timeout=timeout + 5).stdout
    except subprocess.TimeoutExpired:
        return b""


def key_of(url):
    return hashlib.sha1(url.encode()).hexdigest()[:20]


def meta(b):
    """Is the site up, where does it live, and for Shopify stores the name, place and currency they publish."""
    out = run(["-L", "-o", "/dev/null", "-w", "%{http_code} %{url_effective}", b["site"] + "/"], 20).decode(errors="ignore").split(" ", 1)
    code, final = (int(out[0]) if out and out[0].isdigit() else 0), (out[1] if len(out) > 1 else "")
    host = urllib.parse.urlsplit(final).hostname or b["host"]
    m = {}
    if b["platform"] == "shopify":
        try:
            m = json.loads(run([f"https://{host}/meta.json"]) or b"{}")
        except ValueError:
            m = {}
    tld = host.rsplit(".", 1)[-1]
    return b["id"], {
        # 403 and 429 mean the site is there but declining automated requests; keep it, never retry harder.
        "alive": 200 <= code < 400 or code in (403, 429),
        "name": m.get("name") or b["name"], "country": m.get("country") or (tld.upper() if len(tld) == 2 and tld not in GENERIC_TLDS else None),
        "city": m.get("city"), "currency": m.get("currency") or b["currency"] or "USD",
        "description": (m.get("description") or "")[:400],
        "site": f"https://{host}" if "myshopify" not in host else b["site"],
    }


def thumb(url):
    if re.search(r"cdn\.shopify\.com|/cdn/shop/", url):
        return url + ("&" if "?" in url else "?") + "width=256"
    return url


def fetch_image(url):
    k = key_of(url)
    path = f"img/{k}.jpg"
    if not os.path.exists(path):
        data = run(["-L", "--max-filesize", "6000000", thumb(url)])
        try:
            Image.open(io.BytesIO(data)).convert("RGB").resize((224, 224)).save(path, quality=85)
        except Exception:
            return k, None
    return k, path


def load_cache():
    if os.path.exists("vectors.npz"):
        z = np.load("vectors.npz")
        return dict(zip(z["keys"].tolist(), z["vecs"]))
    return {}


def main(brands_path, out_path):
    brands = json.load(open(brands_path))
    os.makedirs("img", exist_ok=True)
    with cf.ThreadPoolExecutor(16) as pool:
        metas = dict(pool.map(meta, brands))
    live = [b for b in brands if metas[b["id"]]["alive"]]
    print("live sites", len(live), "of", len(brands), flush=True)

    urls = sorted({i["image"] for b in live for i in b["items"][:PHOTOS_PER_BRAND]})
    with cf.ThreadPoolExecutor(24) as pool:
        paths = {k: p for k, p in pool.map(fetch_image, urls) if p}
    print("photos", len(paths), "of", len(urls), flush=True)

    cache = load_cache()
    todo = [k for k in paths if k not in cache]
    if todo:
        model = ImageEmbedding("Qdrant/clip-ViT-B-32-vision")
        for k, v in zip(todo, model.embed([paths[k] for k in todo], batch_size=64)):
            cache[k] = np.asarray(v, dtype=np.float32) / np.linalg.norm(v)
        np.savez("vectors.npz", keys=np.array(list(cache)), vecs=np.stack(list(cache.values())))
    print("embedded", len(todo), "new photos", flush=True)

    text = TextEmbedding("Qdrant/clip-ViT-B-32-text")
    label_vecs = {name: np.stack([np.asarray(v) / np.linalg.norm(v) for v in text.embed(texts)]) for name, texts in FASHION_LABELS.items()}

    out, vecs, sites = [], [], set()
    # Shopify catalogs first, so a store found by both sources keeps the fuller record.
    for b in sorted(live, key=lambda b: b["source"] != "shopify"):
        m = metas[b["id"]]
        site = m["site"].lower().replace("://www.", "://")
        if site in sites:
            continue
        rate = USD.get(m["currency"])
        ks = [(i, key_of(i["image"])) for i in b["items"][:PHOTOS_PER_BRAND]]
        ks = [(i, k) for i, k in ks if k in cache]
        fashion = [(i, k) for i, k in ks if (label_vecs["fashion"] @ cache[k]).max() > (label_vecs["other"] @ cache[k]).max()]
        share = len(fashion) / len(ks) if ks else 0
        if share < 0.6 or len(fashion) < 6 or rate is None:
            continue
        v = np.mean([cache[k] for _, k in fashion], axis=0)
        vecs.append(v / np.linalg.norm(v))
        sites.add(site)
        out.append({
            "id": b["id"], "name": m["name"], "site": m["site"], "source": b["source"], "platform": b["platform"],
            "country": m["country"], "city": m["city"], "description": m["description"], "currency": m["currency"],
            "price_low_usd": round(b["price_low"] * rate), "price_mid_usd": round(b["price_mid"] * rate),
            "price_high_usd": round(b["price_high"] * rate), "fashion_share": round(share, 2),
            "photos": [k for _, k in fashion],
            "items": [{"title": i["title"], "price_usd": round(i["price"] * rate, 2), "url": i["url"], "photo": k} for i, k in fashion][:8],
        })
    json.dump(out, open(out_path, "w"))
    np.save(out_path.rsplit(".", 1)[0] + ".npy", np.stack(vecs))
    print("brands after the image check", len(out), "of", len(live), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
