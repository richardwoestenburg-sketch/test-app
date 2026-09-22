package com.richard.daglog.opruim;

import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.widget.Toast;

import androidx.annotation.RequiresApi;

import com.richard.daglog.R;

/**
 * De knop in je snelinstellingen: uitrolmenu open, één tik, klaar — de app
 * hoeft niet eens te starten.
 *
 * De tegel doet zelf geen werk: hij zet een ronde in de wachtrij bij
 * WorkManager. Dat mag namelijk gewoon doorlopen als jij het menu weer
 * dichtschuift, en de melding achteraf vertelt wat het opleverde.
 */
@RequiresApi(Build.VERSION_CODES.N)
public class OpruimTegel extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        werkTegelBij();
    }

    @Override
    public void onClick() {
        super.onClick();

        if (!OpruimMotor.heeftOpslagToegang(this)) {
            // Zonder toegang valt er niets te doen; open de app, daar staat
            // de uitleg en de knop om het te regelen.
            Toast.makeText(this, "Open Opruimen in de app om toegang te geven", Toast.LENGTH_LONG).show();
            return;
        }

        OpruimWerk.nu(getApplicationContext());
        Toast.makeText(this, "Opruimen gestart", Toast.LENGTH_SHORT).show();
        werkTegelBij();
    }

    private void werkTegelBij() {
        Tile tegel = getQsTile();
        if (tegel == null) return;
        boolean klaar = OpruimMotor.heeftOpslagToegang(this);
        tegel.setState(klaar ? Tile.STATE_INACTIVE : Tile.STATE_UNAVAILABLE);
        tegel.setLabel("Opruimen");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            long bytes = OpruimMotor.prefs(this).getLong(OpruimMotor.SLEUTEL_LAATSTE_BYTES, 0);
            tegel.setSubtitle(bytes > 0 ? "laatst: " + OpruimMotor.fmtBytes(bytes) : "tik om op te ruimen");
        }
        tegel.setIcon(Icon.createWithResource(this, R.drawable.ic_opruim));
        tegel.updateTile();
    }
}
