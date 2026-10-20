#!/usr/bin/env python3
"""Offline data-integrity checks for the packaged Quran JSON."""
import json
import pathlib
import sys

EXPECTED_COUNTS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
    54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
    14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,
    29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,
    11,8,3,9,5,4,7,3,6,3,5,4,5,6
]
path = pathlib.Path("app/src/main/assets/quran.json")
if not path.is_file():
    sys.exit(f"Missing packaged Quran asset: {path}")
data = json.loads(path.read_text(encoding="utf-8"))
if "Tanzil" not in data.get("source", "") or "tanzil.net" not in data.get("source", ""):
    sys.exit("Missing Tanzil attribution in Quran JSON.")
if "CHANGING IT IS NOT ALLOWED" not in data.get("copyright", ""):
    sys.exit("Missing verbatim-copy license notice.")
surahs = data.get("surahs")
if not isinstance(surahs, list) or len(surahs) != 114:
    sys.exit(f"Expected 114 surahs, got {len(surahs) if isinstance(surahs, list) else 'invalid data'}.")
total = 0
for i, (surah, expected) in enumerate(zip(surahs, EXPECTED_COUNTS), start=1):
    if surah.get("number") != i:
        sys.exit(f"Surah numbering error at index {i}.")
    verses = surah.get("verses")
    if not isinstance(verses, list) or len(verses) != expected:
        sys.exit(f"Surah {i}: expected {expected} verses, got {len(verses) if isinstance(verses, list) else 'invalid data'}.")
    for j, verse in enumerate(verses, start=1):
        if verse.get("number") != j or not isinstance(verse.get("text"), str) or not verse["text"].strip():
            sys.exit(f"Invalid verse structure at surah {i}, verse index {j}.")
    total += len(verses)
if total != 6236:
    sys.exit(f"Expected 6236 verses, got {total}.")
print(f"Quran data validation passed: {len(surahs)} surahs, {total} verses, license notice present.")
