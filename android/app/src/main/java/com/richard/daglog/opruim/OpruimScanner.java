package com.richard.daglog.opruim;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Doorloopt de gedeelde opslag en verzamelt wat er volgens OpruimRegels weg
 * mag. Ook hier geen android-imports: alleen java.io, zodat de scanner op een
 * gewone map te testen is.
 *
 * De wandeling is begrensd op diepte, aantal bekeken bestanden en tijd — een
 * volle telefoon mag de app niet laten hangen. Wordt een grens geraakt, dan
 * levert de scan gewoon op wat er tot dan toe gevonden is en staat `afgekapt`
 * aan; de volgende ronde gaat verder.
 */
public final class OpruimScanner {

    public static final int MAX_DIEPTE = 24;
    public static final int MAX_BEKEKEN = 300000;
    public static final long MAX_DUUR_MS = 25000L;

    private static final int HASH_BLOK = 256 * 1024;

    /**
     * Beschermde mediamappen lopen we niet af — maar hun miniatuurmap is wél
     * wegwerpmateriaal. In plaats van de bescherming op te rekken zetten we
     * die paar mappen er als apart startpunt bij: gericht, en zonder dat we
     * duizenden foto's hoeven langs te lopen om er te komen.
     */
    private static final String[] MINIATUURMAPPEN = {
        "DCIM/.thumbnails",
        "Pictures/.thumbnails",
        "Movies/.thumbnails",
        "Music/.thumbnails",
    };

    public static final class Vondst {
        public final String pad;
        public final String relatiefPad;
        public final String categorie;
        public final long bytes;
        public final long gewijzigd;
        public final boolean map;

        Vondst(String pad, String relatiefPad, String categorie, long bytes, long gewijzigd, boolean map) {
            this.pad = pad;
            this.relatiefPad = relatiefPad;
            this.categorie = categorie;
            this.bytes = bytes;
            this.gewijzigd = gewijzigd;
            this.map = map;
        }
    }

    public static final class Uitkomst {
        public final List<Vondst> vondsten = new ArrayList<>();
        public int bekeken;
        public boolean afgekapt;

        public long bytes() {
            long som = 0;
            for (Vondst v : vondsten) som += v.bytes;
            return som;
        }
    }

    private static final class Kandidaat {
        final String pad;
        final String relatiefPad;
        final long bytes;
        final long gewijzigd;

        Kandidaat(String pad, String relatiefPad, long bytes, long gewijzigd) {
            this.pad = pad;
            this.relatiefPad = relatiefPad;
            this.bytes = bytes;
            this.gewijzigd = gewijzigd;
        }
    }

    private OpruimScanner() {}

    public static Uitkomst scan(File wortel, OpruimRegels.Instellingen inst, long nu) {
        return scan(wortel, inst, nu, MAX_BEKEKEN, MAX_DUUR_MS);
    }

    public static Uitkomst scan(
        File wortel,
        OpruimRegels.Instellingen inst,
        long nu,
        int maxBekeken,
        long maxDuurMs
    ) {
        Uitkomst uit = new Uitkomst();
        if (wortel == null || !wortel.isDirectory()) return uit;

        long stop = System.currentTimeMillis() + maxDuurMs;
        List<Kandidaat> kandidaten = new ArrayList<>();

        // Breedte-eerst, zodat een afgekapte scan de ondiepe (en meestal
        // interessantste) mappen in elk geval gehad heeft.
        Deque<Object[]> wachtrij = new ArrayDeque<>();
        wachtrij.add(new Object[] { wortel, "", 0 });

        if (inst.thumbnails) {
            for (String pad : MINIATUURMAPPEN) {
                File map = new File(wortel, pad);
                if (map.isDirectory()) wachtrij.add(new Object[] { map, pad, 1 });
            }
        }

        while (!wachtrij.isEmpty()) {
            if (uit.bekeken >= maxBekeken || System.currentTimeMillis() > stop) {
                uit.afgekapt = true;
                break;
            }
            Object[] taak = wachtrij.poll();
            File map = (File) taak[0];
            String rel = (String) taak[1];
            int diepte = (Integer) taak[2];

            File[] kinderen = map.listFiles();
            if (kinderen == null) continue; // onleesbaar — overslaan

            if (kinderen.length == 0 && inst.legeMappen && !rel.isEmpty() && !OpruimRegels.isBeschermd(rel)) {
                uit.vondsten.add(
                    new Vondst(map.getAbsolutePath(), rel, OpruimRegels.CAT_LEGE_MAP, 0, map.lastModified(), true)
                );
                continue;
            }

            for (File kind : kinderen) {
                uit.bekeken++;
                String kindRel = rel.isEmpty() ? kind.getName() : rel + "/" + kind.getName();

                if (kind.isDirectory()) {
                    if (diepte + 1 > MAX_DIEPTE) continue;
                    if (OpruimRegels.slaMapOver(kind.getName())) continue;
                    if (OpruimRegels.isBeschermd(kindRel) && !OpruimRegels.isThumbnails(kindRel)) continue;
                    if (isSnelkoppeling(kind)) continue;
                    wachtrij.add(new Object[] { kind, kindRel, diepte + 1 });
                    continue;
                }
                if (!kind.isFile()) continue;

                long bytes = kind.length();
                long gewijzigd = kind.lastModified();
                String categorie = OpruimRegels.categorieVoorBestand(kindRel, gewijzigd, nu, inst);
                if (categorie != null) {
                    uit.vondsten.add(new Vondst(kind.getAbsolutePath(), kindRel, categorie, bytes, gewijzigd, false));
                    continue;
                }
                if (OpruimRegels.isDuplicaatKandidaat(kindRel, bytes, inst)) {
                    kandidaten.add(new Kandidaat(kind.getAbsolutePath(), kindRel, bytes, gewijzigd));
                }
            }
        }

        if (inst.duplicaten) zoekDuplicaten(kandidaten, uit);
        return uit;
    }

