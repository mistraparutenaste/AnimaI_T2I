#!/usr/bin/env python3
# =============================================================================
# AnimaI T2I - Build Script
#   csv/*.csv  ->  prompts-data.js (embedded data)
#              ->  dist/AnimaI.html (single-file distribution)
# Usage: python3 build.py
# =============================================================================
import csv as csv_mod
import io
import json
import os
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(ROOT, "csv")
DIST_DIR = os.path.join(ROOT, "dist")

# -----------------------------------------------------------------------------
# Category metadata: filename (without .csv) -> friendly name
# Ported from the original Rust backend (src/main.rs get_friendly_name).
# -----------------------------------------------------------------------------
CATEGORY_NAMES = {
    "quality": "品質",
    "art_style": "画風",
    "subject": "人物",
    "expression": "表情",
    "pose": "ポーズ",
    "hair": "髪型",
    "hair_color": "髪色",
    "situation": "シチュエーション",
    "clothing": "服装",
    "accessories": "アクセサリー・小物",
    "background": "背景・場所",
    "background_style": "背景様式",
    "effect": "効果",
    "rating": "レーティング",
    "era": "年代・絵柄傾向",
    "composition": "構図・カメラ",
    "n_body_type": "NSFW 体形",
    "n_nsfw": "NSFW 基本設定",
    "n_expression": "NSFW 表情",
    "n_accessories": "NSFW アクセサリー",
    "n_pose": "NSFW ポーズセット",
    "n_situation": "NSFW シチュエーション",
    "negative_prompt": "ネガティブプロンプトセット",
}

# Display order inside each section (ported from main.rs priority_order)
SFW_ORDER = [
    "subject", "hair", "hair_color", "expression", "clothing",
    "accessories", "pose", "situation", "composition",
    "background", "background_style", "effect",
    "art_style", "quality", "era", "rating",
]
NSFW_ORDER = [
    "n_nsfw", "n_body_type", "n_expression",
    "n_pose", "n_situation", "n_accessories",
]
NEGATIVE_ORDER = ["negative_prompt"]

# Sorting slots for the prompt ordering engine.
# A tag chosen from a category is emitted inside its slot; the active model
# template decides the slot order of the final prompt.
SLOT_BY_CATEGORY = {
    # SFW
    "quality": "quality",
    "art_style": "era",
    "subject": "subject",
    "rating": "rating",
    "era": "era",
    "composition": "composition",
    "expression": "appearance",
    "pose": "composition",
    "hair": "appearance",
    "hair_color": "appearance",
    "situation": "composition",
    "clothing": "clothing",
    "accessories": "clothing",
    "background": "background",
    "background_style": "background",
    "effect": "effect",
    # NSFW
    "n_nsfw": "rating_adj",
    "n_body_type": "appearance",
    "n_expression": "appearance",
    "n_accessories": "clothing",
    "n_pose": "composition",
    "n_situation": "composition",
    # Negative
    "negative_prompt": "negative",
}

# Model presets: quality tags, era tag, rating policy, slot template.
# Sources: Illustrious/NoobAI recommended prompts (Civitai/HF model cards),
# Animagine XL 4.0 official model card.
MODEL_PRESETS = [
    {
        "id": "illustrious",
        "name": "Illustrious XL",
        "quality": ["masterpiece", "best quality", "very aesthetic", "absurdres"],
        "era": "newest",
        "negativeBase": "lowres, worst quality, bad quality, bad anatomy, bad proportions, watermark, signature",
        "ratingAuto": True,
        "template": ["subject", "character", "rating", "appearance", "clothing",
                      "composition", "background", "effect", "quality", "era"],
    },
    {
        "id": "noobai",
        "name": "NoobAI XL",
        "quality": ["masterpiece", "best quality", "good quality", "very aesthetic",
                     "absurdres", "newest", "very awa", "highres"],
        "era": None,
        "negativeBase": "lowres, worst quality, bad quality, bad anatomy, bad proportions, watermark, signature",
        "ratingAuto": True,
        "template": ["subject", "character", "rating", "appearance", "clothing",
                      "composition", "background", "effect", "quality", "era"],
    },
    {
        "id": "animagine",
        "name": "Animagine XL 4.0",
        "quality": ["masterpiece", "high score", "great score", "absurdres"],
        "era": "newest",
        "negativeBase": "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry",
        "ratingAuto": True,  # rating REQUIRED on Animagine
        "template": ["subject", "character", "rating", "appearance", "clothing",
                      "composition", "background", "effect", "quality", "era"],
    },
    {
        "id": "custom",
        "name": "カスタム (品質タグなし)",
        "quality": [],
        "era": None,
        "negativeBase": "",
        "ratingAuto": False,
        "template": ["subject", "character", "rating", "appearance", "clothing",
                      "composition", "background", "effect", "quality", "era"],
    },
]

