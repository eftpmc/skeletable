"""Build the Brand Neighbors test page: one HTML file with the data and photo strips inlined.

Usage: venv/bin/python -I build.py <lab.json> <out.html> [start brand id]
Run from the work directory (photos are read from img/). Reads <lab>.npy from rank.py and inlines
the photo vectors as int8, so the page can rank brands by a viewer's likes without a server.
"""
import base64, io, json, os, sys
import numpy as np
from PIL import Image

# One HTML page can only carry so much; the full catalog belongs in the app's backend.
PAGE_BRANDS, PAGE_STARTS = 1500, 600


def strip(b):
    """Four of the brand's clothing photos side by side, 100px squares, as a data URI."""
    tiles = []
    for k in b["photos"][:4]:
        try:
            tiles.append(Image.open(f"img/{k}.jpg").convert("RGB").resize((100, 100)))
        except OSError:
            continue
    if not tiles:
        return None
    canvas = Image.new("RGB", (100 * len(tiles), 100), "white")
    for i, t in enumerate(tiles):
        canvas.paste(t, (100 * i, 0))
    buf = io.BytesIO()
    canvas.save(buf, "JPEG", quality=70, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main(lab_path, out_path, start=None):
    lab = json.load(open(lab_path))
    V = np.load(lab_path.rsplit(".", 1)[0] + ".npy")
    best = sorted(range(len(lab["brands"])), key=lambda i: -lab["brands"][i]["quality"])[:PAGE_BRANDS]
    slim, rows = [], []
    for b, v in ((lab["brands"][i], V[i]) for i in sorted(best)):
        s = strip(b)
        if not s:
            continue
        rows.append(v)
        slim.append({
            "id": b["id"], "name": b["name"], "site": b["site"], "platform": b["platform"],
            "where": ", ".join(x for x in [b.get("city"), b.get("country")] if x),
            "desc": (b.get("description") or "")[:220], "low": b["price_low_usd"], "high": b["price_high_usd"],
            "strip": s, "q": b["quality"], "n": [[x["id"], x["score"]] for x in b["neighbors"]],
            "sample": [{"t": it["title"][:60], "p": it["price_usd"]} for it in b["items"][:1]],
        })
    ids = {b["id"] for b in slim}
    for b in slim:
        b["n"] = [x for x in b["n"] if x[0] in ids][:10]
    # Starting points from the name index: a photo strip, where we saw the brand, its neighbors.
    starts = []
    for b in sorted(lab.get("starts", []), key=lambda b: -b["seen_at"])[:PAGE_STARTS]:
        s = strip(b)
        if s:
            starts.append({"id": b["id"], "name": b["name"], "site": b["site"], "strip": s, "seen": b["seen_at"],
                           "stores": b["stores"][:3], "n": [[x["id"], x["score"]] for x in b["neighbors"] if x["id"] in ids][:10]})
    if start not in ids:
        start = max(slim, key=lambda b: next((x["quality"] for x in lab["brands"] if x["id"] == b["id"]), 0))["id"]
    q8 = np.clip(np.round(np.stack(rows) * 127 / np.abs(np.stack(rows)).max()), -127, 127).astype(np.int8)
    data = {"brands": slim, "starts": starts, "start": start, "stats": lab["stats"], "dim": int(q8.shape[1]),
            "vecs": base64.b64encode(q8.tobytes()).decode()}
    template = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "page.html")).read()
    html = template.replace("__DATA__", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
    open(out_path, "w").write(html)
    print(len(slim), "brands,", len(starts), "starting points,", round(len(html) / 1e6, 2), "MB, starting from", start)


if __name__ == "__main__":
    main(*sys.argv[1:4])
