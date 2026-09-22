package com.richard.daglog.opruim;

import java.util.Locale;

/**
 * De regels: wat is rommel en waar blijven we vanaf.
 *
 * Bewust zonder ook maar één android-import, zodat deze beslissingen los van
 * een telefoon te draaien en te testen zijn. Alles wat met toestemmingen,
 * intents of de Capacitor-brug te maken heeft staat in OpruimPlugin.
 *
 * Uitgangspunt: liever iets laten staan dan iets weggooien. Alles wat ook maar
 * een beetje op eigen materiaal lijkt (camera, documenten, muziek, chat-
 * databases) staat op de beschermlijst en komt nooit in een scan terecht —
 * ongeacht wat er is aangevinkt.
 */
public final class OpruimRegels {

    public static final String CAT_TIJDELIJK = "tijdelijk";
    public static final String CAT_THUMBNAILS = "thumbnails";
    public static final String CAT_LEGE_MAP = "lege-map";
    public static final String CAT_APK = "apk";
    public static final String CAT_DOWNLOAD = "download";
    public static final String CAT_DUBBEL = "dubbel";

    /** Niets dat jonger is dan dit raken we aan, ongeacht de categorie. */
    public static final int MIN_LEEFTIJD_DAGEN = 3;

    /** Onder deze grootte is een duplicaat de moeite van het zoeken niet waard. */
    public static final long DUBBEL_MIN_BYTES = 1024L * 1024L;

    public static final long DAG_MS = 24L * 60L * 60L * 1000L;

    private OpruimRegels() {}

    /** Aan/uit per categorie, met de termijnen die de gebruiker kiest. */
    public static final class Instellingen {
        public boolean tijdelijk = true;
        public boolean thumbnails = true;
        public boolean legeMappen = true;
        public boolean apks = false;
        public boolean downloads = false;
        public boolean duplicaten = false;
        public int apkDagen = 30;
        public int downloadDagen = 90;
    }

    /**
     * Mappen waar we niet in kijken. Paden zijn relatief aan de wortel van de
     * gedeelde opslag, met / als scheidingsteken en in kleine letters.
     */
    private static final String[] BESCHERMDE_MAPPEN = {
        "android", // op Android 11+ toch afgeschermd, en vol met app-data
        "dcim",
        "pictures",
        "movies",
        "music",
        "documents",
        "recordings",
        "audiobooks",
        "signal",
        "threema",
        "backups",
        "titaniumbackup",
        "seedvault",
        "obb",
        "opruim-prullenbak", // onze eigen prullenbak beheren we apart
    };

    /**
     * Uitzonderingen binnen een beschermde map: miniaturen zijn overal
     * afvalbestanden die zichzelf opnieuw aanmaken.
     */
    private static final String THUMBNAILS = ".thumbnails";

    private static final String[] TIJDELIJKE_EXTENSIES = {
        ".tmp", ".temp", ".part", ".partial", ".crdownload", ".download", ".log", ".dmp",
    };

    private static final String[] APK_EXTENSIES = { ".apk", ".apks", ".xapk", ".apkm" };

    public static String normaliseer(String pad) {
        String schoon = pad.replace('\\', '/');
        while (schoon.startsWith("/")) schoon = schoon.substring(1);
        while (schoon.endsWith("/")) schoon = schoon.substring(0, schoon.length() - 1);
        return schoon.toLowerCase(Locale.ROOT);
    }

    private static String eersteDeel(String relatiefPad) {
        String rel = normaliseer(relatiefPad);
        int schuin = rel.indexOf('/');
        return schuin < 0 ? rel : rel.substring(0, schuin);
    }

    /** Zit dit pad in een .thumbnails-map (of ís het er een)? */
    public static boolean isThumbnails(String relatiefPad) {
        String rel = normaliseer(relatiefPad);
        return rel.equals(THUMBNAILS) || rel.startsWith(THUMBNAILS + "/") || rel.contains("/" + THUMBNAILS);
    }

