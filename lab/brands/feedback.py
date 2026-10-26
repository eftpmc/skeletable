"""Turn votes from the test page into quality grades, merged with the hand grades.

Usage: python3 -I feedback.py <votes-dir> <labels.json> <merged-labels.json>

<votes-dir> holds the page's `votes` collection as one JSON file per vote ({brand, user, verdict}),
as ArtifactData list with out_dir writes it. Only quality signals count here:
  like  -> the brand is a real find (grade 2)
  flag  -> "not a real brand" (grade 0)
  skip  -> "not for me" is taste, not quality, so it changes nothing here
A brand whose likes outnumber its flags gets grade 2, the reverse gets 0. A hand grade stands
unless at least two people voted on the brand and they disagree with it; then the people win.
Then: quality.py train <embedded.json> <merged-labels.json> <scored.json>.
"""
import collections, glob, json, os, sys

MIN_VOTERS_TO_OVERRIDE = 2


def votes_in(path):
    for f in glob.glob(os.path.join(path, "**", "*.json"), recursive=True):
        v = json.load(open(f))
        v = v.get("data", v)  # tolerate a wrapper around the document body
        if v.get("brand") and v.get("user") and v.get("verdict") in ("like", "skip", "flag"):
            yield v


def main(votes_dir, labels_path, out_path):
    per_brand = collections.defaultdict(dict)  # brand -> {user: verdict}, one vote per person
    for v in votes_in(votes_dir):
        per_brand[v["brand"]][v["user"]] = v["verdict"]
    labels = json.load(open(labels_path))
    merged, added, overridden = dict(labels), 0, 0
    for brand, by_user in per_brand.items():
        likes = sum(1 for x in by_user.values() if x == "like")
        flags = sum(1 for x in by_user.values() if x == "flag")
        if likes == flags:
            continue
        grade = 2 if likes > flags else 0
        if brand not in labels:
            merged[brand] = grade
            added += 1
        elif labels[brand] != grade and likes + flags >= MIN_VOTERS_TO_OVERRIDE:
            merged[brand] = grade
            overridden += 1
    json.dump(merged, open(out_path, "w"), indent=0)
    people = {u for by_user in per_brand.values() for u in by_user}
    print(json.dumps({"votes": sum(len(x) for x in per_brand.values()), "people": len(people), "brands_voted": len(per_brand),
                      "hand_grades": len(labels), "added_from_votes": added, "hand_grades_overridden": overridden,
                      "merged": len(merged)}))


if __name__ == "__main__":
    main(*sys.argv[1:4])
