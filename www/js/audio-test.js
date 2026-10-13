// ============ أداة اختبار الروابط الصوتية ============

async function testAllReaders() {
  const lines = [];
  const testSurah = 1; // سورة الفاتحة

  for (const [key, reader] of Object.entries(READERS)) {
    const padded = String(testSurah).padStart(3, '0');
    const url = reader.pattern.replace('{s}', padded);

    lines.push('⏳ اختبار: ' + reader.name + '...');
    updateTestUI(lines);

    const result = await testAudioUrl(url);
    const status = result.ok 
      ? '✅ ' + reader.name + ' (' + result.status + '، ' + result.size + ')'
      : '❌ ' + reader.name + ' — ' + result.error;
    
    lines[lines.length - 1] = status;
    updateTestUI(lines);
  }

  lines.push('');
  lines.push('🎧 انقر على أي رابط ✅ لاختباره مباشرة');
  updateTestUI(lines);
}

async function testAudioUrl(url) {
  return new Promise(async (resolve) => {
    const t0 = Date.now();
    try {
      // الطريقة 1: HEAD request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok || res.status === 206) {
        const size = res.headers.get('content-length');
        const time = Date.now() - t0;
        const sizeStr = size ? (size / 1024 / 1024).toFixed(1) + ' MB' : '?';
        resolve({ ok: true, status: res.status, size: sizeStr + ' — ' + time + 'ms' });
      } else {
        resolve({ ok: false, error: 'HTTP ' + res.status });
      }
    } catch (e) {
      // الطريقة 2: HTML5 Audio اختبار
      try {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = url;

        await new Promise((res2, rej2) => {
          audio.onloadedmetadata = () => res2();
          audio.onerror = () => rej2(new Error('فشل تحميل الصوت'));
          setTimeout(() => rej2(new Error('مهلة')), 8000);
        });
        resolve({ ok: true, status: 'metadata', size: audio.duration.toFixed(1) + 's' });
      } catch (e2) {
        resolve({ ok: false, error: e.message + ' / ' + e2.message });
      }
    }
  });
}

function updateTestUI(lines) {
  const box = document.getElementById('audio-test-results');
  if (!box) return;
  box.innerHTML = lines.map(l => '<div class="test-line">' + l + '</div>').join('');
}

async function playTestUrl(url) {
  try {
    showUpdateToast('🎧 جاري التشغيل...');
    await Audio.play(url);
    showUpdateToast('✅ يعمل!');
  } catch (e) {
    showUpdateToast('❌ ' + e.message);
  }
}

window.testAllReaders = testAllReaders;
window.playTestUrl = playTestUrl;
