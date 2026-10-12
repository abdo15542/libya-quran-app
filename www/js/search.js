// ============ البحث المتقدم في القرآن ============

let searchIndex = null;

// تطبيع النص العربي — يتعامل مع رموز رواية قالون
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    // الألف الخنجرية → ألف عادي
    .replace(/\u0670/g, 'ا')
    // الألف الوصلية (ٱ) → ألف عادي
    .replace(/\u0671/g, 'ا')
    // احذف كل التشكيل والعلامات القرآنية
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08F0-\u08FF]/g, '')
    // وحّد الألف
    .replace(/[إأآٱا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئء]/g, 'ء')
    // احذف التطويل
    .replace(/\u0640/g, '')
    // مسافات متعددة → مسافة واحدة
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchIndex(quranData, surahsMeta) {
  const docs = [];
  const surahs = quranData.surahs || [];

  surahs.forEach((surah, surahIdx) => {
    const meta = surahsMeta.find(m => m.n === (surahIdx + 1)) || {};
    const sName = surah.name || meta.name || ('سورة ' + (surahIdx + 1));

    (surah.verses || []).forEach(verse => {
      const text = verse.text || '';
      docs.push({
        s: surahIdx + 1,
        sName: sName,
        a: verse.number,
        text: text,
        norm: normalizeArabic(text),
      });
    });
  });

  searchIndex = docs;
  console.log('✓ فهرس البحث:', docs.length, 'آية');
  return docs.length;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchQuran(query) {
  const empty = { results: [], totalMatches: 0, uniqueSurahs: 0 };
  if (!searchIndex || !query) return empty;

  const normalized = normalizeArabic(query);
  if (normalized.length < 2) return empty;

  const words = normalized.split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return empty;

  const results = [];
  let totalMatches = 0;
  const surahSet = new Set();

  for (const doc of searchIndex) {
    let score = 0;
    let matches = 0;
    let allMatched = true;

    for (const word of words) {
      const regex = new RegExp(escapeRegex(word), 'g');
      const m = doc.norm.match(regex);
      if (m) {
        matches += m.length;
        score += m.length * 2;
      } else {
        allMatched = false;
        break;
      }
    }

    if (allMatched && matches > 0) {
      // أولوية إضافية
      if (doc.norm.includes(normalized)) score += 20;   // المطابقة الكاملة
      if (doc.norm.startsWith(words[0])) score += 5;     // يبدأ بالكلمة

      results.push({
        s: doc.s,
        sName: doc.sName,
        a: doc.a,
        text: doc.text,
        score: score,
        matches: matches,
      });
      totalMatches += matches;
      surahSet.add(doc.s);
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.s !== b.s) return a.s - b.s;
    return a.a - b.a;
  });

  return {
    results: results,
    totalMatches: totalMatches,
    uniqueSurahs: surahSet.size,
  };
}

function highlightMatch(text, query) {
  if (!query) return text;
  const normalizedQuery = normalizeArabic(query);
  const words = normalizedQuery.split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return text;

  // قسّم النص إلى أجزاء (كلمات + فواصل)
  const parts = text.split(/(\s+)/);
  return parts.map(part => {
    if (/^\s+$/.test(part) || !part) return part;
    const normPart = normalizeArabic(part);
    for (const q of words) {
      if (normPart === q || normPart.includes(q) || q.includes(normPart)) {
        return `<mark class="search-hl">${part}</mark>`;
      }
    }
    return part;
  }).join('');
}

window.QuranSearch = {
  build: buildSearchIndex,
  query: searchQuran,
  highlight: highlightMatch,
  normalize: normalizeArabic,
};