    /**
     * Een map die eigenlijk een snelkoppeling naar elders is, laten we links
     * liggen: anders lopen we dezelfde bestanden dubbel af of belanden we in
     * een kringetje.
     */
    private static boolean isSnelkoppeling(File map) {
        try {
            return !map.getCanonicalPath().equals(map.getAbsolutePath());
        } catch (IOException e) {
            return true; // niet te bepalen = niet aan beginnen
        }
    }

    /**
     * Duplicaten: eerst groeperen op exacte grootte (spotgoedkoop), en alleen
     * binnen zo'n groep een vingerafdruk berekenen. Van elke groep blijft één
     * bestand staan; de rest komt als vondst terug.
     */
    private static void zoekDuplicaten(List<Kandidaat> kandidaten, Uitkomst uit) {
        Map<Long, List<Kandidaat>> perGrootte = new HashMap<>();
        for (Kandidaat k : kandidaten) {
            List<Kandidaat> groep = perGrootte.get(k.bytes);
            if (groep == null) {
                groep = new ArrayList<>();
                perGrootte.put(k.bytes, groep);
            }
            groep.add(k);
        }

        for (List<Kandidaat> groep : perGrootte.values()) {
            if (groep.size() < 2) continue;

            Map<String, List<Kandidaat>> perVingerafdruk = new HashMap<>();
            for (Kandidaat k : groep) {
                String vinger = vingerafdruk(new File(k.pad), k.bytes);
                if (vinger == null) continue;
                List<Kandidaat> zelfde = perVingerafdruk.get(vinger);
                if (zelfde == null) {
                    zelfde = new ArrayList<>();
                    perVingerafdruk.put(vinger, zelfde);
                }
                zelfde.add(k);
            }

            for (List<Kandidaat> zelfde : perVingerafdruk.values()) {
                if (zelfde.size() < 2) continue;
                Kandidaat bewaar = zelfde.get(0);
                for (Kandidaat k : zelfde) {
                    if (OpruimRegels.isBetereBewaarKandidaat(k.relatiefPad, k.gewijzigd, bewaar.relatiefPad, bewaar.gewijzigd)) {
                        bewaar = k;
                    }
                }
                for (Kandidaat k : zelfde) {
                    if (k == bewaar) continue;
                    uit.vondsten.add(
                        new Vondst(k.pad, k.relatiefPad, OpruimRegels.CAT_DUBBEL, k.bytes, k.gewijzigd, false)
                    );
                }
            }
        }
    }

    /**
     * Vingerafdruk van de eerste en laatste 256 kB plus de grootte. Twee
     * bestanden die hierop gelijk zijn én even groot zijn, zijn in de praktijk
     * dezelfde kopie — en we lezen geen hele video's in om dat vast te stellen.
     */
    static String vingerafdruk(File bestand, long bytes) {
        try (RandomAccessFile raf = new RandomAccessFile(bestand, "r")) {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] buffer = new byte[(int) Math.min(HASH_BLOK, Math.max(1, bytes))];

            raf.seek(0);
            int gelezen = raf.read(buffer);
            if (gelezen > 0) md5.update(buffer, 0, gelezen);

            if (bytes > HASH_BLOK) {
                raf.seek(Math.max(0, bytes - HASH_BLOK));
                gelezen = raf.read(buffer);
                if (gelezen > 0) md5.update(buffer, 0, gelezen);
            }
            md5.update(Long.toString(bytes).getBytes("UTF-8"));

            StringBuilder hex = new StringBuilder();
            for (byte b : md5.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return null; // onleesbaar bestand telt niet mee als duplicaat
        }
    }
}
