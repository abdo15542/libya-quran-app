package com.libya.quran;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * مخزن التلاوة القابلة للتنزيل (منذ 1.4.0):
 * التطبيق صغير الحجم، والتلاوة تُنزَّل بعد التثبيت إلى ذاكرة التطبيق
 * الداخلية وتعمل بعدها دون إنترنت.
 * - 5 تنزيلات متزامنة لسرعة قصوى.
 * - كل ملف يُكتب إلى «.part» ويُستأنف بطلبات Range عند الإيقاف أو
 *   إغلاق التطبيق أو انقطاع الاتصال — لا يضيع أي بايت منجز.
 * - الحقيقة من القرص: ملف مكتمل الحجم المتوقع = منزّل، وغير ذلك جزئي.
 * - أحداث progress/fileDone/allDone/storeError تصل إلى الواجهة.
 */
@CapacitorPlugin(name = "AudioStore")
public class AudioStorePlugin extends Plugin {

    private static final int WORKERS = 5;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();
    private final Map<Integer, Long> expected = new TreeMap<>();
    private final Map<Integer, String> status = new HashMap<>();
    private final LinkedList<Integer> queue = new LinkedList<>();
    private final Set<Integer> active = new HashSet<>();
    private String baseUrl = "";
    private volatile boolean running = false;
    private volatile boolean configured = false;
    private Thread[] workers;
    private Thread progressThread;
    private String lastError = "";

