// ============ البحث في نص القرآن الكامل ============
// فهرس في الذاكرة للبحث السريع

let searchIndex = null;
let searchData = null;

function normalizeArabic(text) {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')  // إزالة التشكيل
    .replace(/[\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')  // إزالة علامات الوقف
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئء]/g, 'ء')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchIndex(quranData, surahsMeta) {
  const docs = [];
  const surahs = quranData.surahs || [];

  surahs.forEach((surah, surahIdx) => {
    const meta = surahsMeta.find(m => m.n === (surahIdx + 1)) || {};
    (surah.verses || []).forEach(verse => {
      docs.push({
        id: `${surahIdx + 1}:${verse.number}`,
        surahNum: surahIdx + 1,
        surahName: surah.name || meta.name || `سورة ${surahIdx + 1}`,
        ayahNum: verse.number,
        text: verse.text || '',
        normalized: normalizeArabic(verse.text || ''),
      });
    });
  });

  searchIndex = docs;
  console.log(`✓ فهرس البحث جاهز: ${docs.length} آية`);
  return docs.length;
}

function searchQuran(query, limit = 100) {
  if (!searchIndex || !query) return [];

  const normalizedQuery = normalizeArabic(query);
  if (normalizedQuery.length < 2) return [];

  const results = [];
  const words = normalizedQuery.split(/\s+/).filter(w => w.length >= 2);

  for (const doc of searchIndex) {
    let score = 0;
    let matched = false;

    for (const word of words) {
      if (doc.normalized.includes(word)) {
        score += 1;
        matched = true;
      }
    }

    if (matched) {
      // أولوية أعلى للآيات التي تبدأ بالكلمة المبحوث عنها
      if (doc.normalized.startsWith(words[0])) score += 5;
      // أولوية للمطابقة الكاملة
      if (doc.normalized === normalizedQuery) score += 10;
      results.push({ ...doc, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function highlightMatch(text, query) {
  if (!query) return text;
  const normalized = normalizeArabic(text);
  const normalizedQuery = normalizeArabic(query);

  // ابحث عن الموقع في النص الأصلي
  const words = text.split(/\s+/);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length >= 2);

  return words.map(word => {
    const nWord = normalizeArabic(word);
    for (const qw of queryWords) {
      if (nWord.includes(qw)) {
        return `<mark class="search-hl">${word}</mark>`;
      }
    }
    return word;
  }).join(' ');
}

window.QuranSearch = {
  build: buildSearchIndex,
  query: searchQuran,
  highlight: highlightMatch,
  normalize: normalizeArabic,
};
