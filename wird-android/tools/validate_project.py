#!/usr/bin/env python3
"""Static checks for the offline/no-AI Android project contract."""
import pathlib
import sys

manifest = pathlib.Path("app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
gradle = pathlib.Path("app/build.gradle.kts").read_text(encoding="utf-8")
source = pathlib.Path("app/src/main/java/com/wird/quran/MainActivity.kt").read_text(encoding="utf-8")
errors = []
if "android.permission.INTERNET" not in manifest:
    errors.append("The Android manifest must allow optional audio downloads.")
if "downloadMisharySurah" not in source or "filesDir, \"audio\"" not in source:
    errors.append("Optional offline audio download/storage implementation is missing.")
if any(term in gradle.lower() for term in ("openai", "tflite", "tensorflow", "mlkit", "onnxruntime")):
    errors.append("Unexpected AI/ML dependency found in Gradle dependencies.")
if "LocalLayoutDirection provides LayoutDirection.Rtl" not in source:
    errors.append("Arabic RTL layout provider is missing.")
if "file:///android_asset/mushaf/" not in source:
    errors.append("Mushaf viewer must use local assets only.")
if 'loadUrl("http' in source or 'setDataSource("http' in source or "OkHttpClient(" in source or "Retrofit.Builder(" in source:
    errors.append("Unexpected network playback or HTTP client found in runtime Kotlin source.")
if errors:
    sys.exit("\n".join(errors))
audio_dir = pathlib.Path("app/src/main/assets/audio")
if audio_dir.exists() and any(audio_dir.glob("*.mp3")):
    errors.append("Audio files must not be bundled in the APK; audio is downloaded on demand.")
if errors:
    sys.exit("\n".join(errors))
print("Project contract passed: offline Quran/text/Mushaf, Arabic RTL, no AI, and optional on-demand audio.")
