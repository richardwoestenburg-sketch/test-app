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
        )
    }
)
public class OpruimPlugin extends Plugin {

    static final String OPSLAG = "opslag";

    /** Hoeveel losse items we hooguit teruggeven; de totalen kloppen altijd. */
    private static final int MAX_ITEMS = 400;

    /** Zo lang blijft een opgeruimd bestand in de prullenbak staan. */
    private static final int BEWAAR_DAGEN = 7;

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
     * Ruimt op wat in de opgegeven categorieën valt. Bewust niet op basis van
     * de padlijst uit `scan`: die is afgetopt op MAX_ITEMS, en dan zou een
     * volle telefoon maar deels opgeruimd worden. We scannen dus opnieuw en
     * pakken alles wat in de aangevinkte categorieën valt — de regels kijken
     * toch niet naar bestanden jonger dan een paar dagen, dus er kan in de
     * tussentijd niets nieuws tussendoor glippen.
     *
     * Bestanden verhuizen naar de prullenbak; lege mappen verdwijnen meteen
     * (die zijn niet terug te zetten en nemen geen ruimte in).
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
            long nu = System.currentTimeMillis();
            OpruimPrullenbak bak = prullenbak();
            String wortelPad = wortel().getAbsolutePath();

            OpruimScanner.Uitkomst uitkomst = OpruimScanner.scan(wortel(), inst, nu);
            List<OpruimPrullenbak.Regel> verhuisd = new ArrayList<>();
            Map<String, long[]> per = new HashMap<>();
            int aantal = 0;
            long bytes = 0;
            int mislukt = 0;

            for (OpruimScanner.Vondst vondst : uitkomst.vondsten) {
                if (!categorieen.contains(vondst.categorie)) continue;

                File bestand = new File(vondst.pad);
                // Nooit buiten de gedeelde opslag, en nooit in de bak zelf.
                if (!bestand.getAbsolutePath().startsWith(wortelPad)
                    || bestand.getAbsolutePath().contains(OpruimPrullenbak.MAP_NAAM)) {
                    mislukt++;
                    continue;
                }

                boolean gelukt;
                long vrij = 0;
                if (vondst.map) {
                    String[] inhoud = bestand.list();
                    gelukt = inhoud != null && inhoud.length == 0 && bestand.delete();
                } else {
                    OpruimPrullenbak.Regel regel = bak.verplaats(bestand, nu);
                    gelukt = regel != null;
                    if (gelukt) {
                        verhuisd.add(regel);
                        vrij = regel.bytes;
                    }
                }
                if (!gelukt) {
                    mislukt++;
                    continue;
                }
                aantal++;
                bytes += vrij;

                long[] totaal = per.get(vondst.categorie);
                if (totaal == null) {
                    totaal = new long[] { 0, 0 };
                    per.put(vondst.categorie, totaal);
                }
                totaal[0]++;
                totaal[1] += vrij;
            }

            try {
                bak.noteer(verhuisd);
            } catch (Exception e) {
                // De bestanden staan in de bak; alleen de administratie ontbreekt.
                mislukt += verhuisd.size();
            }

            long definitiefVrij = bak.wisOuderDan(BEWAAR_DAGEN, nu);

            JSObject perCategorie = new JSObject();
            for (Map.Entry<String, long[]> regel : per.entrySet()) {
                JSObject vak = new JSObject();
                vak.put("aantal", regel.getValue()[0]);
                vak.put("bytes", regel.getValue()[1]);
                perCategorie.put(regel.getKey(), vak);
            }

            JSObject ret = new JSObject();
            ret.put("aantal", aantal);
            ret.put("bytes", bytes);
            ret.put("mislukt", mislukt);
            ret.put("definitiefVrij", definitiefVrij);
            ret.put("categorieen", perCategorie);
            call.resolve(ret);
        });
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
