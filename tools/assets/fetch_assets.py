"""Asset tooling: search Sketchfab / Poly Haven, build a contact sheet, fetch manifest entries.

Run with:  py -3 -I tools/assets/fetch_assets.py <command> ...
(stdlib only: urllib + zipfile; msys python is not used because it fails HTTPS verification here.)

Commands
  search --slot <slot> --q "<query>" [--source sketchfab|polyhaven] [--type models|textures|hdris]
  contact-sheet
  resolve        fill title/author/license/url of each manifest entry from the live APIs (rejects non CC0/CC-BY)
  fetch [--only <slug> ...]

The Sketchfab token is read from the file named by SOM_SKETCHFAB_TOKEN_FILE (default
C:/Users/Work/Desktop/API.txt). It is only ever sent as an Authorization header to api.sketchfab.com
and is never printed or written anywhere.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
RAW = CACHE / "raw"
SHORTLIST = CACHE / "shortlist"
MANIFEST = HERE / "manifest.json"
UA = "shadows-of-the-mist-asset-fetch/1.0"
DEFAULT_TOKEN_FILE = "C:/Users/Work/Desktop/API.txt"
ALLOWED = {"by": "CC-BY 4.0", "cc0": "CC0 1.0"}
LABEL_TO_SLUG = {
    "cc attribution": "by",
    "cc-by": "by",
    "cc by": "by",
    "attribution": "by",
    "cc0 public domain": "cc0",
    "cc0": "cc0",
    "public domain": "cc0",
}
HI_RES_4K = {"tex_sandstone_red", "tex_cobble_wet", "tex_bronze_patina"}
TEXTURE_MAPS = {"Diffuse": "diff", "nor_gl": "nor", "arm": "arm"}


def ctx() -> ssl.SSLContext:
    return ssl.create_default_context()


def http(url: str, headers: dict[str, str] | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx()) as r:
        return r.read()


def get_json(url: str, headers: dict[str, str] | None = None):
    return json.loads(http(url, headers))


def token() -> str:
    path = Path(os.environ.get("SOM_SKETCHFAB_TOKEN_FILE", DEFAULT_TOKEN_FILE))
    return path.read_text(encoding="utf-8").strip()


def license_slug(lic: dict | None) -> str | None:
    """Sketchfab returns license.label (and sometimes slug). Map to 'by' / 'cc0', else None."""
    if not lic:
        return None
    slug = (lic.get("slug") or "").lower()
    if slug in ALLOWED:
        return slug
    return LABEL_TO_SLUG.get((lic.get("label") or "").strip().lower())


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------- search

def cmd_search(a: argparse.Namespace) -> None:
    SHORTLIST.mkdir(parents=True, exist_ok=True)
    thumbs = SHORTLIST / "thumbs"
    thumbs.mkdir(exist_ok=True)
    results: list[dict] = []
    if a.source == "sketchfab":
        q = urllib.parse.urlencode({"type": "models", "downloadable": "true", "q": a.q, "count": 24})
        data = get_json(f"https://api.sketchfab.com/v3/search?{q}")
        for r in data.get("results", []):
            slug = license_slug(r.get("license"))
            if slug is None:
                continue
            imgs = sorted((r.get("thumbnails") or {}).get("images", []), key=lambda i: abs(i.get("width", 0) - 400))
            results.append({
                "source": "sketchfab",
                "id": r["uid"],
                "title": r.get("name"),
                "author": (r.get("user") or {}).get("displayName"),
                "license": ALLOWED[slug],
                "url": r.get("viewerUrl"),
                "faces": r.get("faceCount"),
                "thumb": imgs[0]["url"] if imgs else None,
            })
    else:
        listing = get_json(f"https://api.polyhaven.com/assets?t={a.type}")
        words = a.q.lower().split()
        for key, v in listing.items():
            hay = " ".join([key, v.get("name", ""), *v.get("tags", []), *v.get("categories", [])]).lower()
            if all(w in hay for w in words):
                results.append({
                    "source": "polyhaven",
                    "id": key,
                    "title": v.get("name"),
                    "author": ", ".join((v.get("authors") or {}).keys()),
                    "license": "CC0 1.0",
                    "url": f"https://polyhaven.com/a/{key}",
                    "thumb": f"https://cdn.polyhaven.com/asset_img/thumbs/{key}.png?width=400&height=400",
                })
    results = results[:8]
    for r in results:
        if r.get("thumb"):
            try:
                (thumbs / f"{r['id']}.jpg").write_bytes(http(r["thumb"], timeout=30))
                r["thumbFile"] = f"thumbs/{r['id']}.jpg"
            except Exception as e:  # noqa: BLE001 - thumbnails are best-effort
                print(f"thumb failed {r['id']}: {e}", file=sys.stderr)
    out = SHORTLIST / f"{a.slot}.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{a.slot}: {len(results)} allowed results -> {out}")


# ----------------------------------------------------------------------------- contact sheet

def cmd_contact_sheet(_: argparse.Namespace) -> None:
    rows = []
    for f in sorted(SHORTLIST.glob("*.json")):
        cards = []
        for r in json.loads(f.read_text(encoding="utf-8"))[:4]:
            img = f'<img src="shortlist/{html.escape(r["thumbFile"])}" width="200">' if r.get("thumbFile") else ""
            cards.append(
                f'<div class="c">{img}<b>{html.escape(r["title"] or "")}</b><br>'
                f'{html.escape(r["author"] or "")}<br>{html.escape(r["license"])}'
                f'{" | " + str(r["faces"]) + " faces" if r.get("faces") else ""}<br>'
                f'<a href="{html.escape(r["url"] or "")}">{html.escape(r["id"])}</a></div>'
            )
        rows.append(f"<h2>{html.escape(f.stem)}</h2><div class=r>{''.join(cards)}</div>")
    page = (
        "<!doctype html><meta charset=utf-8><title>Contact sheet</title>"
        "<style>body{font:14px sans-serif;background:#111;color:#ddd}.r{display:flex;gap:12px}"
        ".c{width:210px}a{color:#8cf}</style>" + "".join(rows)
    )
    out = CACHE / "contact_sheet.html"
    out.write_text(page, encoding="utf-8")
    print(out)


# ----------------------------------------------------------------------------- resolve

def sketchfab_detail(uid: str) -> dict:
    d = get_json(f"https://api.sketchfab.com/v3/models/{uid}")
    slug = license_slug(d.get("license"))
    if slug is None:
        raise SystemExit(f"REJECT {uid}: license {d.get('license')} is not CC0/CC-BY")
    return {
        "title": d["name"],
        "author": d["user"]["displayName"],
        "license": ALLOWED[slug],
        "url": d["viewerUrl"],
        "faces": d.get("faceCount"),
    }


def cmd_resolve(_: argparse.Namespace) -> None:
    m = load_manifest()
    for e in m["entries"]:
        if e["source"] == "sketchfab":
            e.update(sketchfab_detail(e["id"]))
        elif e["source"] == "polyhaven":
            info = get_json(f"https://api.polyhaven.com/info/{e['id']}")
            e["title"] = info["name"]
            e["author"] = ", ".join(info["authors"].keys())
            e["license"] = "CC0 1.0"
            e["url"] = f"https://polyhaven.com/a/{e['id']}"
        print(f"resolved {e['slug']}: {e.get('title')} / {e.get('author')} / {e.get('license')}")
    save_manifest(m)


# ----------------------------------------------------------------------------- fetch

def fresh_dir(slug: str) -> Path:
    d = RAW / slug
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    return d


def safe_extract(zip_path: Path, dest: Path) -> None:
    root = dest.resolve()
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            target = (dest / info.filename).resolve()
            if root != target and root not in target.parents:
                raise SystemExit(f"unsafe path in archive: {info.filename}")
        z.extractall(dest)


def fetch_sketchfab(e: dict) -> None:
    meta = sketchfab_detail(e["id"])  # re-verify license at download time; aborts entry if not allowed
    dest = fresh_dir(e["slug"])
    links = get_json(f"https://api.sketchfab.com/v3/models/{e['id']}/download", {"Authorization": f"Token {token()}"})
    kind = "glb" if "glb" in links else "gltf"
    if kind not in links:
        raise SystemExit(f"{e['slug']}: no glb/gltf download offered ({list(links)})")
    blob = http(links[kind]["url"])  # pre-signed URL, no auth header
    if kind == "glb":
        (dest / f"{e['slug']}.glb").write_bytes(blob)
    else:
        z = dest / "download.zip"
        z.write_bytes(blob)
        safe_extract(z, dest)
        z.unlink()
    (dest / "_source.json").write_text(json.dumps({**meta, "kind": kind, "id": e["id"]}, indent=2), encoding="utf-8")
    print(f"fetched {e['slug']} ({kind}, {len(blob) // 1024} KiB) -> {dest}")


def fetch_polyhaven_texture(e: dict) -> None:
    res = "4k" if e["slug"] in HI_RES_4K else "2k"
    files = get_json(f"https://api.polyhaven.com/files/{e['id']}")
    dest = fresh_dir(e["slug"])
    for ph_key, short in TEXTURE_MAPS.items():
        src = files[ph_key][res]["jpg"]["url"]
        (dest / f"{short}_{res}.jpg").write_bytes(http(src))
    (dest / "_source.json").write_text(json.dumps({"id": e["id"], "res": res, "license": "CC0 1.0"}), encoding="utf-8")
    print(f"fetched {e['slug']} ({res}) -> {dest}")


def cmd_fetch(a: argparse.Namespace) -> None:
    m = load_manifest()
    for e in m["entries"]:
        if a.only and e["slug"] not in a.only:
            continue
        if e["source"] in ("code", "alias"):
            continue
        if e.get("existing"):
            print(f"skip {e['slug']}: already in public/assets ({e['existing']})")
            continue
        try:
            if e["source"] == "sketchfab":
                fetch_sketchfab(e)
            elif e["source"] == "polyhaven":
                fetch_polyhaven_texture(e)
        except (SystemExit, urllib.error.URLError, KeyError) as err:
            print(f"FAILED {e['slug']}: {str(err)[:200]}", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("--slot", required=True)
    s.add_argument("--q", required=True)
    s.add_argument("--source", choices=["sketchfab", "polyhaven"], default="sketchfab")
    s.add_argument("--type", choices=["models", "textures", "hdris"], default="models")
    s.set_defaults(fn=cmd_search)
    sub.add_parser("contact-sheet").set_defaults(fn=cmd_contact_sheet)
    sub.add_parser("resolve").set_defaults(fn=cmd_resolve)
    f = sub.add_parser("fetch")
    f.add_argument("--only", nargs="*")
    f.set_defaults(fn=cmd_fetch)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
