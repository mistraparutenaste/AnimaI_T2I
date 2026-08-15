#!/usr/bin/env python3
"""CSVタグデータの重複・欠落・不整合を解析する監査スクリプト"""
import csv
import io
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(ROOT, "csv")

def parse(path):
    items = []
    with open(path, encoding="utf-8") as f:
        for row in csv.reader(f, quotechar='"'):
            if not row or not "".join(row).strip():
                continue
            if row[0].strip() == "Japanese":
                continue
            jp = row[0].strip()
            en = (row[1] if len(row) > 1 else "").strip()
            if jp and en:
                items.append((jp, en))
    return items

cats = {}
for fname in sorted(os.listdir(CSV_DIR)):
    if fname.endswith(".csv"):
        cats[fname[:-4]] = parse(os.path.join(CSV_DIR, fname))

print("=" * 70)
print("1) 同一カテゴリ内の完全重複プロンプト")
print("=" * 70)
for cid, items in cats.items():
    seen = defaultdict(list)
    for jp, en in items:
        # multi-tag entries: split for per-tag analysis
        for t in en.split(","):
            t = t.strip().lower()
            if t:
                seen[t].append(jp)
    dups = {t: jps for t, jps in seen.items() if len(jps) > 1}
    if dups:
        print(f"\n[{cid}]")
        for t, jps in sorted(dups.items()):
            print(f"  {t!r}  <- {jps}")

print()
print("=" * 70)
print("2) カテゴリ間で重複しているプロンプト")
print("=" * 70)
tag_owners = defaultdict(set)
tag_jp = {}
for cid, items in cats.items():
    for jp, en in items:
        for t in en.split(","):
            t = t.strip().lower()
            if t:
                tag_owners[t].add(cid)
                tag_jp.setdefault(t, jp)
cross = {t: sorted(owners) for t, owners in tag_owners.items() if len(owners) > 1}
for t, owners in sorted(cross.items()):
    print(f"  {t!r} ({tag_jp[t]}) in: {', '.join(owners)}")

print()
print("=" * 70)
print("print(3) 日本語名が同じで英語タグが違うエントリ(表記ゆれ候補)")
print("=" * 70)
jp_map = defaultdict(set)
for cid, items in cats.items():
    for jp, en in items:
        jp_norm = jp.replace("／", "/").split("/")[0].strip()
        jp_map[jp_norm].add(en)
for jp, ens in sorted(jp_map.items()):
    if len(ens) > 1:
        print(f"  {jp!r}: {sorted(ens)}")

print()
print("=" * 70)
print("4) SFW/NSFWの境界問題: NSFWカテゴリにあるべきSFW側タグ・その逆")
print("=" * 70)
nsfw_only_hint = []
for cid in cats:
    if cid.startswith("n_"):
        for jp, en in cats[cid]:
            low = en.lower()
            if any(w in low for w in ["girl", "boy", "woman", "man"]) and not any(
                w in low for w in ["breast", "nude", "naked", "sex", "cum", "penis",
                                    "nipple", "panties", "bondage", "ahegao", "fellatio",
                                    "handjob", "penetrat", "creampie", "masturb"]):
                nsfw_only_hint.append((cid, jp, en))
for cid, jp, en in nsfw_only_hint:
    print(f"  [{cid}] {jp} = {en}")

print()
print("=" * 70)
print("5) 構図系タグの散在 (pose vs composition vs n_pose)")
print("=" * 70)
for cid in ["pose", "composition", "n_pose"]:
    if cid in cats:
        tags = [en for _, en in cats[cid]]
        overlap_terms = ["from behind", "from above", "from below", "looking at viewer",
                          "lying on back", "lying on stomach", "kneeling", "all fours"]
        found = [t for t in tags if any(o in t.lower() for o in overlap_terms)]
        print(f"  [{cid}] {found}")

print()
print("=" * 70)
print("6) 品質カテゴリの古い/非推奨タグ")
print("=" * 70)
for jp, en in cats.get("quality", []):
    print(f"  {jp} = {en}")

print()
print("=" * 70)
print("7) Danbooru標準から見た欠落チェック (主要タグがcsvに存在するか)")
print("=" * 70)
# key danbooru tags that should exist somewhere
expected = {
    "subject": ["solo", "multiple girls", "multiple boys", "1other", "crowd", "couple"],
    "hair": ["ahoge", "twintails", "braid", "ponytail", "hair between eyes", "bangs",
              "one side up", "two side up", "drill hair", "hime cut", "bob cut",
              "long hair", "very long hair", "absurdly long hair", "short hair"] + 
              [f"{c} hair" for c in ["black", "blonde", "brown", "red", "blue", "pink",
                                        "silver", "white", "purple", "green", "orange", "grey", "aqua"]],
    "expression": ["smile", "grin", "crying", "crying with eyes open", "blush", "open mouth",
                    "closed mouth", "parted lips", "smirk", "frown", "wink", "closed eyes",
                    "half-closed eyes", "tears", "sweat", "embarrassed", "surprised", "shocked",
                    "angry", "pout", "giggle", "laughing"],
    "clothing": ["shirt", "skirt", "dress", "pantyhose", "thighhighs", "kneehighs", "socks",
                  "shoes", "boots", "barefoot", "bare shoulders", "detached sleeves",
                  "long sleeves", "short sleeves", "sleeveless", "collar", "bow", "ribbon",
                  "necktie", "belt", "cape", "hood", "jacket", "vest", "uniform"],
    "pose": ["standing", "sitting", "kneeling",
              "squatting", "leaning forward", "arms behind back", "hands on hips",
              "arms crossed", "hand on own face", "head tilt", "looking back", "walking", "running",
              "jumping", "floating", "hand up", "reaching", "outstretched arm", "stretching"],
    "composition": ["upper body", "full body", "portrait", "cowboy shot", "dutch angle",
                     "from above", "from below", "from side", "from behind", "pov",
                     "close-up", "wide shot", "dutch angle", "fisheye", "silhouette",
                     "profile", "back", "over the shoulder"],
    "background": ["outdoors", "indoors", "simple background", "white background",
                    "black background", "blurry background", "scenery", "cityscape", "sky",
                    "night", "day", "sunset", "sunlight", "moonlight", "water", "nature"],
    "effect": ["lens flare", "depth of field", "bokeh", "cinematic lighting", "backlighting",
                "rim lighting", "god rays", "particles", "sparkle", "glowing", "motion blur",
                "wind", "rain", "snow", "cherry blossoms", "falling leaves", "fog", "dust"],
    "rating": ["safe", "sensitive", "questionable", "explicit", "nsfw"],
}
all_prompts_lower = set()
for cid, items in cats.items():
    for jp, en in items:
        for t in en.split(","):
            all_prompts_lower.add(t.strip().lower())

for section, tags in expected.items():
    missing = [t for t in tags if t.lower() not in all_prompts_lower]
    if missing:
        print(f"  [{section}] 欠落: {missing}")

print()
print("=" * 70)
print("8) カテゴリ別タグ数サマリ")
print("=" * 70)
total = 0
for cid in sorted(cats):
    n = len(cats[cid])
    total += n
    print(f"  {cid:22s} {n:3d}")
print(f"  {'TOTAL':22s} {total}")
