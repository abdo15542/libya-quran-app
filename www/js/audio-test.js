// ============ أداة اختبار الروابط الصوتية (بطريقة Base64) ============

async function testAllReaders() {
  const lines = ['🔄 جاري الاختبار (طريقة Base64)...'];
  updateTestUI(lines);

  const results = [];
  const testSurah = 1;

  for (const [key, reader] of Object.entries(READERS)) {
    const padded = String(testSurah).padStart(3, '0');
    const url = reader.pattern.replace('{s}', padded);

    results.push('⏳ ' + reader.name + '...');
    updateTestUI(results);

    const result = await testAudioUrl(url);
    const status = result.ok 
      ? '✅ ' + reader.name + ' (' + result.info + ')'
      : '❌ ' + reader.name + ' — ' + result.error;
    
    results[results.length - 1] = status;
    updateTestUI(results);
  }

  results.push('');
  results.push('✅ اختبار مكتمل');
  updateTestUI(results);
}

function testAudioUrl(url) {
  return new Promise(async (resolve) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      
      const audio = new Audio();
      const blobUrl = URL.createObjectURL(blob);
      
      await new Promise((res2, rej2) => {
        audio.onloadedmetadata = () => res2();
        audio.onerror = () => rej2(new Error('فشل تحميل الصوت'));
        audio.src = blobUrl;
        setTimeout(() => rej2(new Error('مهلة')), 10000);
      });
      
      URL.revokeObjectURL(blobUrl);
      const time = Date.now() - t0;
      resolve({ ok: true, info: audio.duration.toFixed(1) + 's — ' + time + 'ms' });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function updateTestUI(lines) {
  const box = document.getElementById('audio-test-results');
  if (!box) return;
  box.innerHTML = lines.map(l => '<div class="test-line">' + l + '</div>').join('');
}

window.testAllReaders = testAllReaders;
