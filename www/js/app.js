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

// READERS محمّلة من reciters.js

// حالة الصوت
let audioState = {
  isPlaying: false,
  currentSurah: null,
  currentUrl: null,
  isBuffering: false,
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
    setTimeout(function() {
      if (typeof setupAutoUpdater === 'function') setupAutoUpdater();
    }, 3000);
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
        <button data-act="play" type="button">🎧 تشغيل من هنا</button>
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
        else if (act === 'play')         playSurahFromVerse(num, v.number);
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

function playSurahFromVerse(surahNum, ayahNum) {
  // شغّل السورة كاملة من البداية
  if (state.currentSurah !== surahNum) {
    state.currentSurah = surahNum;
  }

  const url = getAudioUrl(surahNum);
  QuranQuranAudio.setRepeat(1);
  QuranQuranQuranAudio.play(url);

  audioState.isPlaying = true;
  audioState.currentSurah = surahNum;

  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = '⏸ إيقاف';

  showUpdateToast('🎧 جاري تشغيل سورة ' + (state.data?.surahs?.[surahNum - 1]?.name || ''));
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
function getAudioUrl(surahNum) {
  const reader = window.READERS[state.reader] || READERS.qariou;
  const padded = String(surahNum).padStart(3, '0');
  return reader.pattern.replace('{s}', padded);
}

function getAudioUrlFallback(surahNum) {
  const reader = window.READERS[state.reader];
  if (!reader || !reader.fallback) return null;
  const padded = String(surahNum).padStart(3, '0');
  return reader.fallback.replace('{s}', padded);
}

async function togglePlay() {
  const btn = document.getElementById('play-btn');
  if (!window.QuranAudio) return;

  if (audioState.isPlaying) {
    QuranAudio.pause();
    if (btn) btn.textContent = '▶ تشغيل';
    audioState.isPlaying = false;
  } else {
    if (btn) btn.textContent = '⏳ جاري التحميل...';
    audioState.isPlaying = true;
    
    try {
      await QuranAudio.play(state.reader, state.currentSurah, 1);
      if (btn) btn.textContent = '⏸ إيقاف';
    } catch (e) {
      if (btn) btn.textContent = '▶ تشغيل';
      audioState.isPlaying = false;
      showUpdateToast('❌ ' + e.message);
    }
  }
}



// عند انتهاء التلاوة
window.addEventListener('audio-ended', () => {
  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = '▶ تشغيل';
  audioState.isPlaying = false;
});

// ==================== تحميل السورة أوفلاين ====================
async function downloadCurrentSurah() {
  const url = getAudioUrl(state.currentSurah);
  const surah = state.data?.surahs?.[state.currentSurah - 1];
  const name = surah?.name || 'السورة';

  showUpdateToast('📥 جاري تحميل سورة ' + name + '...');

  try {
    const cache = await caches.open('libya-quran-audio-v1');
    const cached = await cache.match(url);

    if (cached) {
      showUpdateToast('✅ السورة محمّلة مسبقاً');
      return;
    }

    await cache.add(url);
    showUpdateToast('✅ تم تحميل سورة ' + name + ' — يمكنك تشغيلها بدون إنترنت');
  } catch (e) {
    console.warn('فشل تحميل السورة:', e);
    showUpdateToast('❌ فشل التحميل: ' + e.message);
  }
}

// فحص إذا كانت السورة محمّلة
async function isSurahDownloaded(surahNum) {
  try {
    const url = getAudioUrl(surahNum);
    const cache = await caches.open('libya-quran-audio-v1');
    const cached = await cache.match(url);
    return !!cached;
  } catch (e) {
    return false;
  }
}

// حذف السورة المحمّلة
async function deleteSurahDownload(surahNum) {
  try {
    const url = getAudioUrl(surahNum);
    const cache = await caches.open('libya-quran-audio-v1');
    await cache.delete(url);
    return true;
  } catch (e) {
    return false;
  }
}

// إحصاءات الصوت المحمّل
async function getAudioCacheStats() {
  try {
    const cache = await caches.open('libya-quran-audio-v1');
    const keys = await cache.keys();
    return { count: keys.length };
  } catch (e) {
    return { count: 0 };
  }
}

// ==================== شريط الأدوات العلوي ====================// ==================== شريط الأدوات العلوي ====================
function handleToolbar(action) {
  const surah = state.data?.surahs?.[state.currentSurah - 1];
  const totalAyahs = surah?.verses?.length || 1;

  if (action === 'tafseer') {
    const a = prompt('اختر رقم الآية من 1 إلى ' + totalAyahs + ':', '1');
    if (a && +a >= 1 && +a <= totalAyahs) {
      // اذهب إلى الآية وافتح التفسير
      const el = document.querySelector('.verse[data-ayah="' + a + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          // أغلق أي محتوى سابق
          document.querySelectorAll('.verse-inline-actions:not(.hidden)').forEach(x => x.classList.add('hidden'));
          toggleInlineTafsir(state.currentSurah, +a, el);
        }, 400);
      }
    }
  }
  else if (action === 'translate') {
    const a = prompt('اختر رقم الآية من 1 إلى ' + totalAyahs + ':', '1');
    if (a && +a >= 1 && +a <= totalAyahs) {
      const el = document.querySelector('.verse[data-ayah="' + a + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          document.querySelectorAll('.verse-inline-actions:not(.hidden)').forEach(x => x.classList.add('hidden'));
          toggleInlineTranslation(state.currentSurah, +a, el);
        }, 400);
      }
    }
  }
  else if (action === 'tajweed')  showTajweedLegend();
  else if (action === 'bookmark') showBookmarks();
  else if (action === 'note')     openNote();
  else if (action === 'settings') openSettingsNew();
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
  const readerOptions = Object.entries(window.READERS).map(([k, v]) =>
    '<option value="' + k + '" ' + (state.reader === k ? 'selected' : '') + '>' +
    v.country + ' — ' + v.name + '</option>'
  ).join('');

  const html = `
    <div class="settings">
      <label>حجم الخط</label>
      <input type="range" min="1.2" max="2.4" step="0.1" value="${state.fontSize}"
             oninput="setFontSize(this.value)" />

      <label>🎧 القارئ</label>
      <select onchange="setReader(this.value)" id="reader-select">
        ${readerOptions}
      </select>

      <div class="audio-download-box" id="audio-download-box">
        <div class="audio-download-header">🎵 المصحف الصوتي</div>
        <div class="audio-download-info" id="audio-stats-text">
          ⏳ جاري حساب...
        </div>
        <div class="audio-progress-bar">
          <div class="audio-progress-fill" id="audio-progress-fill" style="width:0%"></div>
        </div>
        <div class="audio-progress-label" id="audio-progress-label"></div>
        <div class="audio-download-actions">
          <button class="audio-dl-btn-primary" id="audio-dl-btn" onclick="startAudioDownload()">
            ⬇️ تحميل المصحف الصوتي
          </button>
          <button class="audio-dl-btn-danger" id="audio-del-btn" onclick="deleteAudioDownload()">
            🗑️ حذف الملفات الصوتية
          </button>
        </div>
        <div class="audio-download-note">
          💡 التحميل يستهلك ~800 ميجابايت — يُنصح باستخدام WiFi
        </div>
      </div>

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

  // احسب الإحصاءات
  updateAudioStatsUI();
}

async function updateAudioStatsUI() {
  if (!window.AudioDownloader) return;
  try {
    const stats = await AudioDownloader.getStats();
    const sizeMB = (stats.bytes / 1024 / 1024).toFixed(1);
    const box = document.getElementById('audio-stats-text');
    if (box) {
      box.innerHTML = '📦 محمّل: <strong>' + stats.count + ' / 114</strong> سورة (' + sizeMB + ' MB)';
    }
    
    const pct = Math.round((stats.count / 114) * 100);
    const fill = document.getElementById('audio-progress-fill');
    if (fill) fill.style.width = pct + '%';
  } catch (e) {
    console.warn('إحصاءات الصوت:', e);
  }
}

async function startAudioDownload() {
  const btn = document.getElementById('audio-dl-btn');
  const label = document.getElementById('audio-progress-label');
  const fill = document.getElementById('audio-progress-fill');
  
  if (!window.AudioDownloader) {
    return showUpdateToast('❌ وحدة التحميل غير محمّلة');
  }

  if (AudioDownloader.isDownloading()) {
    return showUpdateToast('⚠ التحميل جارٍ بالفعل');
  }

  const reader = window.READERS[state.reader];
  if (!reader) {
    return showUpdateToast('❌ اختر قارئاً أولاً');
  }

  // تنبيه للقراء من نوع ayah
  let warning = 'سيتم تحميل ' + reader.name + '\n\n';
  warning += 'الحجم المتوقع: ~800 ميجابايت\n';
  warning += 'الوقت المتوقع: 20-60 دقيقة\n\n';
  warning += '💡 يُنصح باستخدام WiFi\n';
  warning += '(لكنه يعمل على أي شبكة)\n\n';
  warning += 'هل تريد المتابعة؟';

  if (!confirm(warning)) {
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحميل...'; }

  window.QURAN_DATA_CACHE = state.data;
  let lastSize = 0;

  try {
    await AudioDownloader.downloadAll(state.reader, (progress) => {
      const pct = Math.round((progress.completed / progress.total) * 100);
      if (fill) fill.style.width = pct + '%';
      
      // احسب الحجم
      if (progress.size) lastSize += progress.size;
      const sizeMB = (lastSize / 1024 / 1024).toFixed(1);
      
      if (label) {
        const status = progress.status === 'done' ? '✅'
          : progress.status === 'failed' ? '❌'
          : progress.status === 'skip' ? '⏭'
          : '⏳';
        label.innerHTML = status + ' سورة ' + progress.current + 
          ' (' + (progress.surahName || '') + ')<br>' +
          progress.completed + ' / ' + progress.total + 
          ' — ' + pct + '% — ' + sizeMB + ' MB';
      }
      
      // إشعار للنجاح
      if (progress.status === 'done') {
        console.log('✓ تم تحميل سورة ' + progress.current);
      }
      if (progress.status === 'failed') {
        console.warn('✗ فشلت سورة ' + progress.current + ': ' + progress.error);
      }
    });

    const stats = await AudioDownloader.getStats();
    const sizeMB = (stats.bytes / 1024 / 1024).toFixed(1);
    
    showUpdateToast('✅ اكتمل! ' + stats.count + '/114 سورة — ' + sizeMB + ' MB');
    await updateAudioStatsUI();
    
    if (btn) { 
      btn.textContent = '✅ مكتمل (' + sizeMB + ' MB)'; 
      btn.style.background = '#27ae60'; 
    }
  } catch (e) {
    showUpdateToast('❌ فشل: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ إعادة المحاولة'; }
  }
}


async function deleteAudioDownload() {
  if (!confirm('سيتم حذف جميع الملفات الصوتية المحمّلة. هل أنت متأكد؟')) return;
  try {
    await AudioDownloader.deleteAll();
    showUpdateToast('🗑️ تم حذف جميع الملفات الصوتية');
    await updateAudioStatsUI();
  } catch (e) {
    showUpdateToast('❌ فشل الحذف: ' + e.message);
  }
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
window.openMemoSection = openMemoSection;
window.startAudioDownload = startAudioDownload;
window.deleteAudioDownload = deleteAudioDownload;
window.updateAudioStatsUI = updateAudioStatsUI;
window.downloadCurrentSurah = downloadCurrentSurah;
window.isSurahDownloaded = isSurahDownloaded;
window.deleteSurahDownload = deleteSurahDownload;
window.getAudioCacheStats = getAudioCacheStats;
window.startReviewSession = startReviewSession;
window.revealVerse = revealVerse;
window.answerReview = answerReview;
window.skipReview = skipReview;
window.showAddVerseDialog = showAddVerseDialog;
window.doAddVerse = doAddVerse;
window.showMemoStats = showMemoStats;
window.showMemorizedList = showMemorizedList;
window.showVerseTranslation = showVerseTranslation;

// ==================== نظام التحديث مع إشعارات ====================
let _updateInfo = null;
let _updateListenersReady = false;

async function setupAutoUpdater() {
  if (!window.Capacitor || !Capacitor.Plugins) return;
  const { CapacitorUpdater, LocalNotifications } = Capacitor.Plugins;
  if (!CapacitorUpdater) {
    console.log('Updater: غير متوفر');
    return;
  }

  try {
    // طلب صلاحية الإشعارات مرة واحدة
    if (LocalNotifications) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
        // أنشئ قناة Android 8+
        await LocalNotifications.createChannel({
          id: 'updates',
          name: 'التحديثات',
          description: 'إشعارات تحديث التطبيق',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
      } catch (e) {
        console.warn('Notifications setup:', e.message);
      }

      // استمع لنقر الإشعار
      LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
        console.log('📱 تم النقر على الإشعار:', action);
        if (action.notification.extra?.type === 'update') {
          await applyUpdateNow();
        }
      });
    }

    // مستمعو الأحداث
    if (!_updateListenersReady) {
      CapacitorUpdater.addListener('download', (info) => {
        const pct = Math.round(info.percent || 0);
        showUpdateToast('📥 جاري تحميل التحديث: ' + pct + '%');
      });

      CapacitorUpdater.addListener('downloadComplete', () => {
        showUpdateToast('✅ اكتمل التحميل — إعادة التشغيل...');
      });

      CapacitorUpdater.addListener('updateFailed', (info) => {
        console.warn('⚠ فشل التحديث:', info);
      });

      _updateListenersReady = true;
    }

    // فحص التحديثات
    await checkForUpdates();
  } catch (e) {
    console.warn('Updater error:', e.message);
  }
}

async function checkForUpdates() {
  const { CapacitorUpdater, LocalNotifications } = Capacitor.Plugins;

  try {
    // جلب معلومات التحديث من GitHub
    const res = await fetch('https://github.com/abdo15542/libya-quran-app/releases/latest/download/update.json?_=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const remote = await res.json();

    // الإصدار الحالي
    const current = await CapacitorUpdater.current();
    const currentVersion = current?.bundle?.version || 'builtin';

    console.log('📌 الإصدار الحالي:', currentVersion);
    console.log('📌 الإصدار المتوفر:', remote.version);

    // هل يوجد تحديث جديد؟
    if (remote.version && remote.version !== currentVersion) {
      _updateInfo = remote;
      console.log('🎉 تحديث جديد متوفر:', remote.version);

      // إظهار إشعار
      if (LocalNotifications) {
        await LocalNotifications.schedule({
          notifications: [{
            id: 1001,
            title: '🕌 مصحف ليبيا — تحديث جديد',
            body: 'اضغط لتحميل وتثبيت التحديث الآن',
            channelId: 'updates',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#0a3d2c',
            extra: { type: 'update' },
            ongoing: false,
            autoCancel: true,
          }]
        });
        console.log('✓ تم إظهار الإشعار');
      }

      // إظهار شريط داخل التطبيق أيضاً
      showUpdateBanner(remote.version);
    } else {
      console.log('✓ أنت على أحدث إصدار');
    }
  } catch (e) {
    console.warn('فحص التحديثات:', e.message);
  }
}

async function applyUpdateNow() {
  const { CapacitorUpdater } = Capacitor.Plugins;
  if (!CapacitorUpdater) return;

  showUpdateToast('📥 جاري تحميل التحديث...');

  try {
    // حمّل التحديث من رابط bundle.zip
    const bundle = await CapacitorUpdater.download({
      url: 'https://github.com/abdo15542/libya-quran-app/releases/latest/download/bundle.zip',
      version: _updateInfo?.version || ('v' + Date.now()),
    });

    console.log('✓ تم تحميل الحزمة:', bundle);

    showUpdateToast('✅ جاري تطبيق التحديث...');

    // طبّق التحديث وأعد التشغيل
    await CapacitorUpdater.set({ id: bundle.id });
    await CapacitorUpdater.reload();
  } catch (e) {
    console.error('فشل تطبيق التحديث:', e);
    showUpdateToast('❌ فشل: ' + e.message);
  }
}

// شريط التحديث داخل التطبيق
function showUpdateBanner(version) {
  // احذف القديم إن وُجد
  const old = document.getElementById('update-banner');
  if (old) old.remove();

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:.75rem;flex:1">
      <span style="font-size:1.5rem">🎉</span>
      <div style="flex:1">
        <div style="font-weight:bold;color:var(--gold)">تحديث جديد متوفر</div>
        <div style="font-size:.8rem;opacity:.9">الإصدار: ${version}</div>
      </div>
    </div>
    <button id="update-now-btn" style="background:var(--gold);color:var(--green);border:none;padding:.5rem 1rem;border-radius:20px;font-family:inherit;font-size:.9rem;font-weight:bold;cursor:pointer;white-space:nowrap">
      تحديث الآن
    </button>
    <button id="update-close-btn" style="background:transparent;color:var(--text-2);border:none;font-size:1.3rem;cursor:pointer;padding:.25rem">✕</button>
  `;
  banner.style.cssText = 'position:fixed;bottom:70px;left:.5rem;right:.5rem;background:#0a3d2c;' +
    'color:#fff;padding:.75rem;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.4);' +
    'z-index:10000;display:flex;align-items:center;gap:.5rem;font-family:inherit;' +
    'animation:slideUp .3s ease;border:2px solid var(--gold);';

  document.body.appendChild(banner);

  document.getElementById('update-now-btn').onclick = () => {
    banner.remove();
    applyUpdateNow();
  };
  document.getElementById('update-close-btn').onclick = () => banner.remove();

  // حرّك الشريط للأعلى
  if (!document.getElementById('update-banner-style')) {
    const style = document.createElement('style');
    style.id = 'update-banner-style';
    style.textContent = '@keyframes slideUp{from{transform:translateY(100px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(style);
  }
}


