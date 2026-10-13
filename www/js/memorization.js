// ============ نظام المراجعة المتباعد (SRS) ============

const SRS_INTERVALS = [1, 3, 7, 14, 30, 90, 180]; // بالأيام
const SRS_LEVEL_NAMES = ['يوم', '3 أيام', 'أسبوع', 'أسبوعان', 'شهر', '3 أشهر', 'مُتقن'];

// قراءة بيانات الحفظ
async function getMemoData() {
  return (await DB.getUserData('memorization')) || {};
}

async function saveMemoData(data) {
  return DB.saveUserData('memorization', data);
}

// إضافة آية للحفظ
async function addVerseToMemo(surahNum, ayahNum) {
  const data = await getMemoData();
  const key = surahNum + ':' + ayahNum;

  if (data[key]?.memorized) {
    return { ok: false, msg: 'الآية محفوظة مسبقاً' };
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  data[key] = {
    memorized: true,
    level: 0,
    memorizedAt: now,
    nextReview: now + SRS_INTERVALS[0] * dayMs,
    reviews: [],
    successCount: 0,
    failCount: 0,
  };

  await saveMemoData(data);
  return { ok: true };
}

// إزالة آية من الحفظ
async function removeVerseFromMemo(surahNum, ayahNum) {
  const data = await getMemoData();
  const key = surahNum + ':' + ayahNum;
  delete data[key];
  await saveMemoData(data);
}

// تحديث بعد المراجعة
async function reviewVerse(surahNum, ayahNum, difficulty) {
  // difficulty: 'easy' | 'medium' | 'hard'
  const data = await getMemoData();
  const key = surahNum + ':' + ayahNum;
  const verse = data[key];
  if (!verse) return;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let newLevel = verse.level;
  if (difficulty === 'easy') {
    newLevel = Math.min(verse.level + 1, SRS_INTERVALS.length - 1);
    verse.successCount = (verse.successCount || 0) + 1;
  } else if (difficulty === 'medium') {
    // يبقى في نفس المستوى لكن يعيد الجدولة
    verse.successCount = (verse.successCount || 0) + 1;
  } else { // hard
    newLevel = Math.max(0, verse.level - 1);
    verse.failCount = (verse.failCount || 0) + 1;
  }

  verse.level = newLevel;
  verse.nextReview = now + SRS_INTERVALS[newLevel] * dayMs;
  verse.reviews = verse.reviews || [];
  verse.reviews.push({ at: now, difficulty });

  await saveMemoData(data);
  return {
    level: newLevel,
    levelName: SRS_LEVEL_NAMES[newLevel],
    nextInDays: SRS_INTERVALS[newLevel],
  };
}

// الآيات المستحقة للمراجعة اليوم
async function getDueVerses() {
  const data = await getMemoData();
  const now = Date.now();
  const due = [];

  for (const [key, verse] of Object.entries(data)) {
    if (!verse.memorized) continue;
    if (verse.nextReview <= now) {
      const [s, a] = key.split(':').map(Number);
      due.push({ s, a, ...verse });
    }
  }

  // رتّب: الأقدم أولاً
  due.sort((a, b) => a.nextReview - b.nextReview);
  return due;
}

// إحصاءات الحفظ
async function getMemoStats() {
  const data = await getMemoData();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let total = 0;
  let dueToday = 0;
  let mastered = 0;
  let learning = 0;
  let totalReviews = 0;
  const surahs = new Set();
  const streak = await calculateStreak(data);

  for (const [key, verse] of Object.entries(data)) {
    if (!verse.memorized) continue;
    total++;
    const [s] = key.split(':');
    surahs.add(s);

    if (verse.nextReview <= now) dueToday++;
    if (verse.level >= SRS_INTERVALS.length - 1) mastered++;
    else learning++;

    totalReviews += (verse.reviews || []).length;
  }

  // آيات تمت مراجعتها اليوم
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let reviewedToday = 0;
  for (const verse of Object.values(data)) {
    if (!verse.reviews) continue;
    for (const r of verse.reviews) {
      if (r.at >= todayStart.getTime()) { reviewedToday++; break; }
    }
  }

  return {
    total,
    dueToday,
    mastered,
    learning,
    totalReviews,
    reviewedToday,
    surahs: surahs.size,
    streak,
    todayProgress: total > 0 ? Math.min(100, Math.round((reviewedToday / Math.max(1, reviewedToday + dueToday)) * 100)) : 0,
  };
}

// حساب سلسلة الأيام المتتالية
async function calculateStreak(data) {
  const days = new Set();
  for (const verse of Object.values(data)) {
    if (!verse.reviews) continue;
    for (const r of verse.reviews) {
      const d = new Date(r.at);
      d.setHours(0, 0, 0, 0);
      days.add(d.getTime());
    }
  }

  if (days.size === 0) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let check = today.getTime();

  // إذا لم يُراجع اليوم، ابدأ من أمس
  if (!days.has(check)) {
    check -= dayMs;
    if (!days.has(check)) return 0;
  }

  while (days.has(check)) {
    streak++;
    check -= dayMs;
  }

  return streak;
}

// تصدير
window.MemoModule = {
  addVerse: addVerseToMemo,
  removeVerse: removeVerseFromMemo,
  review: reviewVerse,
  dueToday: getDueVerses,
  stats: getMemoStats,
  getData: getMemoData,
  intervals: SRS_INTERVALS,
  levelNames: SRS_LEVEL_NAMES,
};
