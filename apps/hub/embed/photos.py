"""Embed listing photos for the hub.

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
            fetched = [(item, path) for item, path in pool.map(lambda i: fetch(i, folder), todo[start:start + CHUNK])]
            ready = [(item, path) for item, path in fetched if path]
            failed += len(fetched) - len(ready)
            for (item, path), vector in zip(ready, model.embed([p for _, p in ready], batch_size=64)):
                v = np.asarray(vector, dtype=np.float32)
                v = v / (np.linalg.norm(v) or 1)
                out.write(json.dumps({"listingId": item["listingId"], "readingId": item["readingId"],
                                      "vector": base64.b64encode(v.astype("<f4").tobytes()).decode()}) + "\n")
                os.remove(path)
            out.flush()
            print("embedded", start + len(ready), "of", len(todo), "failed", failed, flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
