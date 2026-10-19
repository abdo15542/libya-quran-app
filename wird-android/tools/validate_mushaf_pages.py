#!/usr/bin/env python3
"""Verify all 604 official local Mushaf SVG pages before building the APK."""
import pathlib
import sys

root = pathlib.Path("app/src/main/assets/mushaf")
missing = [f"{i:03d}.svg" for i in range(1, 605) if not (root / f"{i:03d}.svg").is_file()]
if missing:
    sys.exit(f"Missing {len(missing)} Mushaf pages. First missing: {', '.join(missing[:10])}")
for i in range(1, 605):
    path = root / f"{i:03d}.svg"
    content = path.read_text(encoding="utf-8")
    if "<svg" not in content[:5000].lower() or len(content) < 1000:
        sys.exit(f"Invalid SVG page: {path}")
notice = pathlib.Path("app/src/main/assets/MUSHAF_NOTICE.txt")
if not notice.is_file() or "qurancomplex.gov.sa" not in notice.read_text(encoding="utf-8"):
    sys.exit("Missing Mushaf source and usage notice.")
print("Mushaf page validation passed: all 604 SVG pages and source notice are present.")
