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
if sum(map(len, verses)) < 6000:
    raise SystemExit("Tanzil download was incomplete or format changed; refusing to package partial Quran text.")
payload = {
    "source": "Tanzil Quran Text (Uthmani), https://tanzil.net",
    "copyright": "Tanzil Quran Text. Copyright (C) Tanzil Project. Use verbatim; do not modify. See https://tanzil.net/docs/Text_License",
    "surahs": [{"number": i + 1, "name": names[i], "verses": verses[i]} for i in range(114)]
}
out = pathlib.Path("app/src/main/assets/quran.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Packaged {sum(map(len, verses))} Quran verses into {out}")
