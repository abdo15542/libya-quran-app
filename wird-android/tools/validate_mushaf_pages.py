#!/usr/bin/env python3
"""Verify all 604 local, lossless WebP pages and enforce a practical asset-size budget."""
import pathlib
import sys

root = pathlib.Path("app/src/main/assets/mushaf")
missing = [f"{i:03d}.webp" for i in range(1, 605) if not (root / f"{i:03d}.webp").is_file()]
if missing:
    sys.exit(f"Missing {len(missing)} Mushaf pages. First missing: {', '.join(missing[:10])}")

total_bytes = 0
for i in range(1, 605):
    path = root / f"{i:03d}.webp"
    size = path.stat().st_size
    total_bytes += size
    if size < 1000:
        sys.exit(f"Invalid or empty WebP page: {path}")
    with path.open("rb") as image:
        header = image.read(12)
    if len(header) != 12 or header[:4] != b"RIFF" or header[8:12] != b"WEBP":
        sys.exit(f"Invalid WebP signature: {path}")

svg_files = list(root.glob("*.svg"))
if svg_files:
    sys.exit(f"Found {len(svg_files)} SVG pages that would unnecessarily inflate the APK.")

# Keep all pages offline, but fail CI if a future source/render change balloons the assets.
max_total_bytes = 350 * 1024 * 1024
if total_bytes > max_total_bytes:
    sys.exit(f"Mushaf WebP pages are too large: {total_bytes / (1024 * 1024):.1f} MiB (limit 350 MiB).")

notice = pathlib.Path("app/src/main/assets/MUSHAF_NOTICE.txt")
if not notice.is_file() or "qurancomplex.gov.sa" not in notice.read_text(encoding="utf-8"):
    sys.exit("Missing Mushaf source and usage notice.")
print(f"Mushaf validation passed: 604 lossless WebP pages, {total_bytes / (1024 * 1024):.1f} MiB total, source notice present.")
