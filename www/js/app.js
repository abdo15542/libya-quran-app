// ==================== الحالة العامة ====================
let state = {
  data: null,
  surahsMeta: [],
  currentSurah: 1,
  theme: 'light',
  fontSize: 1.6,
  bookmarks: [],
  notes: {},
  progress: {},        // { "1:5": { hide: 0 } }
  lastRead: {},
  reader: 'frgany',    // القارئ الافتراضي
};

const READERS = {
  frgany:  { name: 'مصطفى الفرجاني', url: 'https://server8.mp3quran.net/frgany/' },
  quniwa:  { name: 'محمد الأمين قنيوة', url: 'https://server8.mp3quran.net/quniwa/' },
  daoub:   { name: 'طارق دعوب', url: 'https://server8.mp3quran.net/daoub/' },
};

// ==================== التهيئة ====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = prefersDark ? 'dark' : 'light';
  applyTheme();

  // استرجاع الإعدادات
  state.bookmarks = (await DB.getUserData('bookmarks')) || [];
  state.notes     = (await DB.getUserData('notes')) || {};
  state.progress  = (await DB.getUserData('progress')) || {};
  state.fontSize  = (await DB.getUserData('fontSize')) || 1.6;
  state.reader    = (await DB.getUserData('reader')) || 'frgany';
  const lastSurah = await DB.getUserData('last_surah');
  if (lastSurah) state.currentSurah = lastSurah;

  applyFontSize();

  try {
    const status = document.getElementById('loading-status');
    status.textContent = 'تحميل فهرس السور...';
    state.surahsMeta = await DataLoader.loadSurahsMeta();

    status.textContent = 'تحميل المصحف...';
    state.data = await DataLoader.loadFullQuran((p) => {
      document.getElementById('progress-fill').style.width = Math.round(p * 100) + '%';
    });

    status.textContent = 'جاهز!';
    document.getElementById('progress-fill').style.width = '100%';
    setTimeout(showApp, 400);
  } catch (e) {
    document.getElementById('loading-status').textContent = 'خطأ: ' + e.message;
    console.error(e);
  }
}

function showApp() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderSurahList();
  renderSurah(state.currentSurah);
  setupEvents();
}

// ==================== الأحداث ====================
function setupEvents() {
  document.getElementById('menu-btn').onclick  = () => toggleSidebar(true);
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('prev-btn').onclick  = () => navSurah(-1);
  document.getElementById('next-btn').onclick  = () => navSurah(1);
  document.getElementById('play-btn').onclick  = togglePlay;

  document.querySelectorAll('#toolbar button').forEach(btn => {
    btn.onclick = () => handleToolbar(btn.dataset.action);
  });

  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal').onclick = (e) => {
    if (e.target.id === 'modal') closeModal();
  };

  // البحث
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.oninput = debounce(onSearch, 300);
  }

  // إغلاق القائمة عند النقر خارجها
  document.addEventListener('click', (e) => {
    const sb = document.getElementById('sidebar');
    if (sb.classList.contains('open') &&
        !sb.contains(e.target) &&
        e.target.id !== 'menu-btn') {
      toggleSidebar(false);
    }
  });
}

