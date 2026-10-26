"""Find each brand's nearest brands by look and price, among brands that pass the quality bar.

Usage: venv/bin/python -I rank.py <scored.json> <embedded.npy> <stats.json> <lab.json>
Also writes <lab>.npy and <lab>.starts.npy: the photo vectors of the kept brands and of the starting
points, in the same order as lab.json.
score(a, b) = cosine(a, b) - 0.04 * |log(price_a / price_b)| + 0.10 * quality(b)

Brands from the name index (source "names") are starting points only: you can start from Uniqlo,
but it's never offered as a discovery. Their neighbors skip the price term (their prices are resale
prices). A name that matches a store we have, by name or by its own site, is that store instead.
"""
import json, math, sys, urllib.parse
import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import brand_key, display_name  # noqa: E402

QUALITY_MIN = 0.4
NEIGHBORS = 12


def main(scored_path, vectors_path, stats_path, out_path):
    brands = json.load(open(scored_path))
    V = np.load(vectors_path)
    keep = [i for i, b in enumerate(brands) if b["source"] != "names" and b.get("grade", 1) > 0 and b["quality"] >= QUALITY_MIN]
    pool = [brands[i] for i in keep]
    P = V[keep]
    S = P @ P.T
    mid = np.log(np.maximum([b["price_mid_usd"] for b in pool], 1))
    gap = np.abs(mid[:, None] - mid[None, :])
    q = np.array([b["quality"] for b in pool])
    score = S - 0.04 * gap + 0.10 * q[None, :]
    np.fill_diagonal(score, -math.inf)
    for i, b in enumerate(pool):
        b["name"] = display_name(b["name"], urllib.parse.urlsplit(b["site"]).hostname or "")
        order = np.argsort(-score[i])[:NEIGHBORS]
        b["neighbors"] = [{"id": pool[j]["id"], "score": round(float(score[i, j]), 3)} for j in order]
    # Starting points from the name index, unless a store already covers the name.
    store_keys = {brand_key(b["name"]) for b in brands if b["source"] != "names"}
    store_sites = {b["site"].lower().replace("://www.", "://") for b in brands if b["source"] != "names"}
    starts, start_rows = [], []
    for i, b in enumerate(brands):
        if b["source"] != "names" or b["key"] in store_keys or (b["site"] and b["site"].lower().replace("://www.", "://") in store_sites):
            continue
        sc = P @ V[i] + 0.10 * q
        order = np.argsort(-sc)[:NEIGHBORS]
        starts.append(b | {"neighbors": [{"id": pool[j]["id"], "score": round(float(sc[j]), 3)} for j in order]})
        start_rows.append(V[i])
    stats = json.load(open(stats_path)) | {"scored": len(brands), "brands": len(pool), "starts": len(starts)}
    json.dump({"brands": pool, "starts": starts, "stats": stats}, open(out_path, "w"))
    np.save(out_path.rsplit(".", 1)[0] + ".npy", P)
    np.save(out_path.rsplit(".", 1)[0] + ".starts.npy", np.stack(start_rows) if start_rows else np.zeros((0, V.shape[1])))
    print(len(pool), "brands pass the quality bar,", len(starts), "starting points from the name index")


if __name__ == "__main__":
    main(*sys.argv[1:5])