    /**
     * Beschermd pad: hier komt geen enkele categorie aan. Miniaturen zijn de
     * enige uitzondering — die mogen ook binnen DCIM of Pictures weg.
     */
    public static boolean isBeschermd(String relatiefPad) {
        String rel = normaliseer(relatiefPad);
        if (rel.isEmpty()) return true;
        if (isThumbnails(rel)) return false;
        String top = eersteDeel(rel);
        for (String map : BESCHERMDE_MAPPEN) {
            if (top.equals(map)) return true;
        }
        return false;
    }

    /**
     * Verborgen mappen slaan we over: daar zit app-eigen administratie in die
     * er van buitenaf onschuldig uitziet. Miniaturen weer uitgezonderd.
     */
    public static boolean slaMapOver(String mapNaam) {
        String naam = mapNaam.toLowerCase(Locale.ROOT);
        if (naam.equals(THUMBNAILS)) return false;
        return naam.startsWith(".");
    }

    public static boolean heeftExtensie(String naam, String[] extensies) {
        String klein = naam.toLowerCase(Locale.ROOT);
        for (String ext : extensies) {
            if (klein.endsWith(ext)) return true;
        }
        return false;
    }

    /** Is dit bestand oud genoeg om überhaupt in aanmerking te komen? */
    public static boolean oudGenoeg(long gewijzigdOp, long nu, int dagen) {
        if (gewijzigdOp <= 0) return false; // onbekende datum = met rust laten
        return nu - gewijzigdOp >= dagen * DAG_MS;
    }

    /**
     * De categorie waarin dit bestand valt, of null als het mag blijven staan.
     *
     * @param relatiefPad pad vanaf de wortel van de gedeelde opslag
     * @param gewijzigdOp millisecondes sinds 1970, 0 als onbekend
     */
    public static String categorieVoorBestand(
        String relatiefPad,
        long gewijzigdOp,
        long nu,
        Instellingen inst
    ) {
        String rel = normaliseer(relatiefPad);
        if (rel.isEmpty()) return null;
        if (isBeschermd(rel)) return null;
        if (!oudGenoeg(gewijzigdOp, nu, MIN_LEEFTIJD_DAGEN)) return null;

        String naam = rel.substring(rel.lastIndexOf('/') + 1);
        String top = eersteDeel(rel);

        if (inst.thumbnails && isThumbnails(rel)) return CAT_THUMBNAILS;
        if (inst.tijdelijk && heeftExtensie(naam, TIJDELIJKE_EXTENSIES)) return CAT_TIJDELIJK;

        boolean inDownload = top.equals("download") || top.equals("downloads");
        if (inDownload && inst.apks && heeftExtensie(naam, APK_EXTENSIES)) {
            if (oudGenoeg(gewijzigdOp, nu, inst.apkDagen)) return CAT_APK;
        }
        if (inDownload && inst.downloads && oudGenoeg(gewijzigdOp, nu, inst.downloadDagen)) {
            return CAT_DOWNLOAD;
        }
        return null;
    }

    /**
     * Komt dit bestand in aanmerking als duplicaat-kandidaat? Alleen grote
     * bestanden buiten de beschermde mappen — zo blijft het zoeken snel en
     * blijven je foto's en documenten er sowieso buiten.
     */
    public static boolean isDuplicaatKandidaat(String relatiefPad, long bytes, Instellingen inst) {
        if (!inst.duplicaten) return false;
        if (bytes < DUBBEL_MIN_BYTES) return false;
        return !isBeschermd(relatiefPad);
    }

    /**
     * Welke van twee gelijke bestanden houden we? De oudste wint (dat is
     * doorgaans het origineel); bij gelijke leeftijd het kortste pad, want een
     * kopie zit meestal dieper weggestopt.
     */
    public static boolean isBetereBewaarKandidaat(
        String padA,
        long gewijzigdA,
        String padB,
        long gewijzigdB
    ) {
        if (gewijzigdA != gewijzigdB) return gewijzigdA < gewijzigdB;
        if (padA.length() != padB.length()) return padA.length() < padB.length();
        return padA.compareTo(padB) <= 0;
    }
}
