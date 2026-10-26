"""Find each brand's nearest brands by look and price, among brands that pass the quality bar.

Usage: venv/bin/python -I rank.py <scored.json> <embedded.npy> <stats.json> <lab.json>
score(a, b) = cosine(a, b) - 0.04 * |log(price_a / price_b)| + 0.10 * quality(b)
"""
import json, math, sys
import numpy as np

QUALITY_MIN = 0.45
NEIGHBORS = 12


def main(scored_path, vectors_path, stats_path, out_path):
    brands = json.load(open(scored_path))
    V = np.load(vectors_path)
    keep = [i for i, b in enumerate(brands) if b.get("grade", 1) > 0 and b["quality"] >= QUALITY_MIN]
    pool = [brands[i] for i in keep]
    P = V[keep]
    S = P @ P.T
    mid = np.log(np.maximum([b["price_mid_usd"] for b in pool], 1))
    gap = np.abs(mid[:, None] - mid[None, :])
    q = np.array([b["quality"] for b in pool])
    score = S - 0.04 * gap + 0.10 * q[None, :]
    np.fill_diagonal(score, -math.inf)
    for i, b in enumerate(pool):
        order = np.argsort(-score[i])[:NEIGHBORS]
        b["neighbors"] = [{"id": pool[j]["id"], "score": round(float(score[i, j]), 3)} for j in order]
    stats = json.load(open(stats_path)) | {"scored": len(brands), "brands": len(pool)}
    json.dump({"brands": pool, "stats": stats}, open(out_path, "w"))
    print(len(pool), "of", len(brands), "brands pass the quality bar")


if __name__ == "__main__":
    main(*sys.argv[1:5])
