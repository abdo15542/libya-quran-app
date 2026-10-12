// ==================== الحالة العامة ====================
let state = {
  data: null,
  surahsMeta: [],
  currentSurah: 1,
  theme: 'light',
  fontSize: 1.6,
  viewMode: 'normal',
  bookmarks: [],
  notes: {},
  progress: {},
  reader: 'frgany',
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

  state.bookmarks = (await DB.getUserData('bookmarks')) || [];
  state.notes     = (await DB.getUserData('notes')) || {};
  state.progress  = (await DB.getUserData('progress')) || {};
  state.fontSize  = (await DB.getUserData('fontSize')) || 1.6;
  state.reader    = (await DB.getUserData('reader')) || 'frgany';
  state.viewMode  = (await DB.getUserData('viewMode')) || 'normal';

  const lastSurah = await DB.getUserData('last_surah');
  if (lastSurah) state.currentSurah = lastSurah;

  const tajweedEnabled = await DB.getUserData('tajweed');
  if (tajweedEnabled && window.Tajweed) Tajweed.toggle(true);

  applyFontSize();

  try {
    const status = document.getElementById('loading-status');
    status.textContent = 'تحميل فهرس السور...';
    state.surahsMeta = await DataLoader.loadSurahsMeta();

    status.textContent = 'تحميل المصحف...';
    state.data = await DataLoader.loadFullQuran((p) => {
      document.getElementById('progress-fill').style.width = Math.round(p * 100) + '%';
    });

    if (window.QuranSearch) {
      status.textContent = 'بناء فهرس البحث...';
      QuranSearch.build(state.data, state.surahsMeta);
    }

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
  const menuBtn = document.getElementById('menu-btn');
  const themeBtn = document.getElementById('theme-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const playBtn = document.getElementById('play-btn');
  const searchBtn = document.getElementById('search-btn');

  if (menuBtn) menuBtn.onclick = () => toggleSidebar(true);
  if (themeBtn) themeBtn.onclick = toggleTheme;
  if (prevBtn) prevBtn.onclick = () => navSurah(-1);
  if (nextBtn) nextBtn.onclick = () => navSurah(1);
  if (playBtn) playBtn.onclick = togglePlay;
  if (searchBtn) searchBtn.onclick = () => openSearchModal();

  document.querySelectorAll('#toolbar button').forEach(btn => {
    btn.onclick = () => handleToolbar(btn.dataset.action);
  });

  const modalClose = document.getElementById('modal-close');
  const modal = document.getElementById('modal');
  if (modalClose) modalClose.onclick = closeModal;
  if (modal) modal.onclick = (e) => { if (e.target.id === 'modal') closeModal(); };

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.oninput = debounce(onSidebarSearch, 300);

  window.addEventListener('scroll', updateReadingProgress, { passive: true });

  document.addEventListener('click', (e) => {
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'menu-btn') {
      toggleSidebar(false);
    }
  });
}

// ==================== عرض فهرس السور ====================
function renderSurahList(filter = '') {
  const ul = document.getElementById('surah-list');
  if (!ul) return;
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

function onSidebarSearch(e) {
  const q = e.target.value.trim();
  if (state.surahsMeta.length) renderSurahList(q);
}

// ==================== عرض السورة ====================
function renderSurah(num) {
  const surahs = state.data?.surahs || [];
  const surah = surahs[num - 1];
  if (!surah) return;

  const meta = state.surahsMeta.find(s => s.n === num) || {};
  const titleEl = document.getElementById('surah-title');
  const pageEl = document.getElementById('page-info');
  if (titleEl) titleEl.textContent = 'سورة ' + (surah.name || meta.name || '');
  if (pageEl) pageEl.textContent = (meta.type || '') + ' • ' + (surah.verses?.length || meta.verses || 0) + ' آية';

  const container = document.getElementById('verses-container');
  if (!container) return;
  container.innerHTML = '';

  if (num !== 9) {
    const bs = document.createElement('div');
    bs.className = 'bismillah';
    bs.textContent = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
    container.appendChild(bs);
  }

  const tajweedOn = window.Tajweed && Tajweed.isEnabled();

  (surah.verses || []).forEach(v => {
    const div = document.createElement('div');
    div.className = 'verse';
    div.dataset.ayah = v.number;
    div.dataset.surah = num;
    div.dataset.hide = (state.progress[num + ':' + v.number]?.hide) || 0;

    let processedText;
    if (tajweedOn) {
      processedText = Tajweed.apply(v.text || '');
    } else {
      processedText = (v.text || '').split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    }

    const isBookmarked = isVerseBookmarked(num, v.number);

    div.innerHTML = `
      <div class="verse-body">
        <span class="verse-number">${v.number}</span>
        <span class="verse-text">${processedText}</span>
      </div>
      <div class="verse-inline-actions hidden">
        <button data-act="tafsir" type="button">📖 تفسير</button>
        <button data-act="translation" type="button">🌐 ترجمة</button>
        <button data-act="bookmark" type="button">${isBookmarked ? '🔖 إزالة' : '🔖 علامة'}</button>
        <button data-act="note" type="button">📝 ملاحظة</button>
        <button data-act="close" type="button" class="inline-close">✕</button>
      </div>
      <div class="verse-inline-content"></div>
    `;

    div.addEventListener('click', (e) => {
      const btn = e.target.closest('.verse-inline-actions button');
      if (btn) {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'tafsir')            toggleInlineTafsir(num, v.number, div);
        else if (act === 'translation')  toggleInlineTranslation(num, v.number, div);
        else if (act === 'bookmark')     toggleVerseBookmarkInline(num, v.number, div);
        else if (act === 'note')         openVerseNoteInline(num, v.number, div);
        else if (act === 'close')        closeVerseInline(div);
        return;
      }
      // تجاهل النقر داخل المحتوى المفتوح
      if (e.target.closest('.verse-inline-content')) return;
      if (e.target.closest('.verse-body')) toggleInlineActions(div);
    });

    container.appendChild(div);
  });

  DB.saveUserData('last_surah', num);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  applyViewMode();
  setTimeout(updateReadingProgress, 100);
}

function navSurah(delta) {
  const total = state.surahsMeta.length || (state.data?.surahs?.length || 0);
  let next = state.currentSurah + delta;
  if (next < 1) next = total;
  if (next > total) next = 1;
  state.currentSurah = next;
  renderSurah(next);
}

// ==================== شريط الأدوات المضمّن ====================
function toggleInlineActions(verseEl) {
  const actions = verseEl.querySelector('.verse-inline-actions');
  if (!actions) return;
  // أغلق بقية الشرائط المفتوحة
  document.querySelectorAll('.verse-inline-actions:not(.hidden)').forEach(el => {
    if (el !== actions) el.classList.add('hidden');
  });
  actions.classList.toggle('hidden');
}

function closeVerseInline(verseEl) {
  const actions = verseEl.querySelector('.verse-inline-actions');
  const content = verseEl.querySelector('.verse-inline-content');
  if (actions) actions.classList.add('hidden');
  if (content) content.innerHTML = '';
}

// ==================== إخفاء الكلمات (حفظ) ====================
function toggleVerseHide(el, surahNum, ayahNum) {
  const key = surahNum + ':' + ayahNum;
  const cur = state.progress[key]?.hide || 0;
  const next = (cur + 1) % 5;
  el.dataset.hide = next;
  state.progress[key] = { ...(state.progress[key] || {}), hide: next };
  DB.saveUserData('progress', state.progress);
}

// ==================== التفسير المضمّن ====================
async function toggleInlineTafsir(surahNum, ayahNum, verseEl) {
  const content = verseEl.querySelector('.verse-inline-content');
  if (!content) return;

  // إذا كان مفتوحاً — أغلق
  if (content.dataset.mode === 'tafsir' && !content.classList.contains('hidden')) {
    content.innerHTML = '';
    content.dataset.mode = '';
    return;
  }

  content.dataset.mode = 'tafsir';
  content.innerHTML = '<div class="inline-loading">⏳ جاري تحميل التفسير...</div>';

  if (!window.TafsirModule) {
    content.innerHTML = '<div class="inline-error">وحدة التفاسير غير محمّلة.</div>';
    return;
  }

  try {
    const tafsirs = await TafsirModule.available();
    const downloaded = tafsirs.filter(t => t.downloaded);

    if (!downloaded.length) {
      content.innerHTML = '<div class="inline-error">لم يتم تحميل أي تفسير بعد.</div>';
      return;
    }

    let html = '<div class="inline-tabs">';
    downloaded.forEach((t, i) => {
      html += `<button class="inline-tab ${i===0?'active':''}" 
                data-tafsir="${t.id}">${t.name}</button>`;
    });
    html += '</div><div class="inline-body" id="inline-body-' + surahNum + '-' + ayahNum + '">⏳ جاري التحميل...</div>';

    content.innerHTML = html;

    // ربط الأزرار
    content.querySelectorAll('.inline-tab').forEach(tab => {
      tab.onclick = () => {
        content.querySelectorAll('.inline-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadTafsirInto(content, tab.dataset.tafsir, surahNum, ayahNum);
      };
    });

    // حمّل الأول
    loadTafsirInto(content, downloaded[0].id, surahNum, ayahNum);
  } catch (e) {
    content.innerHTML = '<div class="inline-error">خطأ: ' + e.message + '</div>';
  }
}

async function loadTafsirInto(content, tafsirId, surahNum, ayahNum) {
  const body = content.querySelector('.inline-body');
  if (!body) return;
  body.innerHTML = '⏳ جاري التحميل...';

  try {
    const data = await TafsirModule.load(tafsirId);
    const text = TafsirModule.getVerse(data, surahNum, ayahNum);
    if (text) {
      body.innerHTML = text.replace(/\n/g, '<br>');
    } else {
      body.innerHTML = '<em>لا يوجد تفسير لهذه الآية في هذا المصدر.</em>';
    }
  } catch (e) {
    body.innerHTML = '<span style="color:#c00">خطأ: ' + e.message + '</span>';
  }
}

// ==================== الترجمة المضمّنة ====================
async function toggleInlineTranslation(surahNum, ayahNum, verseEl) {
  const content = verseEl.querySelector('.verse-inline-content');
  if (!content) return;

  if (content.dataset.mode === 'translation' && !content.classList.contains('hidden')) {
    content.innerHTML = '';
    content.dataset.mode = '';
    return;
  }

  content.dataset.mode = 'translation';
  content.innerHTML = '<div class="inline-loading">⏳ جاري تحميل الترجمة...</div>';

  if (!window.TranslationModule) {
    content.innerHTML = '<div class="inline-error">وحدة الترجمة غير محمّلة.</div>';
    return;
  }

  try {
    const translations = await TranslationModule.available();
    const downloaded = translations.filter(t => t.downloaded);

    if (!downloaded.length) {
      content.innerHTML = '<div class="inline-error">لم يتم تحميل أي ترجمة بعد.</div>';
      return;
    }

    let html = '<div class="inline-tabs">';
    downloaded.forEach((t, i) => {
      html += `<button class="inline-tab ${i===0?'active':''}" 
                data-lang="${t.lang}">${t.flag} ${t.name}</button>`;
    });
    html += '</div><div class="inline-body" dir="auto">⏳ جاري التحميل...</div>';

    content.innerHTML = html;

    content.querySelectorAll('.inline-tab').forEach(tab => {
      tab.onclick = () => {
        content.querySelectorAll('.inline-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadTranslationInto(content, tab.dataset.lang, surahNum, ayahNum);
      };
    });

    loadTranslationInto(content, downloaded[0].lang, surahNum, ayahNum);
  } catch (e) {
    content.innerHTML = '<div class="inline-error">خطأ: ' + e.message + '</div>';
  }
}

async function loadTranslationInto(content, lang, surahNum, ayahNum) {
  const body = content.querySelector('.inline-body');
  if (!body) return;
  body.innerHTML = '⏳ جاري التحميل...';

  try {
    const data = await TranslationModule.load(lang);
    const text = TranslationModule.getVerse(data, surahNum, ayahNum);
    if (text) {
      const isRTL = ['ar', 'ber'].includes(lang);
      body.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
      body.innerHTML = text;
    } else {
      body.innerHTML = '<em>لا توجد ترجمة لهذه الآية.</em>';
    }
  } catch (e) {
    body.innerHTML = '<span style="color:#c00">خطأ: ' + e.message + '</span>';
  }
}

// ==================== العلامات والملاحظات المضمّنة ====================
function toggleVerseBookmarkInline(s, a, verseEl) {
  const id = s + ':' + a;
  const idx = state.bookmarks.indexOf(id);
  if (idx >= 0) state.bookmarks.splice(idx, 1);
  else state.bookmarks.push(id);
  DB.saveUserData('bookmarks', state.bookmarks);

  const btn = verseEl.querySelector('.verse-inline-actions button[data-act="bookmark"]');
  if (btn) {
    btn.textContent = state.bookmarks.includes(id) ? '🔖 إزالة' : '🔖 علامة';
  }
}

function openVerseNoteInline(s, a, verseEl) {
  const id = s + ':' + a;
  const note = prompt('ملاحظتك على الآية:', state.notes[id] || '');
  if (note !== null) {
    state.notes[id] = note;
    DB.saveUserData('notes', state.notes);
    const content = verseEl.querySelector('.verse-inline-content');
    content.dataset.mode = 'note';
    content.innerHTML = '<div class="inline-note"><strong>📝 ملاحظتك:</strong><br>' 
                      + note.replace(/\n/g, '<br>') + '</div>';
  }
}

function isVerseBookmarked(s, a) {
  return state.bookmarks.includes(s + ':' + a);
}

// ==================== القائمة الجانبية ====================
function toggleSidebar(open) {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
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
  if (!window.Audio) return;
  if (isPlaying) {
    Audio.pause();
    if (btn) btn.textContent = '▶ تشغيل';
    isPlaying = false;
  } else {
    Audio.setRepeat(1);
    Audio.play(getAudioUrl(state.currentSurah));
    if (btn) btn.textContent = '⏸ إيقاف';
    isPlaying = true;
  }
}
window.addEventListener('audio-ended', () => {
  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = '▶ تشغيل';
  isPlaying = false;
});

// ==================== شريط الأدوات العلوي ====================
function handleToolbar(action) {
  if (action === 'tafseer')        openSearchModal();
  else if (action === 'translate') openSearchModal();
  else if (action === 'tajweed')   showTajweedLegend();
  else if (action === 'bookmark')  showBookmarks();
  else if (action === 'note')      openNote();
  else if (action === 'settings')  openSettingsNew();
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

function goToVerse(s, a) {
  state.currentSurah = s;
  renderSurah(s);
  closeModal();
  setTimeout(() => {
    const el = document.querySelector(`.verse[data-ayah="${a}"]`);
    if (el) { 
      el.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 2000);
    }
  }, 300);
}

function openNote() {
  const note = prompt('ملاحظتك على السورة:');
  if (note) {
    state.notes['surah:' + state.currentSurah] = note;
    DB.saveUserData('notes', state.notes);
  }
}

function openSettingsNew() {
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
      <label>التلوين التجويدي</label>
      <div style="display:flex;gap:.5rem;align-items:center;margin:.5rem 0">
        <input type="checkbox" id="tajweed-check" ${window.Tajweed && Tajweed.isEnabled()?'checked':''}
               onchange="setTajweed(this.checked)" style="width:20px;height:20px" />
        <label for="tajweed-check" style="margin:0;font-weight:normal">تفعيل تلوين أحكام التجويد</label>
      </div>
<div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.85rem;color:var(--text-2)">
        <div>📊 <strong>إحصاءاتك:</strong></div>
        <div style="margin-top:.5rem">
          ✅ آيات محفوظة: ${Object.values(state.progress).filter(p=>p.memorized).length}<br>
          🔖 علامات: ${state.bookmarks.length}<br>
          📝 ملاحظات: ${Object.keys(state.notes).length}<br>
          🎨 التجويد: ${window.Tajweed && Tajweed.isEnabled() ? 'مفعّل' : 'معطّل'}
        </div>
      </div>
    </div>
  `;
  openModal('⚙️ الإعدادات', html);
}

function setFontSize(v) {
  state.fontSize = parseFloat(v);
  applyFontSize();
  DB.saveUserData('fontSize', state.fontSize);
}
function setReader(r) {
  state.reader = r;
  DB.saveUserData('reader', r);
}
function setTajweed(enabled) {
  if (window.Tajweed) Tajweed.toggle(enabled);
  DB.saveUserData('tajweed', enabled);
  closeModal();
  renderSurah(state.currentSurah);
}
function setViewMode(mode) {
  state.viewMode = mode;
  DB.saveUserData('viewMode', mode);
  applyViewMode();
}
function applyViewMode() {
  const container = document.querySelector('.reader');
  if (!container) return;
  if (state.viewMode === 'focus') container.classList.add('focus-mode');
  else container.classList.remove('focus-mode');
}

// ==================== البحث في القرآن ====================
function openSearchModal() {
  openModal('🔍 البحث في القرآن', `
    <div class="search-modal-content">
      <input type="text" id="quran-search-input" class="search-input-lg"
             placeholder="اكتب كلمة أو آية... مثال: الرحمن، الصبر، الله" autofocus />
      <div id="search-summary" class="search-summary"></div>
      <div id="search-results-container" class="search-results">
        <div class="no-results">اكتب حرفين على الأقل للبحث في 6236 آية</div>
      </div>
    </div>
  `);

  const input = document.getElementById('quran-search-input');
  if (!input) return;

  setTimeout(() => input.focus(), 100);

  input.oninput = debounce((e) => {
    const q = e.target.value.trim();
    const container = document.getElementById('search-results-container');
    const summary = document.getElementById('search-summary');
    if (!container) return;

    if (q.length < 2) {
      container.innerHTML = '<div class="no-results">اكتب حرفين على الأقل للبحث</div>';
      if (summary) summary.innerHTML = '';
      return;
    }

    if (!window.QuranSearch) {
      container.innerHTML = '<div class="no-results">وحدة البحث غير محمّلة</div>';
      return;
    }

    const { results, totalMatches, uniqueSurahs } = QuranSearch.query(q);

    if (!results.length) {
      container.innerHTML = '<div class="no-results">لا توجد نتائج مطابقة</div>';
      if (summary) summary.innerHTML = '';
      return;
    }

    if (summary) {
      summary.innerHTML = `
        <div class="search-summary-card">
          <div class="summary-stat">
            <div class="summary-num">${totalMatches}</div>
            <div class="summary-label">مرة ذُكرت</div>
          </div>
          <div class="summary-stat">
            <div class="summary-num">${results.length}</div>
            <div class="summary-label">آية</div>
          </div>
          <div class="summary-stat">
            <div class="summary-num">${uniqueSurahs}</div>
            <div class="summary-label">سورة</div>
          </div>
        </div>
      `;
    }

    const limit = 100;
    const shown = results.slice(0, limit);

    let html = '';
    shown.forEach(r => {
      html += `
        <div class="search-result" onclick="goToVerse(${r.s}, ${r.a})">
          <div class="sr-header">
            <span class="sr-surah">سورة ${r.sName}</span>
            <span class="sr-num">آية ${r.a}</span>
          </div>
          <div class="sr-text">${QuranSearch.highlight(r.text, q)}</div>
        </div>
      `;
    });

    if (results.length > limit) {
      html += `<div class="search-more">... و ${results.length - limit} نتيجة أخرى. أدخل كلمات أكثر لتضييق البحث.</div>`;
    }

    container.innerHTML = html;
  }, 300);
}


function showTajweedLegend() {
  if (!window.Tajweed) {
    return openModal('التجويد', 'وحدة التجويد غير محمّلة.');
  }
  const html = `
    <div class="tajweed-legend">
      ${Tajweed.rules.map(r => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${r.color}"></span>
          <span>${r.label}</span>
        </div>
      `).join('')}
    </div>
    <button onclick="toggleTajweedFromModal()"
            style="width:100%;padding:.75rem;background:var(--gold);color:var(--green);border:none;border-radius:8px;font-size:1rem;font-family:inherit;cursor:pointer;font-weight:bold">
      ${Tajweed.isEnabled() ? '⏸ تعطيل التلوين' : '▶ تفعيل التلوين'}
    </button>
  `;
  openModal('🎨 مفتاح التجويد', html);
}

function toggleTajweedFromModal() {
  if (!window.Tajweed) return;
  const enabled = Tajweed.toggle(!Tajweed.isEnabled());
  DB.saveUserData('tajweed', enabled);
  closeModal();
  renderSurah(state.currentSurah);
}

function updateReadingProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  const bar = document.getElementById('reading-progress-bar');
  if (bar) bar.style.width = Math.max(0, Math.min(100, progress)) + '%';
}

// ==================== أدوات مساعدة ====================
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function openModal(title, body) {
  const t = document.getElementById('modal-title');
  const b = document.getElementById('modal-body');
  const m = document.getElementById('modal');
  if (t) t.textContent = title;
  if (b) b.innerHTML = body;
  if (m) m.classList.remove('hidden');
}
function closeModal() {
  const m = document.getElementById('modal');
  if (m) m.classList.add('hidden');
}

// دعم التوافق الخلفي
function showVerseActions() { /* لم يعد مستخدماً */ }
function showVerseTafsir(s, a) {
  const el = document.querySelector(`.verse[data-ayah="${a}"][data-surah="${s}"]`);
  if (el) toggleInlineTafsir(s, a, el);
}
function showVerseTranslation(s, a) {
  const el = document.querySelector(`.verse[data-ayah="${a}"][data-surah="${s}"]`);
  if (el) toggleInlineTranslation(s, a, el);
}

// إتاحة الدوال العامة
window.goToVerse = goToVerse;
window.setFontSize = setFontSize;
window.setReader = setReader;
window.setTajweed = setTajweed;
window.setViewMode = setViewMode;
window.toggleTajweedFromModal = toggleTajweedFromModal;
window.showVerseTafsir = showVerseTafsir;
window.showVerseTranslation = showVerseTranslation;

// ==================== Service Worker ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}
