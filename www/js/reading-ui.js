// ============ تحسينات واجهة القراءة ============
// لوحة «Aa» (حجم الخط، تباعد الأسطر، المظهر، نمط العرض، التركيز)،
// إخفاء شريط الأدوات عند التمرير، وتمييز السورة الحالية في القائمة الجانبية.
(function () {
  'use strict';

  var DEFAULT_LINE_HEIGHT = 2.4;

  function readerEl() { return document.getElementById('reader'); }

  function applyLineHeight(v) {
    document.documentElement.style.setProperty('--line-height', String(v));
  }

  function applyReadingMode(mode) {
    var r = readerEl();
    if (r) r.classList.toggle('reading-flow', mode === 'flow');
  }

  function currentLineHeight() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height'));
    return isNaN(v) ? DEFAULT_LINE_HEIGHT : v;
  }

  // ---------- لوحة الخيارات ----------
  function closePanel() {
    var p = document.getElementById('reading-panel');
    if (p) p.remove();
  }

  function togglePanel() {
    if (document.getElementById('reading-panel')) return closePanel();

    var fontSize = (typeof state !== 'undefined' && state.fontSize) || 1.6;
    var theme = (typeof state !== 'undefined' && state.theme) || 'light';
    var mode = readerEl() && readerEl().classList.contains('reading-flow') ? 'flow' : 'cards';
    var focus = typeof state !== 'undefined' && state.viewMode === 'focus';

    var p = document.createElement('div');
    p.id = 'reading-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'خيارات القراءة');
    p.innerHTML =
      '<div class="rp-row"><label for="rp-font">حجم الخط</label>' +
      '<input type="range" id="rp-font" min="1.2" max="2.6" step="0.1" value="' + fontSize + '"></div>' +

      '<div class="rp-row"><label for="rp-lh">تباعد الأسطر</label>' +
      '<input type="range" id="rp-lh" min="1.8" max="3.2" step="0.1" value="' + currentLineHeight() + '"></div>' +

      '<div class="rp-row"><label>المظهر</label><div class="rp-seg" data-group="theme">' +
      '<button type="button" data-v="light">فاتح</button>' +
      '<button type="button" data-v="sepia">ورقي</button>' +
      '<button type="button" data-v="dark">داكن</button></div></div>' +

      '<div class="rp-row"><label>نمط العرض</label><div class="rp-seg" data-group="mode">' +
      '<button type="button" data-v="cards">بطاقات</button>' +
      '<button type="button" data-v="flow">مصحف متصل</button></div></div>' +

      '<div class="rp-row rp-check"><input type="checkbox" id="rp-focus"' + (focus ? ' checked' : '') + '>' +
      '<label for="rp-focus">وضع التركيز (تخفيف باقي الآيات)</label></div>';
    document.body.appendChild(p);

    function mark() {
      p.querySelectorAll('.rp-seg').forEach(function (seg) {
        var current = seg.dataset.group === 'theme' ? theme : mode;
        seg.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b.dataset.v === current);
        });
      });
    }
    mark();

    p.querySelector('#rp-font').oninput = function () {
      if (typeof setFontSize === 'function') setFontSize(this.value);
    };

    p.querySelector('#rp-lh').oninput = function () {
      var v = parseFloat(this.value);
      applyLineHeight(v);
      try { DB.saveUserData('lineHeight', v); } catch (e) {}
    };

    p.querySelectorAll('.rp-seg button').forEach(function (b) {
      b.onclick = function () {
        var group = b.parentElement.dataset.group;
        if (group === 'theme') {
          theme = b.dataset.v;
          state.theme = theme;
          applyTheme();
          try { DB.saveUserData('theme', theme); } catch (e) {}
        } else {
          mode = b.dataset.v;
          applyReadingMode(mode);
          try { DB.saveUserData('readingMode', mode); } catch (e) {}
        }
        mark();
      };
    });

    p.querySelector('#rp-focus').onchange = function () {
      if (typeof setViewMode === 'function') setViewMode(this.checked ? 'focus' : 'normal');
    };
  }

  function injectButton() {
    var bar = document.querySelector('.topbar-actions');
    if (!bar || document.getElementById('aa-btn')) return;
    var b = document.createElement('button');
    b.id = 'aa-btn';
    b.type = 'button';
    b.className = 'icon-btn';
    b.title = 'خيارات القراءة';
    b.setAttribute('aria-label', 'خيارات القراءة');
    b.textContent = 'Aa';
    b.style.fontSize = '1.05rem';
    b.style.fontWeight = 'bold';
    b.onclick = function (e) { e.stopPropagation(); togglePanel(); };
    bar.insertBefore(b, bar.firstChild);
  }

  // إغلاق اللوحة عند النقر خارجها
  document.addEventListener('click', function (e) {
    var p = document.getElementById('reading-panel');
    if (!p) return;
    if (p.contains(e.target) || (e.target.closest && e.target.closest('#aa-btn'))) return;
    closePanel();
  });

  // ---------- إخفاء شريط الأدوات عند التمرير للأسفل ----------
  function setupToolbarAutoHide() {
    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      if (y > 140 && dy > 0) document.body.classList.add('toolbar-hidden');
      else if (dy < 0 || y <= 60) document.body.classList.remove('toolbar-hidden');
      lastY = y;
    }, { passive: true });
  }

  // ---------- تمييز السورة الحالية في القائمة الجانبية ----------
  function markCurrentSurah() {
    if (typeof state === 'undefined') return;
    document.querySelectorAll('#surah-list li').forEach(function (li) {
      var numEl = li.lastElementChild;
      var n = numEl ? parseInt(numEl.textContent, 10) : NaN;
      li.classList.toggle('current', n === state.currentSurah);
    });
  }

  if (typeof window.renderSurah === 'function') {
    var origRenderSurah = window.renderSurah;
    window.renderSurah = function (num) {
      origRenderSurah(num);
      markCurrentSurah();
      document.body.classList.remove('toolbar-hidden');
    };
  }

  if (typeof window.renderSurahList === 'function') {
    var origRenderList = window.renderSurahList;
    window.renderSurahList = function (filter) {
      origRenderList(filter);
      markCurrentSurah();
    };
  }

  if (typeof window.toggleSidebar === 'function') {
    var origToggleSidebar = window.toggleSidebar;
    window.toggleSidebar = function (open) {
      origToggleSidebar(open);
      var sb = document.getElementById('sidebar');
      if (sb && sb.classList.contains('open')) {
        setTimeout(function () {
          var cur = sb.querySelector('li.current');
          if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
        }, 60);
      }
    };
  }

  // ---------- استعادة التفضيلات المحفوظة ----------
  document.addEventListener('DOMContentLoaded', async function () {
    try {
      var lh = await DB.getUserData('lineHeight');
      if (lh) applyLineHeight(lh);
      applyReadingMode(await DB.getUserData('readingMode'));
    } catch (e) { /* القيم الافتراضية */ }
    injectButton();
    setupToolbarAutoHide();
  });
})();
