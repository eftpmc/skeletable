"""Recompute the audit without network access. Run from any working directory."""
import json
from collections import Counter
from pathlib import Path

folder = Path(__file__).resolve().parent
audit = json.loads((folder / "2026-10-26-coverage.json").read_text(encoding="utf-8"))
rows = audit["results"]
assert len(rows) == audit["sampleSize"] == 24
assert len({r["name"] for r in rows}) == 24
assert len({r["site"] for r in rows}) == 24

def discovered(row):
    return len({u for d in row["discoveries"] for u in d["productUrls"]})

def parsed(row):
    return [r["product"] for r in row["reads"] if r["product"] is not None]

products = [p for row in rows for p in parsed(row)]
assert all(p["title"] and p["priceCents"] >= 0 for p in products)
summary = {
    "sample": len(rows),
    "homepageStates": dict(Counter(r["state"] for r in rows)),
    "storesWithDiscoveredLinks": sum(discovered(r) > 0 for r in rows),
    "storesWithParsedProducts": sum(bool(parsed(r)) for r in rows),
    "productReadsAttempted": sum(len(r["reads"]) for r in rows),
    "productsParsed": len(products),
    "productsWithCurrencyAndImage": sum(bool(p["currency"] and p["images"]) for p in products),
    "productsWithBrand": sum(bool(p["brand"]) for p in products),
    "productsWithGtin": sum(bool(p["gtin"]) for p in products),
    "productsWithMpn": sum(bool(p["mpn"]) for p in products),
    "categories": [],
}
for category in ["clothing", "electronics", "home", "resale"]:
    group = [r for r in rows if r["category"] == category]
    summary["categories"].append({"category": category, "sample": len(group),
        "discovery": sum(discovered(r) > 0 for r in group),
        "parsed": sum(bool(parsed(r)) for r in group)})
assert sum(summary["homepageStates"].values()) == 24
assert sum(r["sample"] for r in summary["categories"]) == 24
(folder / "2026-10-26-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
print("\n| Store | Category | First page | Discovered links | Parsed / attempted |")
print("|---|---|---|---:|---:|")
for r in sorted(rows, key=lambda r: (r["category"], r["name"])):
    print(f'| {r["name"]} | {r["category"]} | {r["state"]} | {discovered(r)} | {len(parsed(r))} / {len(r["reads"])} |')
