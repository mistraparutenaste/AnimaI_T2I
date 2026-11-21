#!/usr/bin/env python3
"""Check every tag in csv/*.csv against Danbooru (read-only public API).

Reports tags that are aliases, deprecated, unused (0 posts), missing or rare
(< 100 posts). Model-specific tags (quality / aesthetic / year / rating) and
the tags in the official model-card negatives are allowed.

Usage:  python3 tests/check-danbooru.py      (exit code 1 when problems remain)
Only tag names are sent to danbooru.donmai.us.
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://danbooru.donmai.us"
UA = {"User-Agent": "tag-audit-script/1.0"}
BATCH = 80

# Not Danbooru tags, but understood by the supported models.
ALLOWED = {
    "masterpiece", "best_quality", "good_quality", "normal_quality", "low_quality", "worst_quality",
    "bad_quality", "very_aesthetic", "aesthetic", "displeasing", "very_displeasing", "high_score",
    "great_score", "good_score", "average_score", "bad_score", "low_score", "very_awa", "newest",
    "recent", "mid", "early", "old", "oldest", "safe", "sensitive", "nsfw", "explicit", "general",
    "questionable",
    # official model-card negatives (Animagine XL 4.0 / Illustrious)
    "text", "username",
}


def is_allowed(tag):
    return tag in ALLOWED or (tag.startswith("year_") and tag[5:].isdigit())


def get(path, params):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:  # rate limit / transient network error
            time.sleep(2 + attempt * 3)
    raise RuntimeError("request failed: " + url)


def norm(tag):
    return tag.strip().replace("\\(", "(").replace("\\)", ")").lower().replace(" ", "_")


def main():
    entries = []  # (file, japanese, tag)
    csv_dir = os.path.join(ROOT, "csv")
    for fn in sorted(os.listdir(csv_dir)):
        if not fn.endswith(".csv"):
            continue
        with open(os.path.join(csv_dir, fn), encoding="utf-8") as f:
            for row in list(csv.reader(f))[1:]:
                if len(row) >= 2 and row[0].strip() and row[1].strip():
                    for t in row[1].split(","):
                        if t.strip():
                            entries.append((fn, row[0].strip(), norm(t)))

    names = sorted({t for _, _, t in entries if not is_allowed(t)})
    found, aliases = {}, {}
    for i in range(0, len(names), BATCH):
        batch = ",".join(names[i:i + BATCH])
        for t in get("/tags.json", {"search[name_comma]": batch, "limit": 1000,
                                    "only": "name,post_count,is_deprecated"}):
            found[t["name"]] = t
        for a in get("/tag_aliases.json", {"search[antecedent_name_comma]": batch, "limit": 1000,
                                           "search[status]": "active",
                                           "only": "antecedent_name,consequent_name"}):
            aliases[a["antecedent_name"]] = a["consequent_name"]
        time.sleep(0.4)

    problems = []
    seen = set()
    for fn, jp, tag in entries:
        if is_allowed(tag) or (fn, tag) in seen:
            continue
        seen.add((fn, tag))
        t = found.get(tag)
        if tag in aliases:
            problems.append((fn, jp, tag, f"エイリアス → {aliases[tag]}"))
        elif not t:
            problems.append((fn, jp, tag, "存在しない"))
        elif t["is_deprecated"]:
            problems.append((fn, jp, tag, "廃止済み"))
        elif t["post_count"] < 100:
            problems.append((fn, jp, tag, f"投稿 {t['post_count']} 件"))

    print(f"checked {len(names)} unique tags")
    for p in problems:
        print("  {} | {} | {} | {}".format(*p))
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