// ==================== قسم الحفظ ====================
let _reviewQueue = [];
let _reviewCurrentIdx = 0;
let _reviewSessionStats = { easy: 0, medium: 0, hard: 0 };

async function openMemoSection() {
  const stats = await MemoModule.stats();

  const html = `
    <div class="memo-section">
      <div class="memo-stats-grid">
        <div class="memo-stat-card">
          <div class="memo-stat-num">${stats.total}</div>
          <div class="memo-stat-label">✅ محفوظ</div>
        </div>
        <div class="memo-stat-card ${stats.dueToday > 0 ? 'highlight' : ''}">
          <div class="memo-stat-num">${stats.dueToday}</div>
          <div class="memo-stat-label">⏰ للمراجعة</div>
        </div>
        <div class="memo-stat-card">
          <div class="memo-stat-num">${stats.streak}</div>
          <div class="memo-stat-label">🔥 سلسلة (يوم)</div>
        </div>
      </div>

      <div class="memo-progress-bar">
        <div class="memo-progress-fill" style="width:${stats.todayProgress}%"></div>
      </div>
      <div class="memo-progress-label">تقدم اليوم: ${stats.reviewedToday}/${stats.reviewedToday + stats.dueToday} آية</div>

      <div class="memo-actions">
        <button class="memo-btn-primary" onclick="startReviewSession()" ${stats.dueToday === 0 ? 'disabled' : ''}>
          ${stats.dueToday > 0 ? '▶ ابدأ المراجعة (' + stats.dueToday + ')' : '✅ لا توجد مراجعات اليوم'}
        </button>
        <button class="memo-btn-secondary" onclick="showAddVerseDialog()">➕ إضافة آية للحفظ</button>
        <button class="memo-btn-secondary" onclick="showMemoStats()">📊 تفاصيل الإحصائيات</button>
        <button class="memo-btn-secondary" onclick="showMemorizedList()">📖 قائمة المحفوظات (${stats.total})</button>
      </div>
    </div>
  `;
  openModal('📚 قسم الحفظ', html);
}

