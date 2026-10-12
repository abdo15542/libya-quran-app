// ============ إدارة قاعدة البيانات المحلية IndexedDB ============
const DB_NAME = 'LibyaQuranDB';
const DB_VERSION = 2;  // ← زيادة الإصدار لإضافة stores جديدة

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // إنشاء كل الـ stores المطلوبة (النسخة 2)
      const stores = [
        'quran',        // نص المصحف
        'tafsir',       // التفاسير (الجديد - بالياء)
        'tafseer',      // للتوافق مع النسخ القديمة
        'translations', // الترجمات
        'user_data',    // بيانات المستخدم (علامات، ملاحظات، إعدادات)
        'audio_cache',  // الصوتيات
      ];

      stores.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      });
    };

    req.onsuccess = () => {
      console.log('✓ IndexedDB جاهز (v' + DB_VERSION + ')');
      resolve(req.result);
    };

    req.onerror = () => {
      console.error('✗ IndexedDB error:', req.error);
      reject(req.error);
    };
  });

  return dbPromise;
}

async function dbGet(store, key) {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) {
      console.warn('Store غير موجود:', store);
      return null;
    }
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) {
    console.warn('dbGet error:', e.message);
    return null;
  }
}

async function dbPut(store, key, value) {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) {
      console.warn('Store غير موجود:', store);
      return null;
    }
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value, key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) {
    console.warn('dbPut error:', e.message);
    return null;
  }
}

async function dbDelete(store, key) {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) return;
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  } catch (e) {
    console.warn('dbDelete error:', e.message);
  }
}

// حفظ/استرجاع بيانات المستخدم
async function saveUserData(key, value) {
  return dbPut('user_data', key, value);
}
async function getUserData(key) {
  return dbGet('user_data', key);
}

// إعادة تعيين قاعدة البيانات (في حال الحاجة)
async function resetDB() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { console.log('✓ تم حذف DB'); resolve(true); };
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}

window.DB = { openDB, dbGet, dbPut, dbDelete, saveUserData, getUserData, resetDB };
