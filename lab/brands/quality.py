"""Grade brands by hand from photo sheets, learn those grades from the photo vectors, and score every brand.

Usage:
  venv/bin/python -I quality.py sheets <embedded.json> <out-dir> [count] [seed]   # contact sheets to grade
  venv/bin/python -I quality.py train <embedded.json> <labels.json> <scored.json>

Grades (labels.json is {brand id: grade}):
  2  a distinct label: its own designs, a consistent look, photos that show care
  1  real but generic: own label, nothing you'd tell a friend about
  0  not a discovery: boutique wholesale stock, dropshipping, graphic print shops, resale,
     uniforms and promo wear, costumes, placeholders
The score is the model's expected grade divided by two, so 0 to 1. Every brand gets one,
graded or not, so a new source is ranked by the same judgment without being graded again.
"""
import json, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PER_SHEET, PHOTOS, TILE = 10, 6, 112


def font(size):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def sheets(embedded_path, out_dir, count=200, seed=1):
    import os
    brands = json.load(open(embedded_path))
    random.seed(seed)
    pick = random.sample(brands, min(count, len(brands)))
    os.makedirs(out_dir, exist_ok=True)
    f = font(15)
    index = []
    for s in range(0, len(pick), PER_SHEET):
        rows = pick[s:s + PER_SHEET]
        sheet = Image.new("RGB", (TILE * PHOTOS + 10, (TILE + 26) * len(rows)), "white")
        d = ImageDraw.Draw(sheet)
        for r, b in enumerate(rows):
            y = r * (TILE + 26)
            n = s + r
            d.text((4, y + 4), f'{n}  {b["name"][:40]}  ·  ${b["price_mid_usd"]}  ·  {b["country"] or ""}', fill="black", font=f)
            for c, k in enumerate(b["photos"][:PHOTOS]):
                sheet.paste(Image.open(f"img/{k}.jpg").resize((TILE, TILE)), (c * TILE + 4, y + 24))
            index.append({"n": n, "id": b["id"], "name": b["name"]})
        sheet.save(f"{out_dir}/sheet_{s // PER_SHEET:02d}.jpg", quality=80)
    json.dump(index, open(f"{out_dir}/index.json", "w"))
    print(len(pick), "brands on", (len(pick) + PER_SHEET - 1) // PER_SHEET, "sheets")


def train(embedded_path, labels_path, out_path):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_predict
    brands = json.load(open(embedded_path))
    V = np.load(embedded_path.rsplit(".", 1)[0] + ".npy")
    labels = json.load(open(labels_path))
    idx = {b["id"]: i for i, b in enumerate(brands)}
    graded = [(idx[k], g) for k, g in labels.items() if k in idx]
    X, y = V[[i for i, _ in graded]], np.array([g for _, g in graded])
    model = LogisticRegression(C=2.0, max_iter=2000, class_weight="balanced")
    # Held-out check: how often the model's best guess at "distinct label" agrees with a grade it didn't see.
    p = cross_val_predict(model, X, y, cv=5, method="predict_proba")
    exp = p @ model.fit(X, y).classes_
    top = exp >= 1.4
    print(json.dumps({"graded": len(y), "by_grade": {int(g): int((y == g).sum()) for g in sorted(set(y))},
                      "held_out_precision_at_grade2": round(float((y[top] == 2).mean()), 2) if top.any() else None,
                      "held_out_recall_grade2": round(float(top[y == 2].mean()), 2) if (y == 2).any() else None,
                      "held_out_zero_kept": round(float((exp[y == 0] >= 0.8).mean()), 2) if (y == 0).any() else None}))
    scores = model.predict_proba(V) @ model.classes_ / 2
    for b, s in zip(brands, scores):
        b["quality"] = round(float(s), 3)
        if b["id"] in labels:
            b["grade"] = labels[b["id"]]
    json.dump(brands, open(out_path, "w"))


if __name__ == "__main__":
    if sys.argv[1] == "sheets":
        sheets(sys.argv[2], sys.argv[3], *(int(a) for a in sys.argv[4:6]))
    else:
        train(sys.argv[2], sys.argv[3], sys.argv[4])
