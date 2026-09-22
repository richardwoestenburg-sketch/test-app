// Brug naar de Android-laag van Opruimen (fase 2).
//
// De app draait als PWA én als Capacitor-app. Alleen in dat tweede geval
// bestaat de plugin `Opruim`, die de gedeelde opslag mag doorzoeken. We praten
// bewust via `window.Capacitor.Plugins` in plaats van een import: zo hoeft er
// in de webbuild niets van Capacitor mee, en blijft dit bestand in een gewone
// browser volledig stil (nativeBeschikbaar() is dan simpelweg false).
//
// De categoriesleutels hieronder zijn exact de constantes uit
// OpruimRegels.java — één naam voor hetzelfde ding aan beide kanten.

const PLUGIN = "Opruim";

export const NATIVE_BRONNEN = [
  {
    key: "tijdelijk",
    naam: "Tijdelijke bestanden",
    uitleg: "Halve downloads, .tmp- en logbestanden van apps. Alleen ouder dan 3 dagen.",
    dagen: null,
    standaardAan: true,
    terugzetbaar: true,
    native: true,
  },
  {
    key: "thumbnails",
    naam: "Miniatuur-caches",
    uitleg: "De .thumbnails-mappen bij je foto's en video's. Maken zichzelf opnieuw aan.",
    dagen: null,
    standaardAan: true,
    terugzetbaar: true,
    native: true,
  },
  {
    key: "lege-map",
    naam: "Lege mappen",
    uitleg: "Mappen die achterblijven na het verwijderen van een app of bestand.",
    dagen: null,
    standaardAan: true,
    terugzetbaar: false,
    native: true,
  },
  {
    key: "apk",
    naam: "Oude installatiebestanden",
    uitleg: "APK's in je Downloads. Staat uit — zet 'm aan als je ze niet bewaart.",
    dagen: [7, 30, 90],
    standaardDagen: 30,
    standaardAan: false,
    terugzetbaar: true,
    native: true,
  },
  {
    key: "download",
    naam: "Oude downloads",
    uitleg: "Alles in je Downloads-map ouder dan de gekozen termijn. Staat uit.",
    dagen: [30, 90, 180, 365],
    standaardDagen: 90,
    standaardAan: false,
    terugzetbaar: true,
    native: true,
  },
  {
    key: "dubbel",
    naam: "Dubbele bestanden",
    uitleg: "Identieke kopieën groter dan 1 MB (zoals doorgestuurde video's). Het oudste exemplaar blijft staan.",
    dagen: null,
    standaardAan: false,
    terugzetbaar: true,
    native: true,
  },
];

function brug() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
    return cap.Plugins?.[PLUGIN] || null;
  } catch {
    return null;
  }
}

export function nativeBeschikbaar() {
  return !!brug();
}

/** Vertaalt de instellingen van de app naar wat de plugin verwacht. */
export function nativePayload(instellingen) {
  const aan = (key) => !!instellingen.bronnen?.[key]?.aan;
  const dagen = (key, standaard) => instellingen.bronnen?.[key]?.dagen ?? standaard;
  return {
    tijdelijk: aan("tijdelijk"),
    thumbnails: aan("thumbnails"),
    legeMappen: aan("lege-map"),
    apks: aan("apk"),
    downloads: aan("download"),
    duplicaten: aan("dubbel"),
    apkDagen: dagen("apk", 30),
    downloadDagen: dagen("download", 90),
  };
}

export async function nativeStatus() {
  const plugin = brug();
  if (!plugin) return null;
  try {
    return await plugin.status();
  } catch {
    return null;
  }
}

export async function vraagNativeToestemming() {
  const plugin = brug();
  if (!plugin) return false;
  try {
    const uit = await plugin.vraagToestemming();
    return !!uit?.toestemming;
  } catch {
    return false;
  }
}

export async function nativeScan(instellingen) {
  const plugin = brug();
  if (!plugin) return null;
  return await plugin.scan(nativePayload(instellingen));
}

/**
 * Opruimen gaat per categorie, niet per pad: een scan geeft hooguit een paar
 * honderd voorbeelden terug, en anders zou van een volle telefoon maar een
 * deel worden opgeruimd.
 */
export async function nativeRuimOp(categorieen, instellingen) {
  const plugin = brug();
  if (!plugin) return null;
  return await plugin.ruimOp({ ...nativePayload(instellingen), categorieen });
}

export async function nativePrullenbak() {
  const plugin = brug();
  if (!plugin) return [];
  try {
    const uit = await plugin.prullenbak();
    return uit?.items || [];
  } catch {
    return [];
  }
}

export async function nativeZetTerug(bakNaam) {
  const plugin = brug();
  if (!plugin) return false;
  try {
    const uit = await plugin.zetTerug({ bakNaam });
    return !!uit?.gelukt;
  } catch {
    return false;
  }
}

export async function nativeLeegPrullenbak() {
  const plugin = brug();
  if (!plugin) return 0;
  try {
    const uit = await plugin.leegPrullenbak();
    return uit?.bytes || 0;
  } catch {
    return 0;
  }
}
