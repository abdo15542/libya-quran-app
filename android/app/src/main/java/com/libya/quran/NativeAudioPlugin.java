package com.libya.quran;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * مشغّل صوت أصلي يعتمد على MediaPlayer لتشغيل ملفات التلاوة المدمجة
 * في أصول التطبيق مباشرة، دون المرور بمشغّل وسائط WebView الذي رفض
 * التشغيل من خادم الأصول المحلي على بعض الأجهزة.
 */
@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {

    private MediaPlayer player;
    private String currentPath;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (player != null && player.isPlaying()) {
                player.pause();
                notifyListeners("paused", new JSObject());
            }
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
            return true; // لا نمنع التشغيل بسبب التركيز الصوتي
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

    @PluginMethod
    public void play(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("مسار الصوت مفقود");
            return;
        }
        Double seek = call.getDouble("seek");
        try {
            // نفس الملف: استئناف (أو إعادة من موضع محدد)
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
            AssetFileDescriptor afd = getContext().getAssets().openFd(path);
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mp.setOnCompletionListener(p -> notifyListeners("ended", new JSObject()));
            mp.setOnErrorListener((p, what, extra) -> {
                JSObject err = new JSObject();
                err.put("what", what);
                err.put("extra", extra);
                notifyListeners("error", err);
                return true;
            });
            mp.prepare();
            if (seek != null && seek > 0) mp.seekTo((int) (seek * 1000));
            requestFocus();
            mp.start();
            player = mp;
            currentPath = path;
            notifyListeners("playing", new JSObject());
            call.resolve(state());
        } catch (Exception e) {
            call.reject("تعذّر تشغيل الصوت على الجهاز");
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        try {
            if (player != null && player.isPlaying()) {
                player.pause();
                notifyListeners("paused", new JSObject());
            }
            call.resolve(state());
        } catch (Exception e) {
            call.reject("تعذّر الإيقاف المؤقت");
        }
    }

    @PluginMethod
    public void resume(PluginCall call) {
        try {
            if (player != null && !player.isPlaying()) {
                requestFocus();
                player.start();
                notifyListeners("playing", new JSObject());
            }
            call.resolve(state());
        } catch (Exception e) {
            call.reject("تعذّر الاستئناف");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (player != null) {
                player.pause();
                player.seekTo(0);
            }
            abandonFocus();
            notifyListeners("paused", new JSObject());
            call.resolve(state());
        } catch (Exception e) {
            call.reject("تعذّر الإيقاف");
        }
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        try {
            if (player != null && seconds != null) player.seekTo((int) (seconds * 1000));
            call.resolve(state());
        } catch (Exception e) {
            call.reject("تعذّر التقديم");
        }
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(state());
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
        return s;
    }

    @Override
    protected void handleOnDestroy() {
        abandonFocus();
        releasePlayer();
        super.handleOnDestroy();
    }
}