async function startReviewSession() {
  const due = await MemoModule.dueToday();
  if (!due.length) {
    return openModal('✅ ممتاز!', 'لا توجد آيات للمراجعة الآن. عد لاحقاً.');
  }

  _reviewQueue = due;
  _reviewCurrentIdx = 0;
  _reviewSessionStats = { easy: 0, medium: 0, hard: 0 };

  showReviewCard();
}

function showReviewCard() {
  if (_reviewCurrentIdx >= _reviewQueue.length) {
    return showSessionComplete();
  }

  const item = _reviewQueue[_reviewCurrentIdx];
  const surah = state.data?.surahs?.[item.s - 1];
  const verse = surah?.verses?.find(v => v.number === item.a);
  if (!verse) { _reviewCurrentIdx++; return showReviewCard(); }

  const progress = `(${_reviewCurrentIdx + 1}/${_reviewQueue.length})`;
  const levelName = MemoModule.levelNames[item.level] || 'جديد';

  const html = `
    <div class="review-session">
      <div class="review-header">
        <span>${progress}</span>
        <span class="review-level">المرحلة: ${levelName}</span>
      </div>

      <div class="review-surah">سورة ${surah.name} — آية ${item.a}</div>

      <div class="review-verse-box" id="review-verse-box">
        <div class="review-verse-text hidden-verse" id="review-text">
          ${(verse.text || '').split(/\s+/).map(function(w) {
            return '<span class="w">' + w + '</span>';
          }).join(' ')}
        </div>
        <button class="review-reveal-btn" id="reveal-btn" onclick="revealVerse()">👁️ إظهار</button>
      </div>

      <div class="review-buttons hidden" id="review-buttons">
        <div class="review-question">كيف كان أداؤك؟</div>
        <button class="review-btn hard" onclick="answerReview('hard')">
          <span>😰</span>
          <div>صعب</div>
          <div class="review-btn-sub">إعادة قريباً</div>
        </button>
        <button class="review-btn medium" onclick="answerReview('medium')">
          <span>🙂</span>
          <div>متوسط</div>
          <div class="review-btn-sub">نفس المرحلة</div>
        </button>
        <button class="review-btn easy" onclick="answerReview('easy')">
          <span>😎</span>
          <div>سهل</div>
          <div class="review-btn-sub">تقدّم سريع</div>
        </button>
      </div>

      <button class="review-skip-btn" onclick="skipReview()">تخطي هذه المرة</button>
    </div>
  `;
  openModal('📚 جلسة المراجعة', html);
}

