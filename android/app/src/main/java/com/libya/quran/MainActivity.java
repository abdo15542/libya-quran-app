package com.libya.quran;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAudioPlugin.class);
        registerPlugin(AudioStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
