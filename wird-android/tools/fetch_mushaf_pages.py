#!/usr/bin/env python3
"""Fetch the official Madinah Mushaf SVG pages from the pinned quran-ws source."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import pathlib
import urllib.error
import urllib.request

# Pinned source revision makes page content reproducible.
BASE = "https://raw.githubusercontent.com/quran-ws/quran-svg/b4155f07e4aea087d2c458069acff9f7c7e749f6/mushafs/hafs/kfqc/svg"
OUT = pathlib.Path("app/src/main/assets/mushaf")
OUT.mkdir(parents=True, exist_ok=True)

def fetch(page: int) -> tuple[int, str]:
    name = f"{page:03d}.svg"
    url = f"{BASE}/{name}"
    last_error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WirdOfflineQuran/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                content = response.read().decode("utf-8")
            if "<svg" not in content[:5000].lower() or len(content) < 1000:
                raise ValueError(f"Downloaded content is not a valid SVG page: {name}")
            (OUT / name).write_text(content, encoding="utf-8")
            return page, name
        except (OSError, urllib.error.URLError, UnicodeDecodeError, ValueError) as exc:
            last_error = exc
    raise RuntimeError(f"Unable to download Mushaf page {name}: {last_error}")

with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(fetch, page) for page in range(1, 605)]
    done = 0
    for future in as_completed(futures):
        future.result()
        done += 1
        if done % 50 == 0 or done == 604:
            print(f"Downloaded {done}/604 official Mushaf pages")

files = list(OUT.glob("*.svg"))
if len(files) != 604:
    raise SystemExit(f"Expected 604 SVG pages, found {len(files)}")
print(f"Ready: {len(files)} Madinah Mushaf pages packaged for offline use.")
