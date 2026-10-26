"""Grow the catalog in rounds: read more Web Data Commons files, then redo every later step.

Usage: venv/bin/python -I grow.py [parts-per-round] [rounds]     # run from the work directory

Each round reads the next unread files (a fixed random order over all 1,658), adds their stores
and brand mentions, then selects, embeds what's new, folds in grades and votes, retrains quality,
ranks and rebuilds the page. Every step reuses its caches, so a round costs only what's new, and a
stopped run picks up where it left off. Progress is in grow_state.json, one summary line per round
in grow.log. The work directory needs cand_shopify.jsonl (sources/shopify.py) and wdc_lookup.csv
(Product_lookup.csv from Web Data Commons).
"""
import concurrent.futures as cf, glob, json, os, random, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
WDC = "https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/Product"
TOTAL_PARTS = 1658
WORKERS = 4


def sh(*args, **kw):
    print("$", " ".join(str(a) for a in args), flush=True)
    return subprocess.run([str(a) for a in args], check=True, **kw)


def read_part(i):
    """Download one part, parse it, delete it. Returns the part number once its counts exist."""
    out = f"wdc/cand_{i}.jsonl"
    if os.path.exists(f"wdc/cand_{i}.count.json"):
        return i
    gz = f"wdc/part_{i}.gz"
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "-m", "900", "-o", gz, f"{WDC}/part_{i}.gz"])
        if r.returncode == 0:
            break
        time.sleep(2 ** (attempt + 1))
    try:
        subprocess.run([PY, "-I", f"{HERE}/sources/wdc.py", out, gz], check=True, capture_output=True)
    finally:
        if os.path.exists(gz):
            os.remove(gz)
    return i


def stats(state):
    counts = [json.load(open(f)) for f in glob.glob("wdc/cand_*.count.json")]
    base = json.load(open(f"{HERE}/stats.json"))
    embedded = json.load(open("embedded.json"))
    merged = "labels-merged.json" if os.path.exists("labels-merged.json") else f"{HERE}/labels.json"
    meta = json.load(open("meta_cache.json"))
    selected = json.load(open("sel_all.json"))
    return {
        "shopify_stores": base["shopify_stores"], "shopify_catalogs": base["shopify_catalogs"],
        "wdc_parts": len(state["done"]), "wdc_parts_total": TOTAL_PARTS,
        "wdc_sites": sum(c["sites_8plus"] for c in counts),
        "selected": len(selected), "live": sum(1 for b in selected if meta.get(b["id"], {}).get("alive")),
        "embedded": sum(1 for b in embedded if b["source"] != "names"),
        "named": sum(1 for b in embedded if b["source"] == "names"),
        "brand_mentions": sum(c["brand_mentions"] for c in counts),
        "graded": len(json.load(open(merged))),
    }


def round_(state, n):
    todo = [i for i in state["order"] if i not in state["done"]][:n]
    if todo:
        with cf.ThreadPoolExecutor(WORKERS) as pool:
            for i in pool.map(read_part, todo):
                state["done"].append(i)
                json.dump(state, open("grow_state.json", "w"))
                print("read part", i, f'({len(state["done"])}/{TOTAL_PARTS})', flush=True)
        names = [f for f in glob.glob("wdc/cand_*.names.jsonl")]
        if names:
            sh(PY, "-I", f"{HERE}/names.py", "add", "names.db", *names)
            for f in names:
                os.remove(f)
    sh(PY, "-I", f"{HERE}/select.py", "sel_all.json", "cand_shopify.jsonl", *sorted(glob.glob("wdc/cand_*.jsonl")))
    sh(PY, "-I", f"{HERE}/names.py", "index", "names.db", "wdc_lookup.csv", "names_brands.json")
    json.dump(json.load(open("sel_all.json")) + json.load(open("names_brands.json")), open("brands_in.json", "w"))
    sh(PY, "-I", f"{HERE}/embed.py", "brands_in.json", "embedded.json")
    labels = "labels-merged.json" if os.path.exists("labels-merged.json") else f"{HERE}/labels.json"
    sh(PY, "-I", f"{HERE}/quality.py", "train", "embedded.json", labels, "scored.json")
    s = stats(state)
    json.dump(s, open("stats_run.json", "w"))
    sh(PY, "-I", f"{HERE}/rank.py", "scored.json", "embedded.npy", "stats_run.json", "lab.json")
    sh(PY, "-I", f"{HERE}/page/build.py", "lab.json", "brand-neighbors.html", "line-of-oslo-demo-myshopify-com")
    lab = json.load(open("lab.json"))
    line = s | {"at": time.strftime("%Y-%m-%d %H:%M"), "brands": len(lab["brands"]), "starts": len(lab["starts"])}
    open("grow.log", "a").write(json.dumps(line) + "\n")
    print("round done", json.dumps(line), flush=True)


def main(n=100, rounds=1):
    os.makedirs("wdc", exist_ok=True)
    if os.path.exists("grow_state.json"):
        state = json.load(open("grow_state.json"))
    else:
        order = list(range(TOTAL_PARTS))
        random.Random(11).shuffle(order)
        state = {"order": order, "done": [int(f.split("_")[1].split(".")[0]) for f in glob.glob("wdc/cand_*.count.json")]}
    for _ in range(rounds):
        round_(state, n)
        if len(state["done"]) >= TOTAL_PARTS:
            break


if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:3]))
