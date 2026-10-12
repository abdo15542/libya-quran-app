let state = {
  data: null,
  currentSurah: 1,
  theme: 'light',
  bookmarks: [],
  notes: {},
  progress: {},
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = prefersDark ? 'dark' : 'light';
  applyTheme();

  const lastSurah = await DB.getUserData('last_surah');
  if (lastSurah) state.currentSurah = lastSurah;

  try {
    const progressFill = document.getElementById('progress-fill');
    const status = document.getElementById('loading-status');
    status.textContent = 'جاري تحميل المصحف...';

    state.data = await DataLoader.ensureData((p) => {
      progressFill.style.width = Math.round(p * 100) + '%';
    });

    status.textContent = 'جاهز!';
    progressFill.style.width = '100%';
    setTimeout(showApp, 400);
  } catch (e) {
    document.getElementById('loading-status').textContent = 'خطأ: ' + e.message;
  }
}

function showApp() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderSurahList();
  renderSurah(state.currentSurah);
  setupEvents();
}

function setupEvents() {
  document.getElementById('menu-btn').onclick = () => toggleSidebar(true);
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('prev-btn').onclick = () => navSurah(-1);
  document.getElementById('next-btn').onclick = () => navSurah(1);
  document.getElementById('play-btn').onclick = togglePlay;

  document.querySelectorAll('#toolbar button').forEach(btn => {
    btn.onclick = () => handleToolbar(btn.dataset.action);
  });
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal').onclick = (e) => {
    if (e.target.id === 'modal') closeModal();
  };
  document.addEventListener('click', (e) => {
    const sb = document.getElementById('sidebar');
    if (sb.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'menu-btn') {
      toggleSidebar(false);
    }
  });
}

function renderSurahList() {
  const ul = document.getElementById('surah-list');
  ul.innerHTML = '';
  const surahs = state.data.surahs || [];
  surahs.forEach((s, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${s.name || 'سورة ' + (idx + 1)}</span><span>${idx + 1}</span>`;
    li.onclick = () => {
      state.currentSurah = idx + 1;
      renderSurah(state.currentSurah);
      toggleSidebar(false);
    };
    ul.appendChild(li);
  });
}

function renderSurah(num) {
  const surahs = state.data.surahs || [];
  const surah = surahs[num - 1];
  if (!surah) return;

  document.getElementById('surah-title').textContent = 'سورة ' + (surah.name || '');
  document.getElementById('page-info').textContent = 'سورة رقم ' + num + ' من ' + surahs.length;

  const container = document.getElementById('verses-container');
  container.innerHTML = '';
  (surah.verses || []).forEach(v => {
    const div = document.createElement('div');
    div.className = 'verse';
    div.dataset.ayah = v.number;
    const words = (v.text || '').split(/\s+/)
      .map(w => `<span class="w">${w}</span>`).join(' ');
    div.innerHTML = `<span class="verse-number">${v.number}</span><span class="verse-text">${words}</span>`;
    container.appendChild(div);
  });
  DB.saveUserData('last_surah', num);
}

function navSurah(delta) {
  const total = (state.data.surahs || []).length;
  let next = state.currentSurah + delta;
  if (next < 1) next = total;
  if (next > total) next = 1;
  state.currentSurah = next;
  renderSurah(next);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSidebar(open) {
  const sb = document.getElementById('sidebar');
  if (open === undefined) sb.classList.toggle('open');
  else sb.classList.toggle('open', open);
}

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

let isPlaying = false;
function togglePlay() {
  const btn = document.getElementById('play-btn');
  if (isPlaying) {
    Audio.pause();
    btn.textContent = '▶ تشغيل';
    isPlaying = false;
  } else {
    const url = `https://server8.mp3quran.net/frgany/${String(state.currentSurah).padStart(3, '0')}.mp3`;
    Audio.setRepeat(1);
    Audio.play(url);
    btn.textContent = '⏸ إيقاف';
    isPlaying = true;
  }
}

function handleToolbar(action) {
  if (action === 'tafseer') openTafseer();
  else if (action === 'bookmark') toggleBookmark();
  else if (action === 'note') openNote();
  else if (action === 'translate') openModal('الترجمة', 'ميزة الترجمة قادمة قريباً');
}

function openTafseer() {
  openModal('التفسير', 'سيتم دمج التفاسير الكاملة قريباً.');
}

function toggleBookmark() {
  const key = state.currentSurah;
  const idx = state.bookmarks.indexOf(key);
  if (idx >= 0) state.bookmarks.splice(idx, 1);
  else state.bookmarks.push(key);
  DB.saveUserData('bookmarks', state.bookmarks);
  openModal('العلامات', state.bookmarks.length ? 'علاماتك: ' + state.bookmarks.join(', ') : 'لا توجد علامات');
}

function openNote() {
  const note = prompt('ملاحظتك على السورة الحالية:');
  if (note) {
    state.notes[state.currentSurah] = note;
    DB.saveUserData('notes', state.notes);
  }
}

function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}