function revealVerse() {
  const text = document.getElementById('review-text');
  const btn = document.getElementById('reveal-btn');
  const buttons = document.getElementById('review-buttons');
  if (text) text.classList.remove('hidden-verse');
  if (btn) btn.style.display = 'none';
  if (buttons) buttons.classList.remove('hidden');
}

async function answerReview(difficulty) {
  const item = _reviewQueue[_reviewCurrentIdx];
  const result = await MemoModule.review(item.s, item.a, difficulty);
  _reviewSessionStats[difficulty]++;

  const msg = difficulty === 'easy'
    ? '✅ ممتاز! المراجعة القادمة بعد ' + result.nextInDays + ' يوم'
    : difficulty === 'medium'
      ? '👍 جيد! راجع مجدداً بعد ' + result.nextInDays + ' يوم'
      : '💪 لا بأس، أعِد المراجعة بعد ' + result.nextInDays + ' يوم';

  showUpdateToast(msg);
  _reviewCurrentIdx++;
  setTimeout(showReviewCard, 800);
}

function skipReview() {
  _reviewCurrentIdx++;
  showReviewCard();
}

function showSessionComplete() {
  const total = _reviewSessionStats.easy + _reviewSessionStats.medium + _reviewSessionStats.hard;
  const html = `
    <div class="session-complete">
      <div class="session-complete-icon">🎉</div>
      <h3>أحسنت! اكتملت الجلسة</h3>
      <div class="session-stats">
        <div class="session-stat">
          <div class="stat-num easy">${_reviewSessionStats.easy}</div>
          <div class="stat-label">سهل 😎</div>
        </div>
        <div class="session-stat">
          <div class="stat-num medium">${_reviewSessionStats.medium}</div>
          <div class="stat-label">متوسط 🙂</div>
        </div>
        <div class="session-stat">
          <div class="stat-num hard">${_reviewSessionStats.hard}</div>
          <div class="stat-label">صعب 😰</div>
        </div>
      </div>
      <div class="session-total">مراجعة ${total} آية</div>
      <button class="memo-btn-primary" onclick="closeModal()">إغلاق</button>
    </div>
  `;
  openModal('🎉 اكتمل', html);
}

