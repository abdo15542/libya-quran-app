#!/usr/bin/env python3
"""Fetch the pinned Madinah Mushaf SVG source and rasterize pages to compact lossless WebP."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import pathlib
import urllib.error
import urllib.request

import cairosvg
from PIL import Image

# Pinned source revision makes page content reproducible.
BASE = "https://raw.githubusercontent.com/quran-ws/quran-svg/b4155f07e4aea087d2c458069acff9f7c7e749f6/mushafs/hafs/kfqc/svg"
OUT = pathlib.Path("app/src/main/assets/mushaf")
SOURCE_OUT = pathlib.Path("build/mushaf-svg")
RENDER_WIDTH = 1800

OUT.mkdir(parents=True, exist_ok=True)
SOURCE_OUT.mkdir(parents=True, exist_ok=True)

# Remove previous SVG assets so they can never accidentally be bundled beside WebP pages.
for old in OUT.glob("*"):
    if old.is_file() and old.suffix.lower() in {".svg", ".webp"}:
        old.unlink()

def fetch(page: int) -> tuple[int, str]:
    name = f"{page:03d}.svg"
    url = f"{BASE}/{name}"
    last_error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WirdOfflineQuran/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                content = response.read()
            if b"<svg" not in content[:5000].lower() or len(content) < 1000:
                raise ValueError(f"Downloaded content is not a valid SVG page: {name}")
            source = SOURCE_OUT / name
            source.write_bytes(content)

            # A 1800 px wide, lossless WebP keeps Arabic glyph edges crisp while
            # reducing the hundreds of megabytes of vector path data substantially.
            png = cairosvg.svg2png(bytestring=content, output_width=RENDER_WIDTH)
            with Image.open(BytesIO(png)) as rendered:
                rgba = rendered.convert("RGBA")
                white = Image.new("RGB", rgba.size, "white")
                white.paste(rgba, mask=rgba.getchannel("A"))
                target = OUT / f"{page:03d}.webp"
                white.save(target, format="WEBP", lossless=True, method=6)
            if not target.is_file() or target.stat().st_size < 1000:
                raise ValueError(f"Rasterized page is empty or invalid: {target.name}")
            return page, target.name
        except (OSError, urllib.error.URLError, UnicodeDecodeError, ValueError, cairosvg.CairoSVGError) as exc:
            (OUT / f"{page:03d}.webp").unlink(missing_ok=True)
            last_error = exc
    raise RuntimeError(f"Unable to fetch/rasterize Mushaf page {name}: {last_error}")

with ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(fetch, page) for page in range(1, 605)]
    done = 0
    for future in as_completed(futures):
        future.result()
        done += 1
        if done % 50 == 0 or done == 604:
            print(f"Downloaded and converted {done}/604 Mushaf pages")

files = list(OUT.glob("*.webp"))
if len(files) != 604:
    raise SystemExit(f"Expected 604 WebP pages, found {len(files)}")
total_bytes = sum(path.stat().st_size for path in files)
print(f"Ready: {len(files)} lossless WebP pages ({total_bytes / (1024 * 1024):.1f} MiB total).")