// ==================== عرض فهرس السور ====================
function renderSurahList(filter = '') {
  const ul = document.getElementById('surah-list');
  ul.innerHTML = '';
  const list = state.surahsMeta.length ? state.surahsMeta : [];

  const q = filter.trim();
  const filtered = q
    ? list.filter(s => s.name.includes(q) || String(s.n).includes(q) || (s.en || '').toLowerCase().includes(q.toLowerCase()))
    : list;

  if (!filtered.length) {
    ul.innerHTML = '<li style="opacity:.6">لا توجد نتائج</li>';
    return;
  }

  filtered.forEach(s => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span style="flex:1">${s.name}</span>
      <span style="opacity:.5;font-size:.75rem;margin-left:.5rem">${s.type || ''}</span>
      <span style="font-size:.85rem">${s.n}</span>
    `;
    li.onclick = () => {
      state.currentSurah = s.n;
      renderSurah(s.n);
      toggleSidebar(false);
    };
    ul.appendChild(li);
  });
}

// ==================== عرض السورة ====================
function renderSurah(num) {
  const surahs = state.data?.surahs || [];
  const surah = surahs[num - 1];
  if (!surah) return;

  const meta = state.surahsMeta.find(s => s.n === num) || {};
  document.getElementById('surah-title').textContent = 'سورة ' + (surah.name || meta.name || '');
  document.getElementById('page-info').textContent =
    (meta.type || '') + ' • ' + (surah.verses?.length || meta.verses || 0) + ' آية';

  const container = document.getElementById('verses-container');
  container.innerHTML = '';

  // البسملة (عدا التوبة — استثناء شرعي)
  if (num !== 9) {
    const bs = document.createElement('div');
    bs.className = 'bismillah';
    bs.textContent = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
    container.appendChild(bs);
  }

  (surah.verses || []).forEach(v => {
    const div = document.createElement('div');
    div.className = 'verse';
    div.dataset.ayah = v.number;
    div.dataset.hide = (state.progress[num + ':' + v.number]?.hide) || 0;

    const words = (v.text || '').split(/\s+/)
      .map(w => `<span class="w">${w}</span>`).join(' ');
    div.innerHTML = `
      <span class="verse-number">${v.number}</span>
      <span class="verse-text">${words}</span>
      <button class="verse-actions-btn" onclick="showVerseActions(${num},${v.number})">⋯</button>
    `;
    div.onclick = (e) => { if (!e.target.closest('.verse-actions-btn')) toggleVerseHide(div, num, v.number); };
    container.appendChild(div);
  });

  DB.saveUserData('last_surah', num);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navSurah(delta) {
  const total = state.surahsMeta.length || (state.data?.surahs?.length || 0);
  let next = state.currentSurah + delta;
  if (next < 1) next = total;
  if (next > total) next = 1;
  state.currentSurah = next;
  renderSurah(next);
}

// ==================== إخفاء الكلمات للحفظ ====================
function toggleVerseHide(el, surahNum, ayahNum) {
  const key = surahNum + ':' + ayahNum;
  const cur = state.progress[key]?.hide || 0;
  const next = (cur + 1) % 5;  // 0 → 1 → 2 → 3 → 4 → 0
  el.dataset.hide = next;
  state.progress[key] = { ...(state.progress[key] || {}), hide: next };
  DB.saveUserData('progress', state.progress);
}

// ==================== إجراءات الآية ====================
window.showVerseActions = function(surahNum, ayahNum) {
  const key = surahNum + ':' + ayahNum;
  const cur = state.progress[key] || {};
  openModal('خيارات الآية', `
    <div class="verse-actions">
      <button onclick="repeatVerse(${surahNum},${ayahNum},3)">🔁 تكرار 3 مرات</button>
      <button onclick="repeatVerse(${surahNum},${ayahNum},5)">🔁 تكرار 5 مرات</button>
      <button onclick="repeatVerse(${surahNum},${ayahNum},10)">🔁 تكرار 10 مرات</button>
      <button onclick="toggleVerseBookmark(${surahNum},${ayahNum})">
        ${isVerseBookmarked(surahNum, ayahNum) ? '✖ إزالة العلامة' : '🔖 إضافة علامة'}
      </button>
      <button onclick="openVerseNote(${surahNum},${ayahNum})">📝 ملاحظة</button>
      <button onclick="showTafseer(${surahNum},${ayahNum})">📖 تفسير</button>
      <button onclick="markMemorized(${surahNum},${ayahNum})">
        ${cur.memorized ? '↺ إلغاء الحفظ' : '✅ تم الحفظ'}
      </button>
    </div>
  `);
};

function toggleVerseBookmark(s, a) {
  const id = s + ':' + a;
  const idx = state.bookmarks.indexOf(id);
  if (idx >= 0) state.bookmarks.splice(idx, 1);
  else state.bookmarks.push(id);
  DB.saveUserData('bookmarks', state.bookmarks);
  closeModal();
  renderSurah(state.currentSurah);
}

function isVerseBookmarked(s, a) {
  return state.bookmarks.includes(s + ':' + a);
}

function openVerseNote(s, a) {
  const id = s + ':' + a;
  const note = prompt('ملاحظتك على الآية:', state.notes[id] || '');
  if (note !== null) {
    state.notes[id] = note;
    DB.saveUserData('notes', state.notes);
    closeModal();
  }
}

function markMemorized(s, a) {
  const key = s + ':' + a;
  state.progress[key] = { ...(state.progress[key] || {}), memorized: !state.progress[key]?.memorized };
  DB.saveUserData('progress', state.progress);
  closeModal();
}

function repeatVerse(s, a, times) {
  const url = getAudioUrl(s);
  Audio.setRepeat(times);
  Audio.play(url);
  closeModal();
  document.getElementById('play-btn').textContent = '⏸ إيقاف';
}

function showTafseer(s, a) {
  openModal('تفسير الآية', 'سيتم تحميل التفاسير الكاملة في المرحلة القادمة.');
}

// ==================== القائمة الجانبية ====================
function toggleSidebar(open) {
  const sb = document.getElementById('sidebar');
  if (open === undefined) sb.classList.toggle('open');
  else sb.classList.toggle('open', open);
}

// ==================== الوضع الليلي ====================
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  DB.saveUserData('theme', state.theme);
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

// ==================== حجم الخط ====================
function applyFontSize() {
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'rem');
}

// ==================== الصوت ====================
let isPlaying = false;
function getAudioUrl(surahNum) {
  const reader = READERS[state.reader] || READERS.frgany;
  return reader.url + String(surahNum).padStart(3, '0') + '.mp3';
}
function togglePlay() {
  const btn = document.getElementById('play-btn');
  if (isPlaying) {
    Audio.pause();
    btn.textContent = '▶ تشغيل';
    isPlaying = false;
  } else {
    Audio.setRepeat(1);
    Audio.play(getAudioUrl(state.currentSurah));
    btn.textContent = '⏸ إيقاف';
    isPlaying = true;
  }
}
window.addEventListener('audio-ended', () => {
  document.getElementById('play-btn').textContent = '▶ تشغيل';
  isPlaying = false;
});

// ==================== شريط الأدوات ====================
function handleToolbar(action) {
  if (action === 'tafseer')   openModal('التفسير', 'سيتم دمج التفاسير قريباً.');
  else if (action === 'bookmark') showBookmarks();
  else if (action === 'note')  openNote();
  else if (action === 'translate') openModal('الترجمة', 'سيتم دمج الترجمات قريباً.');
  else if (action === 'settings') openSettings();
}

function showBookmarks() {
  if (!state.bookmarks.length) return openModal('العلامات', 'لا توجد علامات بعد.');
  const html = state.bookmarks.map(id => {
    const [s, a] = id.split(':');
    const meta = state.surahsMeta.find(x => x.n === +s);
    return `<button onclick="goToVerse(${s},${a})" style="display:block;width:100%;text-align:right;padding:.5rem;margin:.25rem 0;background:var(--verse-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer">
      ${meta?.name || 'سورة'} — آية ${a}
    </button>`;
  }).join('');
  openModal('العلامات', html);
}

window.goToVerse = function(s, a) {
  state.currentSurah = s;
  renderSurah(s);
  closeModal();
  setTimeout(() => {
    const el = document.querySelector(`.verse[data-ayah="${a}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('active'); }
  }, 200);
};

