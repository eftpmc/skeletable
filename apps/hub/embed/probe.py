"""A photo classifier for category, trained on what the hub already knows.

    HUB_DATABASE_URL=... python embed/probe.py score <benchmark>
    HUB_DATABASE_URL=... python embed/probe.py write <benchmark> <at> <out.jsonl>

Learns category from photo vectors, using the categories the hub's rules, agents and people gave
(never a model's, and never the benchmark's listings, which it is scored on). `score` reports, for
each confidence cut, how many benchmark listings it would place and how often it is right, counting
an abstention as right only when the answer is "none fits". `write` predicts for active listings
with no category yet, at the chosen cut, as annotation lines for `hub annotations load`.
Needs: pip install "psycopg[binary]" scikit-learn numpy
"""

import json
import os
import sys

import numpy as np
import psycopg

MODEL = "clip-vit-b-32"
VERSION = "photo-probe-1"
CUTS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def rows(cur, query, *params):
    cur.execute(query, params)
    return cur.fetchall()


def vectors(cur, where, *params):
    found = rows(cur, f"""
        select e.listing_id::text, e.vector, x.value from embedding e join ({where}) x on x.listing_id = e.listing_id
        where e.model = %s and e.kind = 'photo'""", *params, MODEL)
    return [r[0] for r in found], np.asarray([r[1] for r in found], dtype=np.float32), [r[2] for r in found]


def train(cur, benchmark):
    from sklearn.linear_model import LogisticRegression

    ids, X, y = vectors(cur, """
        select v.listing_id, v.value #>> '{}' as value from listing_value v
        join listing_annotation a on a.id = v.annotation_id and a.method <> 'model'
        join listing l on l.id = v.listing_id and l.gone_at is null
        where v.field = 'category' and not exists (select 1 from benchmark b where b.name = %s and b.listing_id = v.listing_id)""",
                        benchmark)
    print("training on", len(ids), "listings,", len(set(y)), "categories", flush=True)
    model = LogisticRegression(max_iter=300, C=4.0)
    model.fit(X, y)
    return model


def areas(cur):
    """Each category's area, as the hub's final values pair them."""
    found = rows(cur, """
        select c.value #>> '{}', a.value #>> '{}', count(*) from listing_value c
        join listing_value a on a.listing_id = c.listing_id and a.field = 'area'
        where c.field = 'category' group by 1, 2 order by 3 desc""")
    out = {}
    for category, area, _ in found:
        out.setdefault(category, area)
    return out


def score(cur, benchmark):
    model = train(cur, benchmark)
    area_of = areas(cur)
    ids, X, answers = vectors(cur, "select listing_id, answer as value from benchmark where name = %s and answer is not null", benchmark)
    probs = model.predict_proba(X)
    best = probs.argmax(1)
    print("benchmark listings with a photo vector:", len(ids))
    for at in CUTS:
        placed = right_cat = right_area = 0
        for i, answer in enumerate(answers):
            guess = model.classes_[best[i]] if probs[i, best[i]] >= at else None
            placed += guess is not None
            right_cat += guess == answer["category"]
            right_area += (area_of.get(guess) if guess else None) == answer["area"]
        n = len(answers) or 1
        print(f"at {at:.1f}: places {placed / n:.0%}, category right {right_cat / n:.1%}, area right {right_area / n:.1%}")


def write(cur, benchmark, at, out_path):
    model = train(cur, benchmark)
    area_of = areas(cur)
    ids, X, _ = vectors(cur, """
        select l.id as listing_id, null::jsonb as value from listing l join source s on s.id = l.source_id and s.status = 'approved'
        where l.gone_at is null and not exists (select 1 from listing_value v where v.listing_id = l.id and v.field = 'category')""")
    probs = model.predict_proba(X)
    written = 0
    with open(out_path, "w", encoding="utf8") as out:
        for i, listing_id in enumerate(ids):
            k = probs[i].argmax()
            if probs[i, k] < at:
                continue
            category = model.classes_[k]
            for field, value in (("category", category), ("area", area_of.get(category))):
                if value:
                    out.write(json.dumps({"listingId": listing_id, "field": field, "value": value,
                                          "confidence": round(float(probs[i, k]), 3), "model": MODEL, "promptVersion": VERSION}) + "\n")
            written += 1
    print("placed", written, "of", len(ids), "unplaced listings with a photo vector")


if __name__ == "__main__":
    url = os.environ.get("HUB_DATABASE_URL")
    if not url or len(sys.argv) < 3 or sys.argv[1] not in ("score", "write") or (sys.argv[1] == "write" and len(sys.argv) != 5):
        sys.exit(__doc__)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        if sys.argv[1] == "score":
            score(cur, sys.argv[2])
        else:
            write(cur, sys.argv[2], float(sys.argv[3]), sys.argv[4])
