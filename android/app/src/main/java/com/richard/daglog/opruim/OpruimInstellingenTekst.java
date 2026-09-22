package com.richard.daglog.opruim;

import java.util.Locale;

/**
 * De instellingen als één regel tekst, zodat de tegel, de widget en de
 * nachtronde weten wat ze mogen opruimen.
 *
 * Waarom dit bestaat: de app bewaart je keuzes in localStorage van de webview,
 * en daar komt een achtergrondtaak niet bij. Elke keer dat je in de app iets
 * aanvinkt, schrijft de plugin daarom deze regel naar SharedPreferences —
 * één simpel formaat dat ook nog te lezen is als er later een sleutel bijkomt
 * of wegvalt.
 *
 * Bewust weer zonder android-imports: het omzetten heen en terug is lokaal te
 * testen, en de Android-kant doet alleen nog opslaan en ophalen.
 */
public final class OpruimInstellingenTekst {

    private OpruimInstellingenTekst() {}

    public static String naarTekst(OpruimRegels.Instellingen inst) {
        StringBuilder uit = new StringBuilder();
        uit.append("tijdelijk=").append(inst.tijdelijk ? 1 : 0);
        uit.append(";thumbnails=").append(inst.thumbnails ? 1 : 0);
        uit.append(";legeMappen=").append(inst.legeMappen ? 1 : 0);
        uit.append(";apks=").append(inst.apks ? 1 : 0);
        uit.append(";downloads=").append(inst.downloads ? 1 : 0);
        uit.append(";duplicaten=").append(inst.duplicaten ? 1 : 0);
        uit.append(";apkDagen=").append(inst.apkDagen);
        uit.append(";downloadDagen=").append(inst.downloadDagen);
        return uit.toString();
    }

    /**
     * Leest de regel terug. Alles wat ontbreekt of onleesbaar is houdt zijn
     * standaardwaarde — een half geschreven regel mag nooit tot gretiger
     * opruimen leiden dan je hebt ingesteld.
     */
    public static OpruimRegels.Instellingen uitTekst(String tekst) {
        OpruimRegels.Instellingen inst = new OpruimRegels.Instellingen();
        if (tekst == null || tekst.trim().isEmpty()) return inst;

        for (String deel : tekst.split(";")) {
            int isTeken = deel.indexOf('=');
            if (isTeken <= 0) continue;
            String sleutel = deel.substring(0, isTeken).trim().toLowerCase(Locale.ROOT);
            String waarde = deel.substring(isTeken + 1).trim();
            if (waarde.isEmpty()) continue;

            if (sleutel.equals("tijdelijk")) inst.tijdelijk = isWaar(waarde, inst.tijdelijk);
            else if (sleutel.equals("thumbnails")) inst.thumbnails = isWaar(waarde, inst.thumbnails);
            else if (sleutel.equals("legemappen")) inst.legeMappen = isWaar(waarde, inst.legeMappen);
            else if (sleutel.equals("apks")) inst.apks = isWaar(waarde, inst.apks);
            else if (sleutel.equals("downloads")) inst.downloads = isWaar(waarde, inst.downloads);
            else if (sleutel.equals("duplicaten")) inst.duplicaten = isWaar(waarde, inst.duplicaten);
            else if (sleutel.equals("apkdagen")) inst.apkDagen = getal(waarde, inst.apkDagen);
            else if (sleutel.equals("downloaddagen")) inst.downloadDagen = getal(waarde, inst.downloadDagen);
        }
        return inst;
    }

    private static boolean isWaar(String waarde, boolean standaard) {
        if (waarde.equals("1") || waarde.equalsIgnoreCase("true")) return true;
        if (waarde.equals("0") || waarde.equalsIgnoreCase("false")) return false;
        return standaard;
    }

    private static int getal(String waarde, int standaard) {
        try {
            int n = Integer.parseInt(waarde);
            return n >= 0 ? n : standaard;
        } catch (NumberFormatException e) {
            return standaard;
        }
    }

    /** Staat er überhaupt iets aan? Zo nee, dan hoeft een ronde niet te draaien. */
    public static boolean ietsAan(OpruimRegels.Instellingen inst) {
        return inst.tijdelijk || inst.thumbnails || inst.legeMappen || inst.apks || inst.downloads || inst.duplicaten;
    }

    /** De categorieën die volgens deze instellingen opgeruimd mogen worden. */
    public static String[] categorieen(OpruimRegels.Instellingen inst) {
        String[] alles = new String[6];
        int n = 0;
        if (inst.tijdelijk) alles[n++] = OpruimRegels.CAT_TIJDELIJK;
        if (inst.thumbnails) alles[n++] = OpruimRegels.CAT_THUMBNAILS;
        if (inst.legeMappen) alles[n++] = OpruimRegels.CAT_LEGE_MAP;
        if (inst.apks) alles[n++] = OpruimRegels.CAT_APK;
        if (inst.downloads) alles[n++] = OpruimRegels.CAT_DOWNLOAD;
        if (inst.duplicaten) alles[n++] = OpruimRegels.CAT_DUBBEL;

        String[] uit = new String[n];
        System.arraycopy(alles, 0, uit, 0, n);
        return uit;
    }
}
