#!/usr/bin/env python3
"""Fetch a complete, single-reciter surah MP3 library at build time.

Audio is packaged into the APK; the installed app never streams or downloads audio.
Source: MP3Quran.net public reciter API and its listed surah audio server.
"""
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path("app/src/main/assets/audio")
API = "https://mp3quran.net/api/v3/reciters?language=eng"
ROOT.mkdir(parents=True, exist_ok=True)

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "WirdOfflineQuran/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)

def download(url, target):
    last_error = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WirdOfflineQuran/1.0"})
            with urllib.request.urlopen(req, timeout=120) as response:
                data = response.read()
                content_type = response.headers.get("Content-Type", "").lower()
            if len(data) < 2048:
                raise ValueError(f"Audio response is too small ({len(data)} bytes)")
            if "text/html" in content_type or data.lstrip().lower().startswith(b"<!doctype html"):
                raise ValueError("Audio URL returned an HTML page, not audio")
            target.write_bytes(data)
            return len(data)
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Could not download {url}: {last_error}")

def main():
    print("Looking up the official MP3Quran reciter catalogue…")
    data = get_json(API)
    reciters = data.get("reciters", [])
    candidates = [
        r for r in reciters
        if "mishary" in r.get("name", "").lower()
        or "مشاري" in r.get("name", "")
        or "العفاسي" in r.get("name", "")
    ]
    # Require one complete Mushaf, with every surah 1–114 listed.
    choices = []
    for reciter in candidates:
        for moshaf in reciter.get("moshaf", []):
            available = {int(x) for x in str(moshaf.get("surah_list", "")).split(",") if x.strip().isdigit()}
            if moshaf.get("surah_total") == 114 and set(range(1, 115)).issubset(available):
                choices.append((reciter, moshaf))
    if not choices:
        raise SystemExit("No complete 114-surah Mishary Alafasy recording was found in the MP3Quran catalogue.")
    reciter, moshaf = choices[0]
    server = moshaf.get("server", "").rstrip("/") + "/"
    if not server.startswith("https://"):
        raise SystemExit(f"Refusing non-HTTPS audio server: {server}")
    print(f"Reciter: {reciter.get('name')} — {moshaf.get('name')}")
    print(f"Audio host: {server}")
    total = 0
    for surah in range(1, 115):
        target = ROOT / f"{surah:03d}.mp3"
        if target.exists() and target.stat().st_size >= 2048:
            size = target.stat().st_size
            print(f"[{surah:03d}/114] already present ({size:,} bytes)")
        else:
            target.unlink(missing_ok=True)
            url = f"{server}{surah:03d}.mp3"
            size = download(url, target)
            print(f"[{surah:03d}/114] downloaded ({size:,} bytes)")
        total += size
    missing = [f"{n:03d}.mp3" for n in range(1, 115) if not (ROOT / f"{n:03d}.mp3").is_file() or (ROOT / f"{n:03d}.mp3").stat().st_size < 2048]
    if missing:
        raise SystemExit("Missing or invalid audio files: " + ", ".join(missing))
    (ROOT / "SOURCE.txt").write_text(
        "Bundled recitation: Mishary Alafasy (Murattal, Hafs where supplied).\n"
        "Audio source/catalogue: MP3Quran.net — https://mp3quran.net/ and https://mp3quran.net/api/v3/reciters\n"
        "The app includes these files in the APK and does not stream audio at runtime.\n"
        "Recitation recordings remain attributed to their reciter/source; see MP3Quran.net's published terms.\n",
        encoding="utf-8"
    )
    print(f"Validated 114 bundled surah files; total audio payload: {total / (1024**2):.1f} MiB.")

if __name__ == "__main__":
    main()
