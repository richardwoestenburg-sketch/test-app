package com.richard.daglog.opruim;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * De brug tussen de Opruimen-app en de opslag van de telefoon.
 *
 * Alle beslissingen (wat is rommel, wat blijft met rust) staan in
 * OpruimRegels/OpruimScanner/OpruimPrullenbak — die bevatten geen android-code
 * en worden apart getest. Hier staat alleen het telefoonwerk: toestemming
 * vragen, een achtergronddraad, en het vertalen naar JSON.
 *
 * Wat hier NIET kan, en ook niet met trucs moet: de cache van andere apps
 * wissen. Dat is sinds Android 6 voorbehouden aan het systeem.
 */
@CapacitorPlugin(
    name = "Opruim",
    permissions = {
        @Permission(
            alias = OpruimPlugin.OPSLAG,
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }
        ),
        @Permission(alias = OpruimPlugin.MELDINGEN, strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class OpruimPlugin extends Plugin {

    static final String OPSLAG = "opslag";
    static final String MELDINGEN = "meldingen";

    /** Hoeveel losse items we hooguit teruggeven; de totalen kloppen altijd. */
    private static final int MAX_ITEMS = 400;

    /** Zo lang blijft een opgeruimd bestand in de prullenbak staan. */
    private static final int BEWAAR_DAGEN = OpruimMotor.BEWAAR_DAGEN;

    private final ExecutorService draad = Executors.newSingleThreadExecutor();

    private File wortel() {
        return Environment.getExternalStorageDirectory();
    }

    private OpruimPrullenbak prullenbak() {
        return new OpruimPrullenbak(wortel());
    }

    private boolean heeftToestemming() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return getPermissionState(OPSLAG) == PermissionState.GRANTED;
    }

    // ----------------------------------------------------------------------
    // Toestand & toestemming
    // ----------------------------------------------------------------------

    @PluginMethod
    public void status(PluginCall call) {
        draad.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("beschikbaar", true);
            ret.put("toestemming", heeftToestemming());
            ret.put("wortel", wortel() != null ? wortel().getAbsolutePath() : "");
            ret.put("bewaarDagen", BEWAAR_DAGEN);

            OpruimPrullenbak bak = prullenbak();
            List<OpruimPrullenbak.Regel> regels = bak.lijst();
            JSObject bakInfo = new JSObject();
            bakInfo.put("aantal", regels.size());
            bakInfo.put("bytes", bak.omvang());
            ret.put("prullenbak", bakInfo);

            // De knop buiten de app om: staat de nachtronde gepland, mogen we
            // melden, en wat leverde de vorige ronde op?
            ret.put("automatisch", OpruimMotor.prefs(getContext()).getBoolean(OpruimMotor.SLEUTEL_AUTOMATISCH, false));
            ret.put("meldingen", mogenWeMelden());

            JSObject laatste = new JSObject();
            laatste.put("op", OpruimMotor.prefs(getContext()).getLong(OpruimMotor.SLEUTEL_LAATSTE_OP, 0));
            laatste.put("aantal", OpruimMotor.prefs(getContext()).getInt(OpruimMotor.SLEUTEL_LAATSTE_AANTAL, 0));
            laatste.put("bytes", OpruimMotor.prefs(getContext()).getLong(OpruimMotor.SLEUTEL_LAATSTE_BYTES, 0));
            ret.put("laatsteRonde", laatste);

            call.resolve(ret);
        });
    }

    /**
     * Vanaf Android 11 is "toegang tot alle bestanden" geen gewone vraag meer
     * maar een schakelaar in de instellingen; daarvoor sturen we de gebruiker
     * naar die pagina en kijken we bij terugkomst of het gelukt is.
     */
    @PluginMethod
    public void vraagToestemming(PluginCall call) {
        if (heeftToestemming()) {
            JSObject ret = new JSObject();
            ret.put("toestemming", true);
            call.resolve(ret);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            try {
                startActivityForResult(call, intent, "naInstellingen");
            } catch (Exception e) {
                // Niet elk toestel heeft die pagina per app; dan de algemene lijst.
                startActivityForResult(call, new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), "naInstellingen");
            }
            return;
        }
        requestPermissionForAlias(OPSLAG, call, "naPermissie");
    }

    @ActivityCallback
    private void naInstellingen(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("toestemming", heeftToestemming());
        call.resolve(ret);
    }

    @PermissionCallback
    private void naPermissie(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("toestemming", heeftToestemming());
        call.resolve(ret);
    }

    // ----------------------------------------------------------------------
    // Scannen & opruimen
    // ----------------------------------------------------------------------

    private OpruimRegels.Instellingen instellingenUit(PluginCall call) {
        OpruimRegels.Instellingen inst = new OpruimRegels.Instellingen();
        inst.tijdelijk = Boolean.TRUE.equals(call.getBoolean("tijdelijk", inst.tijdelijk));
        inst.thumbnails = Boolean.TRUE.equals(call.getBoolean("thumbnails", inst.thumbnails));
        inst.legeMappen = Boolean.TRUE.equals(call.getBoolean("legeMappen", inst.legeMappen));
        inst.apks = Boolean.TRUE.equals(call.getBoolean("apks", inst.apks));
        inst.downloads = Boolean.TRUE.equals(call.getBoolean("downloads", inst.downloads));
        inst.duplicaten = Boolean.TRUE.equals(call.getBoolean("duplicaten", inst.duplicaten));
        Integer apkDagen = call.getInt("apkDagen", inst.apkDagen);
        Integer downloadDagen = call.getInt("downloadDagen", inst.downloadDagen);
        if (apkDagen != null) inst.apkDagen = apkDagen;
        if (downloadDagen != null) inst.downloadDagen = downloadDagen;
        return inst;
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!heeftToestemming()) {
            call.reject("geen-toestemming");
            return;
        }
        OpruimRegels.Instellingen inst = instellingenUit(call);
        draad.execute(() -> {
            long nu = System.currentTimeMillis();
            OpruimScanner.Uitkomst uitkomst = OpruimScanner.scan(wortel(), inst, nu);

            Map<String, long[]> perCategorie = new HashMap<>(); // categorie -> {aantal, bytes}
            JSArray items = new JSArray();
            int meegegeven = 0;

            for (OpruimScanner.Vondst vondst : uitkomst.vondsten) {
                long[] totaal = perCategorie.get(vondst.categorie);
                if (totaal == null) {
                    totaal = new long[] { 0, 0 };
                    perCategorie.put(vondst.categorie, totaal);
                }
                totaal[0]++;
                totaal[1] += vondst.bytes;

                if (meegegeven < MAX_ITEMS) {
                    JSObject item = new JSObject();
                    item.put("pad", vondst.pad);
                    item.put("naam", vondst.relatiefPad);
                    item.put("categorie", vondst.categorie);
                    item.put("bytes", vondst.bytes);
                    item.put("gewijzigd", vondst.gewijzigd);
                    item.put("map", vondst.map);
                    items.put(item);
                    meegegeven++;
                }
            }

            JSObject categorieen = new JSObject();
            for (Map.Entry<String, long[]> regel : perCategorie.entrySet()) {
                JSObject vak = new JSObject();
                vak.put("aantal", regel.getValue()[0]);
                vak.put("bytes", regel.getValue()[1]);
                categorieen.put(regel.getKey(), vak);
            }

            JSObject ret = new JSObject();
            ret.put("items", items);
            ret.put("aantal", uitkomst.vondsten.size());
            ret.put("bytes", uitkomst.bytes());
            ret.put("bekeken", uitkomst.bekeken);
            ret.put("afgekapt", uitkomst.afgekapt);
            ret.put("categorieen", categorieen);
            call.resolve(ret);
        });
    }

    /**
     * Ruimt op wat in de opgegeven categorieën valt. Het echte werk doet
     * OpruimRonde, dat ook de tegel, de widget en de nachtronde draaien —
     * één pad, dus één gedrag.
     */
    @PluginMethod
    public void ruimOp(PluginCall call) {
        if (!heeftToestemming()) {
            call.reject("geen-toestemming");
            return;
        }
        OpruimRegels.Instellingen inst = instellingenUit(call);
        List<String> categorieen;
        try {
            JSArray opgegeven = call.getArray("categorieen");
            categorieen = opgegeven == null ? new ArrayList<>() : opgegeven.toList();
        } catch (JSONException e) {
            call.reject("onleesbare-categorieen");
            return;
        }

        draad.execute(() -> {
            OpruimRonde.Uitkomst uitkomst = OpruimRonde.voerUit(
                wortel(),
                inst,
                categorieen.toArray(new String[0]),
                BEWAAR_DAGEN,
                System.currentTimeMillis()
            );

            JSObject perCategorie = new JSObject();
            for (Map.Entry<String, long[]> regel : uitkomst.per.entrySet()) {
                JSObject vak = new JSObject();
                vak.put("aantal", regel.getValue()[0]);
                vak.put("bytes", regel.getValue()[1]);
                perCategorie.put(regel.getKey(), vak);
            }

            JSObject ret = new JSObject();
            ret.put("aantal", uitkomst.aantal);
            ret.put("bytes", uitkomst.bytes);
            ret.put("mislukt", uitkomst.mislukt);
            ret.put("definitiefVrij", uitkomst.definitiefVrij);
            ret.put("categorieen", perCategorie);
            call.resolve(ret);
        });
    }

    // ----------------------------------------------------------------------
    // De knop buiten de app om: voorkeuren, nachtronde en meldingen
    // ----------------------------------------------------------------------

    private boolean mogenWeMelden() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return getPermissionState(MELDINGEN) == PermissionState.GRANTED;
    }

    /**
     * De app bewaart je keuzes in localStorage, en daar komt een tegel of een
     * nachtronde niet bij. Elke wijziging komt daarom ook hierheen, en meteen
     * wordt de nachtronde (opnieuw) ingepland of juist afgezegd.
     */
    @PluginMethod
    public void bewaarVoorkeuren(PluginCall call) {
        OpruimRegels.Instellingen inst = instellingenUit(call);
        boolean automatisch = Boolean.TRUE.equals(call.getBoolean("automatisch", Boolean.TRUE));
        OpruimMotor.bewaarInstellingen(getContext(), inst, automatisch);
        try {
            OpruimWerk.plan(getContext(), automatisch);
        } catch (Exception e) {
            call.reject("nachtronde-mislukt");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("automatisch", automatisch);
        call.resolve(ret);
    }

    /** Eén ronde aanvragen zoals de tegel dat doet — handig om het te proberen. */
    @PluginMethod
    public void ruimNuOpDeAchtergrond(PluginCall call) {
        if (!heeftToestemming()) {
            call.reject("geen-toestemming");
            return;
        }
        OpruimWerk.nu(getContext());
        call.resolve();
    }

    @PluginMethod
    public void vraagMeldingen(PluginCall call) {
        if (mogenWeMelden()) {
            JSObject ret = new JSObject();
            ret.put("meldingen", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias(MELDINGEN, call, "naMeldingen");
    }

    @PermissionCallback
    private void naMeldingen(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("meldingen", mogenWeMelden());
        call.resolve(ret);
    }

    // ----------------------------------------------------------------------
    // Prullenbak
    // ----------------------------------------------------------------------

    @PluginMethod
    public void prullenbak(PluginCall call) {
        draad.execute(() -> {
            OpruimPrullenbak bak = prullenbak();
            JSArray items = new JSArray();
            for (OpruimPrullenbak.Regel regel : bak.lijst()) {
                JSObject item = new JSObject();
                item.put("bakNaam", regel.bakNaam);
                item.put("naam", regel.naam());
                item.put("pad", regel.origineelPad);
                item.put("bytes", regel.bytes);
                item.put("verwijderdOp", regel.verwijderdOp);
                items.put(item);
            }
            JSObject ret = new JSObject();
            ret.put("items", items);
            ret.put("bytes", bak.omvang());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void zetTerug(PluginCall call) {
        String bakNaam = call.getString("bakNaam");
        if (bakNaam == null) {
            call.reject("geen-banaam");
            return;
        }
        draad.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("gelukt", prullenbak().zetTerug(bakNaam));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void leegPrullenbak(PluginCall call) {
        draad.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("bytes", prullenbak().leeg());
            call.resolve(ret);
        });
    }
}