BUILT_AT = time.strftime("%Y-%m-%d %H:%M:%S")


def parse_csv_bytes(content):
    """Parse a Japanese,Prompt[,weight] CSV into a list of tag dicts."""
    items = []
    reader = csv_mod.reader(io.StringIO(content), quotechar='"')
    header = None
    for row in reader:
        if not row or not "".join(row).strip():
            continue
        if header is None:
            header = [h.strip() for h in row]
            continue
        jp = row[0].strip()
        en = (row[1] if len(row) > 1 else "").strip()
        wt = None
        if len(row) > 2 and row[2].strip():
            try:
                wt = float(row[2].strip())
            except ValueError:
                wt = None
        if not jp or not en:
            continue
        # Split "A/B/C" japanese aliases across comma-separated prompts
        jp_norm = jp.replace("／", "/")
        if "/" in jp_norm:
            jp_parts = [p.strip() for p in jp_norm.split("/") if p.strip()]
            en_parts = [p.strip() for p in en.split(",") if p.strip()]
            if len(jp_parts) == len(en_parts):
                for j, e in zip(jp_parts, en_parts):
                    items.append({"japanese": j, "prompt": e, "weight": wt})
                continue
        items.append({"japanese": jp, "prompt": en, "weight": wt})
    return items


def section_for_file(base):
    if base.startswith("n_"):
        return "nsfw"
    if "negative" in base:
        return "negative"
    return "sfw"


def friendly_name(base):
    if base in CATEGORY_NAMES:
        return CATEGORY_NAMES[base]
    clean = base[2:] if base.startswith("n_") else base
    return " ".join(w.capitalize() for w in clean.split("_"))


def slot_for_category(cat_id):
    return SLOT_BY_CATEGORY.get(cat_id, "composition")


def load_all():
    sfw, nsfw, negative = [], [], []
    seen_files = []
    for fname in sorted(os.listdir(CSV_DIR)):
        if not fname.endswith(".csv"):
            continue
        base = fname[:-4]
        path = os.path.join(CSV_DIR, fname)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        items = parse_csv_bytes(content)
        if not items:
            continue
        section = section_for_file(base)
        cat = {
            "id": base,
            "name": friendly_name(base),
            "section": section,
            "slot": slot_for_category(base),
            "tags": items,
        }
        seen_files.append(fname)
        if section == "nsfw":
            nsfw.append(cat)
        elif section == "negative":
            negative.append(cat)
        else:
            sfw.append(cat)

    def order_by(cats, order):
        d = {c["id"]: c for c in cats}
        out = [d.pop(o) for o in order if o in d]
        out.extend(d.values())
        return out

    sfw = order_by(sfw, SFW_ORDER)
    nsfw = order_by(nsfw, NSFW_ORDER)
    negative = order_by(negative, NEGATIVE_ORDER)
    return {"sfw": sfw, "nsfw": nsfw, "negative": negative}, seen_files


def build_data_js(data):
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    presets = json.dumps(MODEL_PRESETS, ensure_ascii=False, separators=(",", ":"))
    return ("// Auto-generated by build.py — DO NOT EDIT\n"
            f"// Built: {BUILT_AT}\n"
            f"window.PROMPTS_DATA = {payload};\n"
            f"window.MODEL_PRESETS = {presets};\n")


def build_single_html():
    """Inline style.css + prompts-data.js + app.js into dist/AnimaI.html."""
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    with open(os.path.join(ROOT, "style.css"), encoding="utf-8") as f:
        style = f.read()
    with open(os.path.join(ROOT, "app.js"), encoding="utf-8") as f:
        appjs = f.read()
    with open(os.path.join(ROOT, "prompts-data.js"), encoding="utf-8") as f:
        datajs = f.read()
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        "<style>\n" + style + "\n</style>")
    html = html.replace(
        '<script src="app.js"></script>',
        "<script>\n" + datajs + "\n</script>\n<script>\n" + appjs + "\n</script>")
    html = html.replace(
        '<script src="prompts-data.js"></script>', "")
    os.makedirs(DIST_DIR, exist_ok=True)
    out = os.path.join(DIST_DIR, "AnimaI.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out


def main():
    data, files = load_all()
    counts = {k: sum(len(c["tags"]) for c in v) for k, v in data.items()}
    print(f"Loaded {len(files)} csv files: {counts}")
    data_js = build_data_js(data)
    with open(os.path.join(ROOT, "prompts-data.js"), "w", encoding="utf-8") as f:
        f.write(data_js)
    print(f"Wrote prompts-data.js ({len(data_js)} bytes)")
    out = build_single_html()
    size_kb = os.path.getsize(out) / 1024
    print(f"Wrote {out} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