function showAddVerseDialog() {
  const surah = state.data?.surahs?.[state.currentSurah - 1];
  const max = surah?.verses?.length || 1;

  const html = `
    <div class="add-memo-dialog">
      <p>أضف آية من <strong>سورة ${surah?.name || ''}</strong> إلى قائمة الحفظ:</p>
      <label>رقم الآية (1 - ${max}):</label>
      <input type="number" id="add-memo-ayah" min="1" max="${max}" value="1" class="memo-input" />
      <button class="memo-btn-primary" onclick="doAddVerse()">➕ إضافة</button>
    </div>
  `;
  openModal('➕ إضافة للحفظ', html);
}

async function doAddVerse() {
  const a = +document.getElementById('add-memo-ayah').value;
  if (!a || a < 1) return;
  const r = await MemoModule.addVerse(state.currentSurah, a);
  if (r.ok) {
    showUpdateToast('✅ تمت إضافة الآية — راجعها غداً');
    closeModal();
  } else {
    showUpdateToast('⚠ ' + r.msg);
  }
}

async function showMemoStats() {
  const s = await MemoModule.stats();
  const html = `
    <div class="memo-stats-detail">
      <div class="stat-row"><span>📚 إجمالي المحفوظ</span><strong>${s.total} آية</strong></div>
      <div class="stat-row"><span>⏰ للمراجعة اليوم</span><strong>${s.dueToday}</strong></div>
      <div class="stat-row"><span>✅ راجعتها اليوم</span><strong>${s.reviewedToday}</strong></div>
      <div class="stat-row"><span>🎯 مُتقن (مستوى أعلى)</span><strong>${s.mastered}</strong></div>
      <div class="stat-row"><span>📖 قيد التعلم</span><strong>${s.learning}</strong></div>
      <div class="stat-row"><span>🔄 إجمالي المراجعات</span><strong>${s.totalReviews}</strong></div>
      <div class="stat-row"><span>📗 سور متضمنة</span><strong>${s.surahs}</strong></div>
      <div class="stat-row highlight-row"><span>🔥 سلسلة الأيام</span><strong>${s.streak} يوم</strong></div>
    </div>
  `;
  openModal('📊 إحصائيات الحفظ', html);
}

async function showMemorizedList() {
  const data = await MemoModule.getData();
  const items = Object.entries(data)
    .filter(([, v]) => v.memorized)
    .map(([k, v]) => {
      const [s, a] = k.split(':').map(Number);
      return { s, a, ...v };
    })
    .sort((x, y) => x.s - y.s || x.a - y.a);

  if (!items.length) {
    return openModal('📖 قائمة المحفوظات', 'لم تحفظ أي آية بعد. اضغط ➕ لإضافة آية.');
  }

  const html = items.map(it => {
    const surah = state.surahsMeta.find(x => x.n === it.s);
    const levelName = MemoModule.levelNames[it.level] || 'جديد';
    return `
      <div class="memo-list-item" onclick="goToVerse(${it.s}, ${it.a})">
        <div class="memo-item-header">
          <span>${surah?.name || 'سورة'} — آية ${it.a}</span>
          <span class="memo-item-level">${levelName}</span>
        </div>
      </div>
    `;
  }).join('');

  openModal('📖 قائمة المحفوظات', '<div class="memo-list">' + html + '</div>');
}

// ==================== Service Worker ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}
