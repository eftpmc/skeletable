"""Build the Brand Neighbors test page: one HTML file with the data and photo strips inlined.

Usage: venv/bin/python -I build.py <lab.json> <out.html> [start brand id]
Run from the work directory (photos are read from img/).
"""
import base64, io, json, os, sys
from PIL import Image


def strip(b):
    """Four of the brand's clothing photos side by side, 120px squares, as a data URI."""
    tiles = []
    for k in b["photos"][:4]:
        try:
            tiles.append(Image.open(f"img/{k}.jpg").convert("RGB").resize((120, 120)))
        except OSError:
            continue
    if not tiles:
        return None
    canvas = Image.new("RGB", (120 * len(tiles), 120), "white")
    for i, t in enumerate(tiles):
        canvas.paste(t, (120 * i, 0))
    buf = io.BytesIO()
    canvas.save(buf, "JPEG", quality=72, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main(lab_path, out_path, start=None):
    lab = json.load(open(lab_path))
    slim = []
    for b in lab["brands"]:
        s = strip(b)
        if not s:
            continue
        slim.append({
            "id": b["id"], "name": b["name"], "site": b["site"], "platform": b["platform"],
            "where": ", ".join(x for x in [b.get("city"), b.get("country")] if x),
            "desc": (b.get("description") or "")[:220], "low": b["price_low_usd"], "high": b["price_high_usd"],
            "strip": s, "n": [[x["id"], x["score"]] for x in b["neighbors"]],
            "sample": [{"t": it["title"][:60], "p": it["price_usd"]} for it in b["items"][:1]],
        })
    ids = {b["id"] for b in slim}
    for b in slim:
        b["n"] = [x for x in b["n"] if x[0] in ids][:10]
    if start not in ids:
        start = max(slim, key=lambda b: next((x["quality"] for x in lab["brands"] if x["id"] == b["id"]), 0))["id"]
    data = {"brands": slim, "start": start, "stats": lab["stats"]}
    template = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "page.html")).read()
    html = template.replace("__DATA__", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
    open(out_path, "w").write(html)
    print(len(slim), "brands,", round(len(html) / 1e6, 2), "MB, starting from", start)


if __name__ == "__main__":
    main(*sys.argv[1:4])
