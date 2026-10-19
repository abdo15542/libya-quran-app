#!/usr/bin/env python3
import json
import pathlib
import urllib.parse
import urllib.request

URL = "https://tanzil.net/pub/download/index.php"
FORM = urllib.parse.urlencode({
    "quranType": "uthmani", "outType": "txt-2",
    "marks": "true", "sajdah": "true", "tatweel": "true", "agree": "true",
}).encode("utf-8")
request = urllib.request.Request(URL, data=FORM, headers={
    "User-Agent": "WirdOfflineQuran/1.0",
    "Content-Type": "application/x-www-form-urlencoded",
})
with urllib.request.urlopen(request, timeout=60) as response:
    raw = response.read().decode("utf-8-sig")

names = [
"الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
"هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج",
"المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب",
"سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف",
"محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة",
"الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة",
"المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
"التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس",
"الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر",
"العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"
]
expected_counts = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
    54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
    14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,
    29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,
    11,8,3,9,5,4,7,3,6,3,5,4,5,6
]
assert len(names) == 114 and len(expected_counts) == 114
verses = [[] for _ in range(114)]
for line in raw.splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    parts = line.split("|", 2)
    if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
        s, a, text = int(parts[0]), int(parts[1]), parts[2]
        if 1 <= s <= 114 and a >= 1 and text:
            verses[s - 1].append({"number": a, "text": text})
actual_counts = [len(items) for items in verses]
if actual_counts != expected_counts:
    mismatches = [
        f"{i + 1}: expected {expected_counts[i]}, received {actual_counts[i]}"
        for i in range(114) if actual_counts[i] != expected_counts[i]
    ]
    raise SystemExit(
        "Tanzil download failed exact surah-count validation; refusing to package Quran text. "
        + "; ".join(mismatches[:12])
    )
if sum(actual_counts) != 6236:
    raise SystemExit(f"Expected 6236 verses, received {sum(actual_counts)}; refusing to package Quran text.")
payload = {
    "source": "Tanzil Quran Text (Uthmani), https://tanzil.net",
    "copyright": "Tanzil Quran Text\\nCopyright (C) 2007-2021 Tanzil Project\\nLicense: Creative Commons Attribution 3.0\\nPermission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT ALLOWED. The source (Tanzil Project) must be clearly indicated and a link to https://tanzil.net must be provided. This notice must accompany copies containing the text. See https://tanzil.net/docs/Text_License.",
    "surahs": [{"number": i + 1, "name": names[i], "verses": verses[i]} for i in range(114)]
}
out = pathlib.Path("app/src/main/assets/quran.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Packaged {sum(map(len, verses))} Quran verses into {out}")
