// ============ إصلاحات وتحسينات (تُحمَّل بعد app.js) ============
// تعيد تعريف دوال من app.js بنسخ مُصلَحة، وتضيف دوال كانت مستدعاة ولا وجود لها.
(function () {
  'use strict';

  // ---------- أدوات ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  window.escapeHtml = escapeHtml;

  function capPlugin(name) {
    return window.Capacitor && Capacitor.Plugins ? Capacitor.Plugins[name] : null;
  }

  // ---------- 1) إشعار عائم (كان مستدعى في 20+ موضعاً ولا يوجد تعريف له) ----------
  let toastTimer = null;
  window.showUpdateToast = function (msg) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText =
        'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:90%;' +
        'background:#0a3d2c;color:#fff;padding:.6rem 1.1rem;border-radius:20px;' +
        'font-family:inherit;font-size:.9rem;text-align:center;z-index:10001;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;' +
        'opacity:0;transition:opacity .25s ease;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 3200);
  };

  // ---------- 2) الثيم المحفوظ + إعلام المُحدِّث بجاهزية التطبيق ----------
  function waitForApp(timeoutMs) {
    return new Promise(function (resolve) {
      const start = Date.now();
      (function check() {
        const app = document.getElementById('app');
        if (app && !app.classList.contains('hidden')) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    try {
      const t = await DB.getUserData('theme');
      if ((t === 'dark' || t === 'light' || t === 'sepia') && typeof state !== 'undefined') {
        state.theme = t;
        applyTheme();
      }
    } catch (e) {}

    // بدون هذا الاستدعاء يتراجع المُحدِّث عن أي تحديث OTA بعد انتهاء المهلة.
    // لا نستدعيه إلا بعد أن يظهر التطبيق فعلاً (أي نجحت التهيئة).
    const ready = await waitForApp(25000);
    const updater = capPlugin('CapacitorUpdater');
    if (ready && updater && typeof updater.notifyAppReady === 'function') {
      try { await updater.notifyAppReady(); } catch (e) { console.warn('notifyAppReady:', e && e.message); }
    }
  });

  // ---------- 3) زر الرجوع في أندرويد ----------
  document.addEventListener('DOMContentLoaded', function () {
    const App = capPlugin('App');
    if (!App || typeof App.addListener !== 'function') return;
    App.addListener('backButton', function () {
      const modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('hidden')) return closeModal();
      const sb = document.getElementById('sidebar');
      if (sb && sb.classList.contains('open')) return toggleSidebar(false);
      if (typeof App.exitApp === 'function') App.exitApp();
    });
  });

  // ---------- 4) الصوت ----------
  function setPlayButton(text) {
    const b = document.getElementById('play-btn');
    if (b) b.textContent = text;
  }

  async function startPlayback(surahNum) {
    if (!window.QuranAudio) return;

    // نفس السورة تعمل الآن → إيقاف مؤقت
    if (audioState.isPlaying && audioState.currentSurah === surahNum) {
      QuranAudio.pause();
      audioState.isPlaying = false;
      setPlayButton('▶ تشغيل');
      return;
    }

    state.currentSurah = surahNum;
    setPlayButton(QuranAudio.isCurrent(state.reader, surahNum) ? '⏸ إيقاف' : '⏳ جاري التحميل...');
    try {
      await QuranAudio.play(state.reader, surahNum);
      audioState.isPlaying = true;
      audioState.currentSurah = surahNum;
      setPlayButton('⏸ إيقاف');
    } catch (e) {
      audioState.isPlaying = false;
      setPlayButton('▶ تشغيل');
      showUpdateToast('❌ ' + (e && e.message ? e.message : 'تعذّر التشغيل'));
    }
  }

  window.togglePlay = function () { return startPlayback(state.currentSurah); };
  window.playSurahFromVerse = function (surahNum) { return startPlayback(surahNum); };

  // مزامنة الزر مع حالة المشغّل الفعلية (مثلاً من أزرار الإشعار/شاشة القفل)
  window.addEventListener('audio-state', function (e) {
    const playing = !!(e.detail && e.detail.playing);
    audioState.isPlaying = playing;
    if (playing) audioState.currentSurah = QuranAudio.currentSurah;
    setPlayButton(playing && audioState.currentSurah === state.currentSurah ? '⏸ إيقاف' : '▶ تشغيل');
  });

  // ---------- 5) أزرار الآية: «للحفظ» + تسمية صحيحة لزر التشغيل ----------
  function decorateVerses() {
    document.querySelectorAll('#verses-container .verse-inline-actions').forEach(function (bar) {
      const play = bar.querySelector('button[data-act="play"]');
      if (play) play.textContent = '🎧 تشغيل السورة';
      if (!bar.querySelector('button[data-act="memo"]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.act = 'memo';
        btn.textContent = '📚 للحفظ';
        bar.insertBefore(btn, bar.querySelector('button[data-act="close"]'));
      }
    });
  }

  if (typeof window.renderSurah === 'function') {
    const originalRenderSurah = window.renderSurah;
    window.renderSurah = function (num) {
      originalRenderSurah(num);
      decorateVerses();
      setPlayButton(audioState.isPlaying && audioState.currentSurah === num ? '⏸ إيقاف' : '▶ تشغيل');
    };
  }

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest && e.target.closest('.verse-inline-actions button[data-act="memo"]');
    if (!btn) return;
    e.stopPropagation();
    const verse = btn.closest('.verse');
    if (!verse || !window.MemoModule) return;
    try {
      const r = await MemoModule.addVerse(+verse.dataset.surah, +verse.dataset.ayah);
      showUpdateToast(r.ok ? '✅ أُضيفت الآية لقائمة الحفظ — راجعها غداً' : '⚠ ' + r.msg);
    } catch (err) {
      showUpdateToast('❌ تعذّرت الإضافة');
    }
  }, true);

  // ---------- 6) الملاحظات والعلامات ----------
  window.openVerseNoteInline = function (s, a, verseEl) {
    const id = s + ':' + a;
    const note = prompt('ملاحظتك على الآية:', state.notes[id] || '');
    if (note === null) return;
    const content = verseEl.querySelector('.verse-inline-content');
    const clean = note.trim();
    if (clean) {
      state.notes[id] = clean;
      if (content) {
        content.dataset.mode = 'note';
        content.innerHTML = '<div class="inline-note"><strong>📝 ملاحظتك:</strong><br>' +
          escapeHtml(clean).replace(/\n/g, '<br>') + '</div>';
      }
    } else {
      delete state.notes[id];
      if (content) { content.innerHTML = ''; content.dataset.mode = ''; }
    }
    DB.saveUserData('notes', state.notes);
  };

  window.openNote = function () {
    const key = 'surah:' + state.currentSurah;
    const note = prompt('ملاحظتك على السورة:', state.notes[key] || '');
    if (note === null) return;
    const clean = note.trim();
    if (clean) state.notes[key] = clean; else delete state.notes[key];
    DB.saveUserData('notes', state.notes);
    showUpdateToast('📝 تم الحفظ');
  };

  const ITEM_STYLE = 'display:block;width:100%;text-align:right;padding:.5rem;margin:.25rem 0;' +
    'background:var(--verse-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;' +
    'font-family:inherit;color:inherit';

  function surahName(n) {
    const m = state.surahsMeta.find(function (x) { return x.n === n; });
    return (m && m.name) || ('سورة ' + n);
  }

  window.showBookmarks = function () {
    const bookmarks = state.bookmarks.slice();
    const notes = Object.entries(state.notes).filter(function (e) { return e[1]; });

    if (!bookmarks.length && !notes.length) {
      return openModal('العلامات والملاحظات', 'لا توجد علامات أو ملاحظات بعد.');
    }

    let html = '';
    if (bookmarks.length) {
      html += '<h4 style="margin:.5rem 0">🔖 العلامات</h4>';
      bookmarks.forEach(function (id) {
        const p = id.split(':');
        html += '<div style="display:flex;gap:.25rem">' +
          '<button data-go="' + escapeHtml(id) + '" style="' + ITEM_STYLE + ';flex:1">' +
          escapeHtml(surahName(+p[0])) + ' — آية ' + escapeHtml(p[1]) + '</button>' +
          '<button data-rm-bm="' + escapeHtml(id) + '" style="' + ITEM_STYLE + ';width:auto" aria-label="حذف">✕</button></div>';
      });
    }
    if (notes.length) {
      html += '<h4 style="margin:1rem 0 .5rem">📝 الملاحظات</h4>';
      notes.forEach(function (entry) {
        const key = entry[0], text = entry[1];
        const p = key.split(':');
        const isSurahNote = p[0] === 'surah';
        const s = isSurahNote ? +p[1] : +p[0];
        const a = isSurahNote ? 1 : +p[1];
        const label = isSurahNote ? 'ملاحظة على سورة ' + surahName(s) : surahName(s) + ' — آية ' + a;
        html += '<div style="display:flex;gap:.25rem">' +
          '<button data-go="' + s + ':' + a + '" style="' + ITEM_STYLE + ';flex:1">' +
          '<strong>' + escapeHtml(label) + '</strong><br>' +
          '<span style="white-space:pre-wrap;opacity:.85">' + escapeHtml(text) + '</span></button>' +
          '<button data-rm-note="' + escapeHtml(key) + '" style="' + ITEM_STYLE + ';width:auto" aria-label="حذف">✕</button></div>';
      });
    }

    openModal('العلامات والملاحظات', html);

    const body = document.getElementById('modal-body');
    body.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () { const p = b.dataset.go.split(':'); goToVerse(+p[0], +p[1]); };
    });
    body.querySelectorAll('[data-rm-bm]').forEach(function (b) {
      b.onclick = function () {
        state.bookmarks = state.bookmarks.filter(function (x) { return x !== b.dataset.rmBm; });
        DB.saveUserData('bookmarks', state.bookmarks);
        window.showBookmarks();
      };
    });
    body.querySelectorAll('[data-rm-note]').forEach(function (b) {
      b.onclick = function () {
        delete state.notes[b.dataset.rmNote];
        DB.saveUserData('notes', state.notes);
        window.showBookmarks();
      };
    });
  };

  // ---------- 7) الإعدادات: عدّاد المحفوظ الصحيح + زر إيقاف تحميل الصوت ----------
  if (typeof window.openSettingsNew === 'function') {
    const originalSettings = window.openSettingsNew;
    window.openSettingsNew = function () {
      originalSettings();
      const body = document.getElementById('modal-body');
      if (!body) return;

      const actions = body.querySelector('.audio-download-actions');
      if (actions && !actions.querySelector('[data-cancel-dl]')) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'audio-dl-btn-danger';
        cancel.dataset.cancelDl = '1';
        cancel.textContent = '⏹ إيقاف التحميل';
        cancel.onclick = function () {
          if (window.AudioDownloader && AudioDownloader.isDownloading()) {
            AudioDownloader.cancel();
            showUpdateToast('⏹ سيتوقف التحميل بعد السورة الحالية');
          } else {
            showUpdateToast('لا يوجد تحميل جارٍ');
          }
        };
        actions.appendChild(cancel);
      }

      if (window.MemoModule) {
        MemoModule.stats().then(function (s) {
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            if (/آيات محفوظة:\s*\d+/.test(n.nodeValue)) {
              n.nodeValue = n.nodeValue.replace(/(آيات محفوظة:\s*)\d+/, '$1' + s.total);
              break;
            }
          }
        }).catch(function () {});
      }
    };
  }

  // ---------- 8) جلسة المراجعة: لا تتعطل إذا لم يُرجع الحفظ نتيجة ----------
  window.answerReview = async function (difficulty) {
    const item = _reviewQueue[_reviewCurrentIdx];
    if (!item) return closeModal();

    let result = null;
    try { result = await MemoModule.review(item.s, item.a, difficulty); } catch (e) { console.warn(e); }
    _reviewSessionStats[difficulty]++;

    if (result) {
      showUpdateToast(
        difficulty === 'easy' ? '✅ ممتاز! المراجعة القادمة بعد ' + result.nextInDays + ' يوم'
        : difficulty === 'medium' ? '👍 جيد! راجع مجدداً بعد ' + result.nextInDays + ' يوم'
        : '💪 لا بأس، أعِد المراجعة بعد ' + result.nextInDays + ' يوم'
      );
    }
    _reviewCurrentIdx++;
    setTimeout(showReviewCard, 800);
  };

  // ---------- 9) فحص التحديثات: مقارنة إصدارات صحيحة ----------
  function cmpVersion(a, b) {
    const pa = String(a).split(/[.\-]/).map(function (x) { return parseInt(x, 10) || 0; });
    const pb = String(b).split(/[.\-]/).map(function (x) { return parseInt(x, 10) || 0; });
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  window.checkForUpdates = async function () {
    const updater = capPlugin('CapacitorUpdater');
    if (!updater) return;
    const notifications = capPlugin('LocalNotifications');

    try {
      const res = await fetch(
        'https://github.com/abdo15542/libya-quran-app/releases/latest/download/update.json?_=' + Date.now(),
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const remote = await res.json();

      const current = await updater.current();
      let currentVersion = current && current.bundle && current.bundle.version;
      if (!currentVersion || currentVersion === 'builtin') currentVersion = window.APP_VERSION || '0.0.0';

      if (!remote.version || cmpVersion(remote.version, currentVersion) <= 0) {
        console.log('✓ أنت على أحدث إصدار (' + currentVersion + ')');
        return;
      }

      _updateInfo = remote;

      if (notifications) {
        try {
          await notifications.schedule({
            notifications: [{
              id: 1001,
              title: '🕌 مصحف ليبيا — تحديث جديد',
              body: 'اضغط لتحميل وتثبيت التحديث الآن',
              channelId: 'updates',
              extra: { type: 'update' },
            }],
          });
        } catch (e) { console.warn('إشعار التحديث:', e && e.message); }
      }
      showUpdateBanner(remote.version);
    } catch (e) {
      console.warn('فحص التحديثات:', e && e.message);
    }
  };
})();
