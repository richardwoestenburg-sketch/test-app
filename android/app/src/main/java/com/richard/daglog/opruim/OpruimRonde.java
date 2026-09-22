package com.richard.daglog.opruim;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Eén opruimronde: scannen, wegzetten, prullenbak bijwerken.
 *
 * Dit is het hart dat iedereen deelt — de knop in de app, de tegel in je
 * snelinstellingen, de widget en de nachtronde. Zonder android-imports, dus
 * lokaal te testen op een gewone map.
 *
 * Bewust opnieuw scannen in plaats van een padlijst aannemen: een scan levert
 * hooguit een paar honderd voorbeelden voor op het scherm, en van een volle
 * telefoon zou dan maar een deel opgeruimd worden. De regels raken niets aan
 * dat jonger is dan een paar dagen, dus tussen scannen en opruimen kan er
 * niets nieuws tussendoor glippen.
 */
public final class OpruimRonde {

    private OpruimRonde() {}

    public static final class Uitkomst {
        public int aantal;
        public int mislukt;
        public long bytes;
        public long definitiefVrij;
        public boolean afgekapt;
        /** categorie -> {aantal, bytes} */
        public final Map<String, long[]> per = new HashMap<>();

        public boolean ietsGedaan() {
            return aantal > 0 || definitiefVrij > 0;
        }
    }

    public static Uitkomst voerUit(
        File wortel,
        OpruimRegels.Instellingen inst,
        String[] categorieen,
        int bewaarDagen,
        long nu
    ) {
        Uitkomst uit = new Uitkomst();
        if (wortel == null || !wortel.isDirectory()) return uit;

        Set<String> gewenst = new HashSet<>(Arrays.asList(categorieen));
        OpruimPrullenbak bak = new OpruimPrullenbak(wortel);
        String wortelPad = wortel.getAbsolutePath();

        if (!gewenst.isEmpty()) {
            OpruimScanner.Uitkomst gevonden = OpruimScanner.scan(wortel, inst, nu);
            uit.afgekapt = gevonden.afgekapt;
            List<OpruimPrullenbak.Regel> verhuisd = new ArrayList<>();

            for (OpruimScanner.Vondst vondst : gevonden.vondsten) {
                if (!gewenst.contains(vondst.categorie)) continue;

                File bestand = new File(vondst.pad);
                // Nooit buiten de gedeelde opslag, en nooit in de bak zelf.
                if (!bestand.getAbsolutePath().startsWith(wortelPad)
                    || bestand.getAbsolutePath().contains(OpruimPrullenbak.MAP_NAAM)) {
                    uit.mislukt++;
                    continue;
                }

                long vrij = 0;
                boolean gelukt;
                if (vondst.map) {
                    // Een lege map verhuist niet: die valt niet terug te zetten
                    // en neemt geen ruimte in.
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
                    uit.mislukt++;
                    continue;
                }

                uit.aantal++;
                uit.bytes += vrij;
                long[] totaal = uit.per.get(vondst.categorie);
                if (totaal == null) {
                    totaal = new long[] { 0, 0 };
                    uit.per.put(vondst.categorie, totaal);
                }
                totaal[0]++;
                totaal[1] += vrij;
            }

            try {
                bak.noteer(verhuisd);
            } catch (Exception e) {
                // De bestanden staan in de bak; alleen de administratie ontbreekt.
                uit.mislukt += verhuisd.size();
            }
        }

        // Ook als er niets te halen viel: wat lang genoeg in de bak staat mag weg.
        uit.definitiefVrij = bak.wisOuderDan(bewaarDagen, nu);
        return uit;
    }
}
