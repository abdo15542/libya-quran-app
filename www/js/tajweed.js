// ============ وحدة التلوين التجويدي ============
// تعمل على النص مباشرة بدون بيانات خارجية
// القواعد المطبقة: الغنة، الإدغام، الإخفاء، الإقلاب، القلقلة، المدود

const TAJWEED_RULES = [
  // القلقلة: ق ط ب ج د
  {
    name: 'qalqalah',
    label: 'قلقلة',
    pattern: /([قطبجد])(ْ|ۡ|ۢ)/g,
    color: '#e74c3c',
  },
  // الغنة: نّ مّ مع الشدة
  {
    name: 'ghunnah',
    label: 'غنة',
    pattern: /([نم])(ّ|ّ۬|ّ۬)/g,
    color: '#27ae60',
  },
  // الإخفاء: نْ قبل 15 حرف
  {
    name: 'ikhfa',
    label: 'إخفاء',
    pattern: /ن(ْ|ۡ|ۢ)(?=[صذثكجشقسزدطظفتض])/g,
    color: '#f39c12',
  },
  // الإدغام: نْ قبل ي ر م ل و ن
  {
    name: 'idgham',
    label: 'إدغام',
    pattern: /ن(ْ|ۡ|ۢ)(?=[يرملون])/g,
    color: '#3498db',
  },
  // الإقلاب: نْ قبل ب
  {
    name: 'iqlab',
    label: 'إقلاب',
    pattern: /ن(ْ|ۡ|ۢ)(?=ب)/g,
    color: '#9b59b6',
  },
  // المد المتصل: ا أو و أو ي + همزة
  {
    name: 'madd_muttasil',
    label: 'مد متصل',
    pattern: /[اويٓۤـ](ٓ|ۤ|ـ)?(ء|أ|إ|ئ|ؤ)/g,
    color: '#8e44ad',
  },
  // المد الأصلي: ا و ي
  {
    name: 'madd_asli',
    label: 'مد أصلي',
    pattern: /[اوي](?![ٓۤـ])/g,
    color: '#16a085',
  },
];

let tajweedEnabled = false;

function applyTajweed(text) {
  if (!tajweedEnabled || !text) return text;

  let result = text;
  const positions = [];

  // جمع كل المطابقات مع مواقعها
  TAJWEED_RULES.forEach(rule => {
    const regex = new RegExp(rule.pattern.source, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      positions.push({
        start: match.index,
        end: match.index + match[0].length,
        color: rule.color,
        rule: rule.name,
      });
    }
  });

  // حل التعارضات (الأطول أولاً)
  positions.sort((a, b) => (b.end - b.start) - (a.end - a.start));

  const occupied = new Array(text.length).fill(false);
  const finalPositions = positions.filter(p => {
    for (let i = p.start; i < p.end; i++) {
      if (occupied[i]) return false;
    }
    for (let i = p.start; i < p.end; i++) occupied[i] = true;
    return true;
  });

  // تطبيق الألوان
  finalPositions.sort((a, b) => b.start - a.start);
  finalPositions.forEach(p => {
    const span = `<span class="tj tj-${p.rule}" style="color:${p.color}">${text.substring(p.start, p.end)}</span>`;
    result = result.substring(0, p.start) + span + result.substring(p.end);
  });

  return result;
}

function toggleTajweed(enabled) {
  tajweedEnabled = enabled;
  return tajweedEnabled;
}

function isTajweedEnabled() {
  return tajweedEnabled;
}

window.Tajweed = {
  apply: applyTajweed,
  toggle: toggleTajweed,
  isEnabled: isTajweedEnabled,
  rules: TAJWEED_RULES,
};
