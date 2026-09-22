package com.richard.daglog.opruim;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.richard.daglog.R;

import java.io.File;
import java.util.Locale;

/**
 * Wat de knop buiten de app om nodig heeft: je keuzes onthouden, een ronde
 * draaien en achteraf één regel melden.
 *
 * De tegel in je snelinstellingen, de widget op je startscherm en de
 * nachtronde komen alle drie hier binnen, en draaien daarna exact dezelfde
 * OpruimRonde als de knop in de app.
 *
 * Je keuzes staan in localStorage van de webview, en daar komt een
 * achtergrondtaak niet bij. Daarom schrijft de app ze bij elke wijziging ook
 * hierheen (SharedPreferences), als één regel tekst.
 */
public final class OpruimMotor {

    public static final String PREFS = "opruim";
    public static final String SLEUTEL_INSTELLINGEN = "instellingen";
    public static final String SLEUTEL_AUTOMATISCH = "automatisch";
    public static final String SLEUTEL_LAATSTE_OP = "laatste-op";
    public static final String SLEUTEL_LAATSTE_AANTAL = "laatste-aantal";
    public static final String SLEUTEL_LAATSTE_BYTES = "laatste-bytes";

    public static final int BEWAAR_DAGEN = 7;

    private static final String KANAAL = "opruim";
    private static final int MELDING_ID = 4711;

    private OpruimMotor() {}

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static OpruimRegels.Instellingen instellingen(Context context) {
        return OpruimInstellingenTekst.uitTekst(prefs(context).getString(SLEUTEL_INSTELLINGEN, null));
    }

    public static void bewaarInstellingen(Context context, OpruimRegels.Instellingen inst, boolean automatisch) {
        prefs(context)
            .edit()
            .putString(SLEUTEL_INSTELLINGEN, OpruimInstellingenTekst.naarTekst(inst))
            .putBoolean(SLEUTEL_AUTOMATISCH, automatisch)
            .apply();
    }

    public static boolean heeftOpslagToegang(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Draait een ronde met de bewaarde instellingen. Geeft null terug als er
     * geen toegang is of niets aanstaat — dan valt er simpelweg niets te doen.
     */
    public static OpruimRonde.Uitkomst ronde(Context context) {
        if (!heeftOpslagToegang(context)) return null;

        OpruimRegels.Instellingen inst = instellingen(context);
        if (!OpruimInstellingenTekst.ietsAan(inst)) return null;

        File wortel = Environment.getExternalStorageDirectory();
        OpruimRonde.Uitkomst uit = OpruimRonde.voerUit(
            wortel,
            inst,
            OpruimInstellingenTekst.categorieen(inst),
            BEWAAR_DAGEN,
            System.currentTimeMillis()
        );

        prefs(context)
            .edit()
            .putLong(SLEUTEL_LAATSTE_OP, System.currentTimeMillis())
            .putInt(SLEUTEL_LAATSTE_AANTAL, uit.aantal)
            .putLong(SLEUTEL_LAATSTE_BYTES, uit.bytes)
            .apply();

        return uit;
    }

    // ----------------------------------------------------------------------
    // Melden
    // ----------------------------------------------------------------------

    public static String fmtBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format(Locale.getDefault(), "%.0f kB", bytes / 1024.0);
        if (bytes < 1024L * 1024L * 1024L) {
            return String.format(Locale.getDefault(), "%.1f MB", bytes / (1024.0 * 1024.0));
        }
        return String.format(Locale.getDefault(), "%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    public static String samenvatting(OpruimRonde.Uitkomst uit) {
        if (uit == null) return "Niets te doen";
        StringBuilder tekst = new StringBuilder();
        tekst.append(fmtBytes(uit.bytes)).append(" opgeruimd · ").append(uit.aantal).append(" items");
        if (uit.definitiefVrij > 0) {
            tekst.append(" · ").append(fmtBytes(uit.definitiefVrij)).append(" uit de prullenbak gewist");
        }
        return tekst.toString();
    }

    private static void maakKanaal(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager beheer = context.getSystemService(NotificationManager.class);
        if (beheer == null || beheer.getNotificationChannel(KANAAL) != null) return;
        // Stil: dit is een terugkoppeling achteraf, geen bericht dat je wakker hoort te maken.
        NotificationChannel kanaal = new NotificationChannel(KANAAL, "Opruimen", NotificationManager.IMPORTANCE_LOW);
        kanaal.setDescription("Laat zien hoeveel ruimte een opruimronde heeft vrijgemaakt.");
        kanaal.setShowBadge(false);
        beheer.createNotificationChannel(kanaal);
    }

    /**
     * Meldt de uitkomst. Een ronde die niets vond blijft stil — anders krijg je
     * elke nacht een melding dat er niets te melden viel.
     */
    public static void meld(Context context, OpruimRonde.Uitkomst uit) {
        if (uit == null || !uit.ietsGedaan()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return; // geen toestemming voor meldingen: dan maar stil opruimen
        }
        maakKanaal(context);

        Intent openen = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tik = null;
        if (openen != null) {
            openen.putExtra("app", "opruim");
            int vlaggen = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) vlaggen |= PendingIntent.FLAG_IMMUTABLE;
            tik = PendingIntent.getActivity(context, 0, openen, vlaggen);
        }

        Notification melding = new androidx.core.app.NotificationCompat.Builder(context, KANAAL)
            .setSmallIcon(R.drawable.ic_opruim)
            .setContentTitle("Opruimen")
            .setContentText(samenvatting(uit))
            .setContentIntent(tik)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(MELDING_ID, melding);
        } catch (SecurityException e) {
            /* toestemming alsnog ingetrokken — niets aan de hand */
        }
    }
}
