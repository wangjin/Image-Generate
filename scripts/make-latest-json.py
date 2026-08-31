#!/usr/bin/env python3
"""Generate Tauri v2 updater manifest (latest.json) from built release artifacts.

Reads the minisign .sig files produced by the build, derives asset download
URLs from the release tag, and bakes the proxy prefix into the URLs so the
download survives GFW. Run in the release job after artifacts are downloaded.

Usage:
  make-latest-json.py --tag v0.1.2 \
      --notes-file /tmp/release-notes.md \
      --mac-dir artifacts/ImageGenerate-macos \
      --win-dir artifacts/ImageGenerate-windows \
      --proxy-prefix https://gh-proxy.org/ \
      --out latest.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import sys

DEFAULT_PROXY_PREFIX = "https://gh-proxy.org/"
DEFAULT_REPO = "wangjin/Image-Generate"


def pick_one(directory: pathlib.Path, pattern: str) -> pathlib.Path:
    matches = sorted(directory.glob(pattern))
    if len(matches) != 1:
        found = [m.name for m in matches]
        sys.exit(f"expected exactly 1 match for {pattern} in {directory}, found: {found}")
    return matches[0]


def asset_url(proxy_prefix: str, repo: str, tag: str, file_name: str) -> str:
    return f"{proxy_prefix}https://github.com/{repo}/releases/download/{tag}/{file_name}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tag", required=True, help="release tag, e.g. v0.1.2")
    ap.add_argument("--repo", default=DEFAULT_REPO, help="owner/name of the GitHub repo")
    ap.add_argument("--notes-file", default=None, help="markdown file with release notes")
    ap.add_argument("--mac-dir", required=True, help="dir containing *.app.tar.gz(.sig)")
    ap.add_argument("--win-dir", required=True, help="dir containing *-setup.exe(.sig)")
    ap.add_argument("--proxy-prefix", default=DEFAULT_PROXY_PREFIX, help="baked into asset URLs; empty = direct")
    ap.add_argument("--out", default="latest.json")
    args = ap.parse_args()

    mac_dir = pathlib.Path(args.mac_dir)
    win_dir = pathlib.Path(args.win_dir)

    mac_tar = pick_one(mac_dir, "*.app.tar.gz")
    win_exe = pick_one(win_dir, "*-setup.exe")

    mac_sig = (mac_tar.parent / (mac_tar.name + ".sig")).read_text().strip()
    win_sig = (win_exe.parent / (win_exe.name + ".sig")).read_text().strip()

    notes = pathlib.Path(args.notes_file).read_text() if args.notes_file else ""

    # updater 解析 darwin-aarch64（fallback 匹配 {os}-{arch}）；runner 为 arm64 + x64
    manifest = {
        "version": args.tag.lstrip("v"),
        "notes": notes,
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "darwin-aarch64": {
                "signature": mac_sig,
                "url": asset_url(args.proxy_prefix, args.repo, args.tag, mac_tar.name),
            },
            "windows-x86_64": {
                "signature": win_sig,
                "url": asset_url(args.proxy_prefix, args.repo, args.tag, win_exe.name),
            },
        },
    }

    out = pathlib.Path(args.out)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"manifest written: {out}")
    print(json.dumps(manifest["platforms"], indent=2))


if __name__ == "__main__":
    main()
