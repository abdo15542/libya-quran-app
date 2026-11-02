package com.libya.quran;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
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

/**
 * مشغّل صوت أصلي (MediaPlayer) لملفات التلاوة المدمجة في أصول التطبيق.
 * الإصدار 1.3.2 — مُصلّب:
 * - كل عمليات المشغّل على الخيط الرئيسي.
 * - التحضير غير المتزامن (prepareAsync) بدل الحظر.
 * - سلسلة بدائل لمصدر البيانات: واصف الأصل مباشرة، ثم نسخ الأصل إلى
 *   ملف في ذاكرة التطبيق المؤقتة والتشغيل من المسار.
 * - الأخطاء الحقيقية (نص الاستثناء ورموز MediaPlayer) تصل إلى الواجهة
 *   كما هي بدل رسائل عامة، وتُحفظ آخر حالة للتشخيص داخل التطبيق.
 */
@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private String currentPath;
    private String sourceKind = "";
    private String lastError = "";
    private PluginCall pendingPlay;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            main.post(() -> {
                if (player != null && player.isPlaying()) {
                    player.pause();
                    notifyListeners("paused", new JSObject());
                }
            });
        }
    };

    private boolean requestFocus() {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) return true;
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusListener)
                    .build();
            return audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Exception e) {
            return true;
        }
    }

    private void abandonFocus() {
        try {
            if (audioManager != null && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            }
        } catch (Exception ignored) {}
    }

    private void releasePlayer() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
        currentPath = null;
    }

    private String describe(Throwable t) {
        String m = t.getMessage();
        return t.getClass().getSimpleName() + (m != null ? ": " + m : "");
    }

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("model", Build.MODEL != null ? Build.MODEL : "");
        ret.put("lastError", lastError);
        call.resolve(ret);
    }

    /**
     * فحص أرضي للحقيقة داخل النسخة المثبتة فعليًا على الجهاز:
     * حجم ملف APK المثبت، وقائمة ملفات الصوت كما يراها مدير الأصول،
     * ومحاولة فتح وقراءة أول ملف — حتى لا نعتمد على أي بيان ثابت.
     */
    @PluginMethod
    public void probe(PluginCall call) {
        main.post(() -> {
            JSObject ret = new JSObject();
            try {
                Context ctx = getContext();
                String src = ctx.getApplicationInfo().sourceDir;
                ret.put("apkPath", src);
                ret.put("apkBytes", new File(src).length());
                android.content.res.AssetManager am = ctx.getAssets();
                try {
                    String[] audio = am.list("public/audio");
                    ret.put("audioCount", audio != null ? audio.length : -1);
                    if (audio != null && audio.length > 0) ret.put("audioFirst", audio[0]);
                } catch (Throwable t) {
                    ret.put("audioListError", describe(t));
                }
                try {
                    String[] data = am.list("public/data");
                    ret.put("dataCount", data != null ? data.length : -1);
                } catch (Throwable t) {
                    ret.put("dataListError", describe(t));
                }
                try {
                    AssetFileDescriptor afd = am.openFd("public/audio/001.mp3");
                    ret.put("fdBytes", afd.getLength());
                    afd.close();
                } catch (Throwable t) {
                    ret.put("fdError", describe(t));
                }
                try (InputStream in = am.open("public/audio/001.mp3")) {
                    ret.put("streamRead", in.read(new byte[8192]));
                } catch (Throwable t) {
                    ret.put("streamError", describe(t));
                }
                ret.put("sdk", Build.VERSION.SDK_INT);
                ret.put("model", Build.MODEL != null ? Build.MODEL : "");
            } catch (Throwable t) {
                ret.put("probeError", describe(t));
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        // منذ 1.4.0: التشغيل الأساسي من ملف منزّل على الجهاز (filePath)،
        // ومسار الأصول (path) يبقى مدعومًا كما هو.
        String filePath = call.getString("filePath");
        String path = call.getString("path");
        if (filePath != null && new File(filePath).exists()) {
            Double seek = call.getDouble("seek");
            main.post(() -> playOnMain(filePath, seek, call, true));
            return;
        }
        if (path == null) {
            call.reject("مسار الصوت مفقود");
            return;
        }
        Double seek = call.getDouble("seek");
        main.post(() -> playOnMain(path, seek, call, false));
    }

    private void playOnMain(String path, Double seek, PluginCall call) {
        playOnMain(path, seek, call, false);
    }

    private void playOnMain(String path, Double seek, PluginCall call, boolean isLocalFile) {
        try {
            // نفس الملف محمّل: استئناف أو إعادة من موضع
            if (player != null && path.equals(currentPath)) {
                if (seek != null) player.seekTo((int) (seek * 1000));
                if (!player.isPlaying()) {
                    requestFocus();
                    player.start();
                    notifyListeners("playing", new JSObject());
                }
                call.resolve(state());
                return;
            }

            releasePlayer();
            if (pendingPlay != null) {
                pendingPlay.reject("استُبدل بطلب أحدث");
                pendingPlay = null;
            }

            // سلسلة البدائل: ملف محلي منزّل مباشرة، أو (1) واصف الأصل،
            // (2) ملف منسوخ في الذاكرة المؤقتة
            StringBuilder errors = new StringBuilder();
            MediaPlayer mp = null;
            String kind = "";

            if (isLocalFile) {
                try {
                    mp = newPlayer();
                    mp.setDataSource(path);
                    kind = "local";
                } catch (Throwable t1) {
                    errors.append("local: ").append(describe(t1));
                    try { if (mp != null) mp.release(); } catch (Exception ignored) {}
                    mp = null;
                }
            } else try {
                mp = newPlayer();
                AssetFileDescriptor afd = getContext().getAssets().openFd(path);
                mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
                kind = "fd";
            } catch (Throwable t1) {
                errors.append("fd: ").append(describe(t1));
                try { if (mp != null) mp.release(); } catch (Exception ignored) {}
                mp = null;
                try {
                    File f = copyAssetToCache(path);
                    mp = newPlayer();
                    mp.setDataSource(f.getAbsolutePath());
                    kind = "file";
                } catch (Throwable t2) {
                    errors.append(" | file: ").append(describe(t2));
                    try { if (mp != null) mp.release(); } catch (Exception ignored) {}
                    mp = null;
                }
            }

            if (mp == null) {
                lastError = errors.toString();
                call.reject("تعذّر فتح ملف الصوت [" + lastError + "]");
                return;
            }

            player = mp;
            currentPath = path;
            sourceKind = kind;
            pendingPlay = call;

            final MediaPlayer fmp = mp;
            mp.setOnPreparedListener(p -> {
                try {
                    if (seek != null && seek > 0) fmp.seekTo((int) (seek * 1000));
                    requestFocus();
                    fmp.start();
                    notifyListeners("playing", new JSObject());
                    if (pendingPlay != null) {
                        pendingPlay.resolve(state());
                        pendingPlay = null;
                    }
                } catch (Throwable t) {
                    lastError = describe(t);
                    if (pendingPlay != null) {
                        pendingPlay.reject("تعذّر بدء التشغيل [" + lastError + "]");
                        pendingPlay = null;
                    }
                }
            });
            mp.setOnCompletionListener(p -> notifyListeners("ended", new JSObject()));
            mp.setOnErrorListener((p, what, extra) -> {
                lastError = "MediaPlayer what=" + what + " extra=" + extra;
                JSObject err = new JSObject();
                err.put("what", what);
                err.put("extra", extra);
                notifyListeners("error", err);
                if (pendingPlay != null) {
                    pendingPlay.reject("خطأ المشغّل الأصلي [" + lastError + "]");
                    pendingPlay = null;
                }
                return true;
            });
            mp.prepareAsync();
        } catch (Throwable t) {
            lastError = describe(t);
            call.reject("تعذّر تشغيل الصوت [" + lastError + "]");
        }
    }

    private MediaPlayer newPlayer() {
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        return mp;
    }

    private File copyAssetToCache(String path) throws Exception {
        File dir = new File(getContext().getCacheDir(), "audio");
        if (!dir.exists()) dir.mkdirs();
        String name = path.substring(path.lastIndexOf('/') + 1);
        File out = new File(dir, name);
        // ملف مطابق الحجم موجود مسبقًا: أعد استخدامه
        long expected = -1;
        try {
            AssetFileDescriptor afd = getContext().getAssets().openFd(path);
            expected = afd.getLength();
            afd.close();
        } catch (Throwable ignored) {}
        if (out.exists() && expected > 0 && out.length() == expected) return out;
        try (InputStream in = getContext().getAssets().open(path);
             FileOutputStream fos = new FileOutputStream(out)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
        }
        return out;
    }

    @PluginMethod
    public void pause(PluginCall call) {
        main.post(() -> {
            try {
                if (player != null && player.isPlaying()) {
                    player.pause();
                    notifyListeners("paused", new JSObject());
                }
                call.resolve(state());
            } catch (Exception e) {
                call.reject("تعذّر الإيقاف المؤقت [" + describe(e) + "]");
            }
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        main.post(() -> {
            try {
                if (player != null && !player.isPlaying()) {
                    requestFocus();
                    player.start();
                    notifyListeners("playing", new JSObject());
                }
                call.resolve(state());
            } catch (Exception e) {
                call.reject("تعذّر الاستئناف [" + describe(e) + "]");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            try {
                if (player != null) {
                    player.pause();
                    player.seekTo(0);
                }
                abandonFocus();
                notifyListeners("paused", new JSObject());
                call.resolve(state());
            } catch (Exception e) {
                call.reject("تعذّر الإيقاف [" + describe(e) + "]");
            }
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        main.post(() -> {
            try {
                if (player != null && seconds != null) player.seekTo((int) (seconds * 1000));
                call.resolve(state());
            } catch (Exception e) {
                call.reject("تعذّر التقديم [" + describe(e) + "]");
            }
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        main.post(() -> call.resolve(state()));
    }

    private JSObject state() {
        JSObject s = new JSObject();
        try {
            if (player != null) {
                s.put("playing", player.isPlaying());
                s.put("currentTime", player.getCurrentPosition() / 1000.0);
                s.put("duration", player.getDuration() / 1000.0);
            } else {
                s.put("playing", false);
                s.put("currentTime", 0);
                s.put("duration", 0);
            }
        } catch (Exception e) {
            s.put("playing", false);
            s.put("currentTime", 0);
            s.put("duration", 0);
        }
        s.put("path", currentPath);
        s.put("source", sourceKind);
        s.put("lastError", lastError);
        return s;
    }

    @Override
    protected void handleOnDestroy() {
        abandonFocus();
        releasePlayer();
        super.handleOnDestroy();
    }
}