function openNote() {
  const note = prompt('ملاحظتك على السورة:');
  if (note) {
    state.notes['surah:' + state.currentSurah] = note;
    DB.saveUserData('notes', state.notes);
  }
}

function openSettings() {
  const html = `
    <div class="settings">
      <label>حجم الخط</label>
      <input type="range" min="1.2" max="2.4" step="0.1" value="${state.fontSize}"
             oninput="setFontSize(this.value)" />
      <label>القارئ</label>
      <select onchange="setReader(this.value)">
        ${Object.entries(READERS).map(([k, v]) =>
          `<option value="${k}" ${state.reader===k?'selected':''}>${v.name}</option>`
        ).join('')}
      </select>
      <div style="margin-top:1rem;font-size:.85rem;opacity:.7">
        آيات محفوظة: ${Object.values(state.progress).filter(p=>p.memorized).length}<br>
        علامات: ${state.bookmarks.length}<br>
        ملاحظات: ${Object.keys(state.notes).length}
      </div>
    </div>
  `;
  openModal('الإعدادات', html);
}

window.setFontSize = function(v) {
  state.fontSize = parseFloat(v);
  applyFontSize();
  DB.saveUserData('fontSize', state.fontSize);
};
window.setReader = function(r) {
  state.reader = r;
  DB.saveUserData('reader', r);
};

// ==================== البحث ====================
function onSearch(e) {
  const q = e.target.value.trim();
  if (q.length < 2) return;
  if (state.surahsMeta.length) renderSurahList(q);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ==================== Modal ====================
function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ==================== Service Worker ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}
