package com.richard.daglog;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.richard.daglog.opruim.OpruimPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registreren moet vóór super.onCreate: daarna bouwt Capacitor de brug
        // en is de plugin niet meer aan te melden.
        registerPlugin(OpruimPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
