package com.richard.daglog.opruim;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * De prullenbak op de opslag zelf: opgeruimde bestanden verhuizen naar
 * <opslag>/Opruim-prullenbak en worden pas na een aantal dagen echt gewist.
 * Zo is "weg" altijd nog een dag of zeven terug te halen.
 *
 * De administratie staat in index.tsv naast de bestanden: één regel per item
 * met tijdstip, het oorspronkelijke pad, de naam in de bak en de omvang.
 * Tabs en regeleindes in een pad worden ontweken, zodat één regel ook echt
 * één item blijft. Geen android-imports, dus lokaal te testen — en bewust
 * klassieke java.io: java.nio.file bestaat pas vanaf Android 8 en deze app
 * draait vanaf Android 7.
 */
public final class OpruimPrullenbak {

    public static final String MAP_NAAM = "Opruim-prullenbak";
    private static final String INDEX = "index.tsv";
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private final File bak;

    public OpruimPrullenbak(File opslagWortel) {
        this.bak = new File(opslagWortel, MAP_NAAM);
    }

    public File map() {
        return bak;
    }

    public static final class Regel {
        public final long verwijderdOp;
        public final String origineelPad;
        public final String bakNaam;
        public final long bytes;

        public Regel(long verwijderdOp, String origineelPad, String bakNaam, long bytes) {
            this.verwijderdOp = verwijderdOp;
            this.origineelPad = origineelPad;
            this.bakNaam = bakNaam;
            this.bytes = bytes;
        }

        public String naam() {
            int schuin = origineelPad.lastIndexOf('/');
            return schuin < 0 ? origineelPad : origineelPad.substring(schuin + 1);
        }
    }

    // ----------------------------------------------------------------------
    // Administratie
    // ----------------------------------------------------------------------

    static String ontwijk(String tekst) {
        return tekst.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r");
    }

    static String herstel(String tekst) {
        StringBuilder uit = new StringBuilder();
        for (int i = 0; i < tekst.length(); i++) {
            char c = tekst.charAt(i);
            if (c != '\\' || i + 1 >= tekst.length()) {
                uit.append(c);
                continue;
            }
            char volgende = tekst.charAt(++i);
            if (volgende == 't') uit.append('\t');
            else if (volgende == 'n') uit.append('\n');
            else if (volgende == 'r') uit.append('\r');
            else if (volgende == '\\') uit.append('\\');
            else uit.append(volgende);
        }
        return uit.toString();
    }

    public List<Regel> lijst() {
        List<Regel> regels = new ArrayList<>();
        File index = new File(bak, INDEX);
        if (!index.isFile()) return regels;
        try (
            BufferedReader lezer = new BufferedReader(new InputStreamReader(new FileInputStream(index), UTF8))
        ) {
            String regel;
            while ((regel = lezer.readLine()) != null) {
                if (regel.trim().isEmpty()) continue;
                String[] delen = regel.split("\t", -1);
                if (delen.length < 4) continue;
                try {
                    regels.add(
                        new Regel(
                            Long.parseLong(delen[0]),
                            herstel(delen[1]),
                            herstel(delen[2]),
                            Long.parseLong(delen[3])
                        )
                    );
                } catch (NumberFormatException e) {
                    // onleesbare regel overslaan; de rest blijft bruikbaar
                }
            }
        } catch (IOException e) {
            return regels;
        }
        Collections.sort(regels, new Comparator<Regel>() {
            @Override
            public int compare(Regel a, Regel b) {
                return Long.compare(b.verwijderdOp, a.verwijderdOp);
            }
        });
        return regels;
    }

    private void schrijfIndex(List<Regel> regels) throws IOException {
        if (!bak.isDirectory() && !bak.mkdirs()) throw new IOException("kan de prullenbak niet aanmaken");
        StringBuilder uit = new StringBuilder();
        for (Regel r : regels) {
            uit
                .append(r.verwijderdOp)
                .append('\t')
                .append(ontwijk(r.origineelPad))
                .append('\t')
                .append(ontwijk(r.bakNaam))
                .append('\t')
                .append(r.bytes)
                .append('\n');
        }
        try (
            Writer schrijver = new OutputStreamWriter(new FileOutputStream(new File(bak, INDEX)), UTF8)
        ) {
            schrijver.write(uit.toString());
        }
    }

    public long omvang() {
        long som = 0;
        for (Regel r : lijst()) som += r.bytes;
        return som;
    }

    // ----------------------------------------------------------------------
    // Verplaatsen, terugzetten, legen
    // ----------------------------------------------------------------------

    /** Verzint een naam die nog vrij is in de bak. */
    private String vrijeNaam(String bestandsnaam, long nu) {
        String schoon = bestandsnaam.replace('/', '_').replace('\\', '_');
        String kandidaat = nu + "-" + schoon;
        int teller = 1;
        while (new File(bak, kandidaat).exists()) {
            kandidaat = nu + "-" + (teller++) + "-" + schoon;
        }
        return kandidaat;
    }