    private File dir() {
        File d = new File(getContext().getFilesDir(), "audio");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private String name(int n) {
        return String.format("%03d.mp3", n);
    }

    private File finalFile(int n) { return new File(dir(), name(n)); }
    private File partFile(int n) { return new File(dir(), name(n) + ".part"); }

    private String describe(Throwable t) {
        String m = t.getMessage();
        return t.getClass().getSimpleName() + (m != null ? ": " + m : "");
    }

    /** الحالة من القرص: مكتمل الحجم = done، و.part موجود = partial. */
    private String diskStatus(int n) {
        Long exp = expected.get(n);
        File f = finalFile(n);
        if (exp != null && f.exists() && f.length() == exp) return "done";
        if (partFile(n).exists() && partFile(n).length() > 0) return "partial";
        return "pending";
    }

    private String statusOf(int n) {
        synchronized (lock) {
            String s = status.get(n);
            if ("downloading".equals(s) || "queued".equals(s) || "error".equals(s)) return s;
        }
        return diskStatus(n);
    }

    private long bytesOf(int n) {
        if ("done".equals(diskStatus(n))) return expected.get(n);
        File p = partFile(n);
        return p.exists() ? p.length() : 0;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String url = call.getString("baseUrl");
        JSObject sizes = call.getObject("sizes");
        if (url == null || sizes == null) {
            call.reject("بيانات التهيئة ناقصة");
            return;
        }
        synchronized (lock) {
            baseUrl = url;
            expected.clear();
            java.util.Iterator<String> kit = sizes.keys();
            while (kit.hasNext()) {
                String k = kit.next();
                try {
                    expected.put(Integer.parseInt(k), sizes.getLong(k));
                } catch (Exception ignored) {}
            }
            // مصالحة الحالة مع القرص
            for (Integer n : expected.keySet()) {
                String ds = diskStatus(n);
                if ("done".equals(ds)) status.put(n, "done");
                else if (!status.containsKey(n) || "done".equals(status.get(n))) status.put(n, ds);
            }
            configured = true;
        }
        call.resolve(snapshot());
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(snapshot());
    }

    private JSObject snapshot() {
        JSObject ret = new JSObject();
        JSObject files = new JSObject();
        int doneCount = 0;
        long doneBytes = 0, totalBytes = 0;
        synchronized (lock) {
            for (Map.Entry<Integer, Long> e : expected.entrySet()) {
                int n = e.getKey();
                long total = e.getValue();
                totalBytes += total;
                String st = statusOf(n);
                long have = "done".equals(st) ? total : bytesOf(n);
                if ("done".equals(st)) { doneCount++; doneBytes += total; }
                else doneBytes += 0; // الجزئي يُحسب في التقدم العام أدناه
                JSObject f = new JSObject();
                f.put("status", st);
                f.put("bytes", have);
                f.put("total", total);
                files.put(String.valueOf(n), f);
            }
        }
        // التقدم العام بالبايت يشمل الجزئيات
        long partialBytes = 0;
        synchronized (lock) {
            for (Integer n : expected.keySet()) {
                if (!"done".equals(statusOf(n))) partialBytes += bytesOf(n);
            }
        }
        ret.put("files", files);
        ret.put("doneCount", doneCount);
        ret.put("doneBytes", doneBytes + partialBytes);
        ret.put("totalBytes", totalBytes);
        ret.put("running", running);
        ret.put("dir", dir().getAbsolutePath());
        ret.put("lastError", lastError);
        return ret;
    }

    @PluginMethod
    public void localPath(PluginCall call) {
        Integer n = call.getInt("surah");
        if (n == null) { call.reject("رقم السورة مفقود"); return; }
        JSObject ret = new JSObject();
        boolean done = "done".equals(diskStatus(n));
        ret.put("path", done ? finalFile(n).getAbsolutePath() : "");
        ret.put("done", done);
        call.resolve(ret);
    }

    @PluginMethod
    public void netType(PluginCall call) {
        JSObject ret = new JSObject();
        String type = "none";
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network net = cm.getActiveNetwork();
                NetworkCapabilities caps = net != null ? cm.getNetworkCapabilities(net) : null;
                if (caps != null) {
                    if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "wifi";
                    else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) type = "mobile";
                    else type = "other";
                }
            }
        } catch (Exception ignored) {}
        ret.put("type", type);
        call.resolve(ret);
    }

    @PluginMethod
    public void startAll(PluginCall call) {
        synchronized (lock) {
            for (Integer n : expected.keySet()) {
                String st = statusOf(n);
                if (!"done".equals(st) && !"downloading".equals(st) && !"queued".equals(st)) {
                    status.put(n, "queued");
                    if (!queue.contains(n)) queue.add(n);
                }
            }
            running = true;
            ensureWorkers();
            lock.notifyAll();
        }
        call.resolve(snapshot());
    }

    @PluginMethod
    public void pauseAll(PluginCall call) {
        synchronized (lock) {
            running = false;
            for (Integer n : new ArrayList<>(queue)) status.put(n, diskStatus(n));
            queue.clear();
            lock.notifyAll();
        }
        emitProgress();
        call.resolve(snapshot());
    }

    @PluginMethod
    public void downloadSurah(PluginCall call) {
        Integer n = call.getInt("surah");
        if (n == null) { call.reject("رقم السورة مفقود"); return; }
        synchronized (lock) {
            if ("done".equals(statusOf(n))) {
                JSObject ret = new JSObject();
                ret.put("path", finalFile(n).getAbsolutePath());
                ret.put("done", true);
                call.resolve(ret);
                return;
            }
            // أولوية قصوى: في مقدمة الطابور، والمحرك يعمل ولو كان متوقفًا
            queue.remove(n);
            queue.addFirst(n);
            status.put(n, "queued");
            running = true;
            ensureWorkers();
            lock.notifyAll();
        }
        JSObject ret = new JSObject();
        ret.put("queued", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteAll(PluginCall call) {
        synchronized (lock) {
            running = false;
            queue.clear();
            lock.notifyAll();
        }
        // انتظر خروج العمال لحظيًا ثم امسح
        main.postDelayed(() -> {
            File[] fs = dir().listFiles();
            if (fs != null) for (File f : fs) f.delete();
            synchronized (lock) {
                for (Integer n : expected.keySet()) status.put(n, "pending");
                active.clear();
            }
            emitProgress();
            call.resolve(snapshot());
        }, 600);
    }

    private void ensureWorkers() {
        if (workers != null) return;
        workers = new Thread[WORKERS];
        for (int i = 0; i < WORKERS; i++) {
            workers[i] = new Thread(this::workerLoop, "audiostore-" + i);
            workers[i].setDaemon(true);
            workers[i].start();
        }
        progressThread = new Thread(() -> {
            while (true) {
                try { Thread.sleep(600); } catch (InterruptedException e) { return; }
                if (running) emitProgress();
            }
        }, "audiostore-progress");
        progressThread.setDaemon(true);
        progressThread.start();
    }

    private void workerLoop() {
        while (true) {
            int n;
            synchronized (lock) {
                while (running && queue.isEmpty()) {
                    try { lock.wait(800); } catch (InterruptedException e) { return; }
                }
                if (!running) {
                    try { lock.wait(800); } catch (InterruptedException e) { return; }
                    continue;
                }
                n = queue.poll();
                status.put(n, "downloading");
                active.add(n);
            }
            boolean ok = false;
            String err = "";
            try {
                ok = downloadOne(n);
            } catch (Throwable t) {
                err = describe(t);
            }
            synchronized (lock) {
                active.remove(n);
                if (ok) {
                    status.put(n, "done");
                } else if (!running) {
                    status.put(n, diskStatus(n)); // إيقاف: جزئي/معلّق
                } else {
                    status.put(n, "error");
                    lastError = "سورة " + n + ": " + err;
                    JSObject ev = new JSObject();
                    ev.put("surah", n);
                    ev.put("message", err);
                    main.post(() -> notifyListeners("storeError", ev));
                }
                lock.notifyAll();
            }
            if (ok) {
                JSObject ev = new JSObject();
                ev.put("surah", n);
                ev.put("path", finalFile(n).getAbsolutePath());
                main.post(() -> notifyListeners("fileDone", ev));
            }
            emitProgress();
            checkAllDone();
        }
    }

    /** تنزيل ملف واحد مع الاستئناف. يعيد true عند الاكتمال. */
    private boolean downloadOne(int n) throws Exception {
        long total = expected.get(n);
        File part = partFile(n);
        File fin = finalFile(n);
        long have = part.exists() ? part.length() : 0;
        if (have == total) {
            part.renameTo(fin);
            return true;
        }
        if (have > total) { part.delete(); have = 0; }

        String url = baseUrl + "/" + name(n);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
        int code = c.getResponseCode();
        if (code == HttpURLConnection.HTTP_OK) {
            have = 0; // الخادم تجاهل Range: نبدأ من الصفر
        } else if (code != HttpURLConnection.HTTP_PARTIAL) {
            c.disconnect();
            throw new Exception("HTTP " + code);
        }
        try (InputStream in = c.getInputStream();
             FileOutputStream out = new FileOutputStream(part, have > 0)) {
            byte[] buf = new byte[65536];
            int r;
            while ((r = in.read(buf)) > 0) {
                if (!running) return false; // إيقاف فوري، يبقى .part للاستئناف
                out.write(buf, 0, r);
                have += r;
            }
            out.flush();
        } finally {
            c.disconnect();
        }
        if (part.length() == total) {
            if (fin.exists()) fin.delete();
            part.renameTo(fin);
            return true;
        }
        throw new Exception("حجم غير مكتمل " + part.length() + "/" + total);
    }

    private void checkAllDone() {
        synchronized (lock) {
            if (!configured || expected.isEmpty()) return;
            for (Integer n : expected.keySet()) {
                if (!"done".equals(statusOf(n))) return;
            }
        }
        main.post(() -> notifyListeners("allDone", new JSObject()));
    }

    private void emitProgress() {
        JSObject snap = snapshot();
        main.post(() -> notifyListeners("progress", snap));
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            running = false;
            lock.notifyAll();
        }
        if (progressThread != null) progressThread.interrupt();
        super.handleOnDestroy();
    }
}
