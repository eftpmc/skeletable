"""Embed listing photos for the hub.

Against a hub over its API (a curator's token in HUB_TOKEN):

    HUB_TOKEN=... python embed/photos.py --hub https://hub.example

Or with files, next to the hub's database:

    hub photos todo todo.jsonl [count]      # the listings that need a photo vector
    python embed/photos.py todo.jsonl out.jsonl
    hub photos load out.jsonl

Reads lines of { listingId, readingId, image }, fetches each photo as a small thumbnail, embeds it
with CLIP ViT-B/32 (the same model as the lab's vectors) and writes { listingId, readingId, vector },
the vector unit-length float32 in base64. Lines already in the output are skipped, so a stopped run
picks up where it left off. Needs: pip install fastembed pillow
"""

import base64
import concurrent.futures as cf
import io
import json
import os
import re
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image

UA = "Mozilla/5.0 (compatible; SkeletonBot/0.1; +https://github.com/eftpmc/skeleton)"
MODEL = "Qdrant/clip-ViT-B-32-vision"
CHUNK = 512


def thumb(url):
    """Shopify's CDN serves any width; 400px is plenty for a 224px model and a fraction of the bytes."""
    if "cdn.shopify.com" in url or "/cdn/shop/" in url:
        url = re.sub(r"([?&])width=\d+", r"\1", url)
        return url + ("&" if "?" in url else "?") + "width=400"
    return url


def fetch(item, folder):
    path = os.path.join(folder, item["listingId"] + ".jpg")
    try:
        req = urllib.request.Request(thumb(item["image"]), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as res:
            data = res.read(8_000_000)
        Image.open(io.BytesIO(data)).convert("RGB").resize((224, 224)).save(path, quality=85)
        return item, path
    except Exception:  # noqa: BLE001 - a photo that won't load is left for another run
        return item, None


def embed_items(model, items, folder, pool):
    """The vector lines for the items whose photos load, and how many didn't."""
    fetched = list(pool.map(lambda i: fetch(i, folder), items))
    ready = [(item, path) for item, path in fetched if path]
    lines = []
    for (item, path), vector in zip(ready, model.embed([p for _, p in ready], batch_size=64)):
        v = np.asarray(vector, dtype=np.float32)
        v = v / (np.linalg.norm(v) or 1)
        lines.append(json.dumps({"listingId": item["listingId"], "readingId": item["readingId"],
                                 "vector": base64.b64encode(v.astype("<f4").tobytes()).decode()}))
        os.remove(path)
    return lines, len(fetched) - len(ready)


def hub_call(hub, token, method, path, body=None):
    req = urllib.request.Request(hub.rstrip("/") + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read())


def from_hub(hub, token):
    from fastembed import ImageEmbedding

    model = ImageEmbedding(MODEL)
    done = failed = 0
    skip = set()  # photos that wouldn't load this run, so they aren't asked for again and again
    with tempfile.TemporaryDirectory() as folder, cf.ThreadPoolExecutor(16) as pool:
        while True:
            todo = [i for i in hub_call(hub, token, "GET", f"/api/photos/todo?limit={CHUNK + len(skip)}") if i["listingId"] not in skip]
            if not todo:
                break
            lines, missed = embed_items(model, todo[:CHUNK], folder, pool)
            sent = {json.loads(line)["listingId"] for line in lines}
            skip.update(i["listingId"] for i in todo[:CHUNK] if i["listingId"] not in sent)
            result = hub_call(hub, token, "POST", "/api/photos", {"lines": lines}) if lines else {"stored": 0}
            done += result["stored"]
            failed += missed
            print("embedded", done, "failed", failed, flush=True)
            if not lines:
                break


def main(todo_path, out_path):
    from fastembed import ImageEmbedding

    done = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf8") as f:
            done = {json.loads(line)["listingId"] for line in f if line.strip()}
    with open(todo_path, encoding="utf8") as f:
        todo = [item for item in (json.loads(line) for line in f if line.strip()) if item["listingId"] not in done]
    print("to embed", len(todo), "already done", len(done), flush=True)
    model = ImageEmbedding(MODEL)
    failed = 0
    with open(out_path, "a", encoding="utf8") as out, tempfile.TemporaryDirectory() as folder, cf.ThreadPoolExecutor(16) as pool:
        for start in range(0, len(todo), CHUNK):
            lines, missed = embed_items(model, todo[start:start + CHUNK], folder, pool)
            failed += missed
            out.writelines(line + "\n" for line in lines)
            out.flush()
            print("embedded", start + len(lines), "of", len(todo), "failed", failed, flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--hub":
        if not os.environ.get("HUB_TOKEN"):
            sys.exit("set HUB_TOKEN to a curator's hub token")
        from_hub(sys.argv[2], os.environ["HUB_TOKEN"])
    elif len(sys.argv) == 3:
        main(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