    /**
     * Verhuist één bestand naar de bak. Lukt hernoemen niet (bijvoorbeeld over
     * een volumegrens heen), dan kopiëren we en verwijderen we het origineel.
     * Geeft de regel terug, of null als het bestand niet weg kon.
     */
    public Regel verplaats(File bron, long nu) {
        if (bron == null || !bron.isFile()) return null;
        if (!bak.isDirectory() && !bak.mkdirs()) return null;

        long bytes = bron.length();
        String bakNaam = vrijeNaam(bron.getName(), nu);
        File doel = new File(bak, bakNaam);

        if (!bron.renameTo(doel)) {
            if (!kopieer(bron, doel)) return null;
            if (!bron.delete()) {
                doel.delete(); // origineel bleef staan: geen halve verhuizing achterlaten
                return null;
            }
        }
        return new Regel(nu, bron.getAbsolutePath(), bakNaam, bytes);
    }

    /** Voegt regels toe aan de index; doen we één keer na een hele ronde. */
    public void noteer(List<Regel> nieuwe) throws IOException {
        if (nieuwe.isEmpty()) return;
        List<Regel> alles = lijst();
        alles.addAll(nieuwe);
        schrijfIndex(alles);
    }

    /**
     * Zet één item terug op zijn oorspronkelijke plek. Staat daar inmiddels
     * weer iets, dan komt het ernaast te staan in plaats van eroverheen.
     */
    public boolean zetTerug(String bakNaam) {
        List<Regel> alles = lijst();
        Regel gezocht = null;
        for (Regel r : alles) {
            if (r.bakNaam.equals(bakNaam)) {
                gezocht = r;
                break;
            }
        }
        if (gezocht == null) return false;

        File bron = new File(bak, gezocht.bakNaam);
        if (!bron.isFile()) {
            alles.remove(gezocht);
            try {
                schrijfIndex(alles);
            } catch (IOException e) {
                /* administratie mag falen, het bestand is er toch niet meer */
            }
            return false;
        }

        File doel = new File(gezocht.origineelPad);
        File ouder = doel.getParentFile();
        if (ouder != null && !ouder.isDirectory() && !ouder.mkdirs()) return false;
        if (doel.exists()) doel = vrijVariant(doel);

        if (!bron.renameTo(doel)) {
            if (!kopieer(bron, doel)) return false;
            bron.delete();
        }
        alles.remove(gezocht);
        try {
            schrijfIndex(alles);
        } catch (IOException e) {
            return true; // terug is terug; de index loopt hooguit achter
        }
        return true;
    }

    private static File vrijVariant(File doel) {
        String naam = doel.getName();
        int punt = naam.lastIndexOf('.');
        String basis = punt > 0 ? naam.substring(0, punt) : naam;
        String ext = punt > 0 ? naam.substring(punt) : "";
        for (int i = 1; i < 1000; i++) {
            File kandidaat = new File(doel.getParentFile(), basis + " (" + i + ")" + ext);
            if (!kandidaat.exists()) return kandidaat;
        }
        return new File(doel.getParentFile(), basis + "-" + System.currentTimeMillis() + ext);
    }

    /** Wist alles wat langer dan `dagen` in de bak staat. */
    public long wisOuderDan(int dagen, long nu) {
        long grens = nu - dagen * OpruimRegels.DAG_MS;
        List<Regel> alles = lijst();
        List<Regel> blijft = new ArrayList<>();
        long vrij = 0;
        for (Regel r : alles) {
            if (r.verwijderdOp < grens) {
                File bestand = new File(bak, r.bakNaam);
                if (!bestand.exists() || bestand.delete()) {
                    vrij += r.bytes;
                    continue;
                }
            }
            blijft.add(r);
        }
        if (blijft.size() != alles.size()) {
            try {
                schrijfIndex(blijft);
            } catch (IOException e) {
                /* volgende ronde opnieuw */
            }
        }
        return vrij;
    }

    /** Maakt de bak in één keer leeg. */
    public long leeg() {
        long vrij = 0;
        for (Regel r : lijst()) {
            File bestand = new File(bak, r.bakNaam);
            if (!bestand.exists() || bestand.delete()) vrij += r.bytes;
        }
        try {
            schrijfIndex(new ArrayList<Regel>());
        } catch (IOException e) {
            /* index blijft staan; de bestanden zijn weg */
        }
        return vrij;
    }

    private static boolean kopieer(File bron, File doel) {
        try (InputStream in = new FileInputStream(bron); OutputStream uit = new FileOutputStream(doel)) {
            byte[] buffer = new byte[64 * 1024];
            int gelezen;
            while ((gelezen = in.read(buffer)) > 0) uit.write(buffer, 0, gelezen);
            return true;
        } catch (IOException e) {
            doel.delete();
            return false;
        }
    }
}
