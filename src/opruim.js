// Opruimen: alle rommel die Daglog zelf opbouwt in één druk op de knop weg.
//
// In de browser ruimt deze module op wat de app zelf opbouwt: de eigen
// IndexedDB-opslag (vakantiefoto's, 3D-renders, stemfragmenten), verlopen
// API-caches in localStorage en oude offline-caches van de service worker.
//
// Draait de app als Android-app, dan komen daar de bronnen van opruimNative.js
// bij: rommel op de gedeelde opslag van de telefoon. Die bronnen scannen en
// ruimen in één keer op via de plugin, dus ze krijgen hier een eigen route.
// Caches van ándere apps blijven buiten bereik — dat kan geen app zonder
// systeemrechten.
//
// Twee vangnetten, omdat opruimen onomkeerbaar voelt:
//  1. Droogloop — de knop toont eerst wat er weg zou gaan (instelling
//     `bevestigen`, staat aan tot de eerste geslaagde ronde).
//  2. Prullenbak — alles wat terug te zetten is verhuist naar een eigen
//     IndexedDB-store en wordt pas na TRASH_DAGEN echt gewist.

import {
  NATIVE_BRONNEN,
  nativeBeschikbaar,
  nativeScan,
  nativeRuimOp,
  nativePrullenbak,
  nativeZetTerug,
  nativeLeegPrullenbak,
  bewaarNativeVoorkeuren,
} from "./opruimNative.js";

const INSTELLINGEN_KEY = "opruim-instellingen-v1";
const LOG_KEY = "opruim-log-v1";
const AUTO_KEY = "opruim-laatste-auto";

const DB_NAAM = "opruim-db";
const DB_VERSIE = 1;
const PRULLENBAK = "prullenbak";

const DAG_MS = 24 * 60 * 60 * 1000;

// Hoe lang een verwijderd item in de prullenbak blijft staan.
export const TRASH_DAGEN = 7;

// Een automatische ronde draait hooguit één keer per etmaal; met wat marge,
// zodat "elke ochtend bij het openen" niet net een dag overslaat.
const AUTO_INTERVAL_MS = 20 * 60 * 60 * 1000;

const LOG_MAX = 30;

// ---------------------------------------------------------------------------
// Bronnen: wat er te halen valt
// ---------------------------------------------------------------------------

// `dagen` = keuzelijst voor "ouder dan"; 0 betekent "ongeacht ouderdom".
// `terugzetbaar` bepaalt of een item via de prullenbak terug kan komen.
const WEB_BRONNEN = [
  {
    key: "sw-cache",
    naam: "Oude offline-caches",
    uitleg: "Bestanden van een vorige versie van de app. Worden vanzelf opnieuw opgehaald.",
    dagen: null,
    standaardAan: true,
    terugzetbaar: false,
  },
  {
    key: "flitsers-cache",
    naam: "Flitsers-kaartcache",
    uitleg: "Camera's en trajectcontroles uit OpenStreetMap. Haalt zichzelf opnieuw op tijdens het rijden.",
    dagen: [0, 1, 7, 30],
    standaardDagen: 7,
    standaardAan: true,
    terugzetbaar: false,
  },
  {
    key: "afbeeldingen",
    naam: "3D-renders",
    uitleg: "Gegenereerde afbeeldingen uit de Afbeeldingen-app.",
    dagen: [7, 30, 90, 180, 365],
    standaardDagen: 90,
    standaardAan: true,
    terugzetbaar: true,
  },
  {
    key: "stem",
    naam: "Stemfragmenten",
    uitleg: "Opgenomen en voorgelezen fragmenten uit de Stem-app.",
    dagen: [7, 30, 90, 180, 365],
    standaardDagen: 90,
    standaardAan: true,
    terugzetbaar: true,
  },
  {
    key: "vakantie",
    naam: "Vakantiefoto's",
    uitleg: "Foto's uit de Vakantie-tijdlijn. Staat uit: dit zijn herinneringen, geen rommel.",
    dagen: [90, 180, 365, 730],
    standaardDagen: 365,
    standaardAan: false,
    terugzetbaar: true,
  },
  {
    key: "prullenbak",
    naam: "Prullenbak legen",
    uitleg: `Eerder opgeruimde items definitief wissen na ${TRASH_DAGEN} dagen.`,
    dagen: null,
    standaardAan: true,
    terugzetbaar: false,
    altijd: true, // draait ook mee als je 'm uitzet — anders groeit de prullenbak eindeloos
  },
];

// De native bronnen staan altijd in de lijst (zodat instellingen bewaard
// blijven), maar worden alleen gescand als de app echt op Android draait.
export const BRONNEN = [...WEB_BRONNEN, ...NATIVE_BRONNEN];

export function vindBron(key) {
  return BRONNEN.find((b) => b.key === key) || null;
}

// ---------------------------------------------------------------------------
// Instellingen & logboek (localStorage)
// ---------------------------------------------------------------------------

function standaardInstellingen() {
  const bronnen = {};
  for (const bron of BRONNEN) {
    bronnen[bron.key] = {
      aan: bron.standaardAan,
      dagen: bron.standaardDagen ?? 0,
    };
  }
  return { bevestigen: true, automatisch: true, bronnen };
}

export function laadInstellingen() {
  const basis = standaardInstellingen();
  try {
    const raw = localStorage.getItem(INSTELLINGEN_KEY);
    if (!raw) return basis;
    const opgeslagen = JSON.parse(raw);
    const bronnen = { ...basis.bronnen };
    for (const [key, waarde] of Object.entries(opgeslagen.bronnen || {})) {
      if (bronnen[key]) bronnen[key] = { ...bronnen[key], ...waarde };
    }
    return { ...basis, ...opgeslagen, bronnen };
  } catch {
    return basis;
  }
}

export function bewaarInstellingen(deel) {
  const volgende = { ...laadInstellingen(), ...deel };
  try {
    localStorage.setItem(INSTELLINGEN_KEY, JSON.stringify(volgende));
  } catch {
    /* opslag geblokkeerd — instelling geldt dan alleen deze sessie */
  }
  // De tegel, de widget en de nachtronde lezen hun eigen kopie: bijwerken dus,
  // anders ruimen die straks op volgens gisteren. Lukt het niet, dan blijft de
  // app gewoon werken — de vorige kopie blijft dan staan.
  if (nativeBeschikbaar()) bewaarNativeVoorkeuren(volgende).catch(() => {});
  return volgende;
}

export function bewaarBronInstelling(key, deel) {
  const huidig = laadInstellingen();
  return bewaarInstellingen({
    bronnen: { ...huidig.bronnen, [key]: { ...huidig.bronnen[key], ...deel } },
  });
}

export function laadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const lijst = raw ? JSON.parse(raw) : [];
    return Array.isArray(lijst) ? lijst : [];
  } catch {
    return [];
  }
}

function schrijfLog(regel) {
  const lijst = [regel, ...laadLog()].slice(0, LOG_MAX);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(lijst));
  } catch {
    /* vol of geblokkeerd — het logboek is een extraatje, geen data */
  }
  return lijst;
}

export function wisLog() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* niets aan te doen */
  }
  return [];
}

export function laatsteRonde() {
  return laadLog()[0] || null;
}

// ---------------------------------------------------------------------------
// IndexedDB-helpers
// ---------------------------------------------------------------------------

// De database van een andere module openen zónder versienummer: zo volgen we
// de versie die de eigenaar (vakantie.js, images3d.js, voice.js) zelf heeft
// gezet en lokken we nooit een upgrade uit.
//
// Eén valkuil: een versieloze open maakt een niet-bestaande database alsnog
// aan — leeg, zónder object-store. De eigenaar-module opent daarna met
// versie 1, krijgt geen upgrade meer en zou haar eigen store kwijt zijn. Dus:
// merken we aan `onupgradeneeded` dat we 'm net zelf hebben gemaakt, dan gooien
// we 'm meteen weer weg en valt er simpelweg niets op te ruimen.
function openBestaandeDb(naam) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(naam);
    } catch (e) {
      reject(e);
      return;
    }
    let netAangemaakt = false;
    req.onupgradeneeded = () => {
      netAangemaakt = true;
    };
    req.onsuccess = () => {
      const db = req.result;
      if (netAangemaakt) {
        db.close();
        try {
          indexedDB.deleteDatabase(naam);
        } catch {
          /* laat 'm dan staan — leeg en ongebruikt */
        }
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("database is in gebruik"));
  });
}

// Onze eigen prullenbak-database mogen we wél aanmaken.
function openEigenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAAM, DB_VERSIE);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRULLENBAK)) {
        db.createObjectStore(PRULLENBAK, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("database is in gebruik"));
  });
}

// Voert één transactie uit. Geeft `fn` een request terug, dan vangen we de
// uitkomst op zodra die binnen is en leveren we 'm pas als de transactie
// helemaal rond is — anders hebben we een resultaat van een transactie die
// alsnog kon afbreken.
function voerUit(db, store, modus, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modus);
    let waarde = null;
    const req = fn(tx.objectStore(store));
    if (req && typeof req === "object" && "onsuccess" in req) {
      req.onsuccess = () => {
        waarde = req.result;
      };
    }
    tx.oncomplete = () => resolve(waarde);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function metStore(naam, store, modus, fn) {
  let db;
  try {
    db = await openBestaandeDb(naam);
  } catch {
    return null;
  }
  if (!db) return null;
  if (!db.objectStoreNames.contains(store)) {
    db.close();
    return null;
  }
  try {
    return await voerUit(db, store, modus, fn);
  } finally {
    db.close();
  }
}

async function leesAlles(naam, store) {
  return (await metStore(naam, store, "readonly", (os) => os.getAll())) || [];
}

async function leesRecord(naam, store, id) {
  return await metStore(naam, store, "readonly", (os) => os.get(id));
}

async function verwijderRecords(naam, store, ids) {
  await metStore(naam, store, "readwrite", (os) => {
    for (const id of ids) os.delete(id);
  });
}

async function schrijfRecord(naam, store, record) {
  await metStore(naam, store, "readwrite", (os) => {
    os.put(record);
  });
}

async function metPrullenbak(modus, fn) {
  const db = await openEigenDb();
  try {
    return await voerUit(db, PRULLENBAK, modus, fn);
  } finally {
    db.close();
  }
}

export async function leesPrullenbak() {
  try {
    const lijst = (await metPrullenbak("readonly", (os) => os.getAll())) || [];
    return lijst.sort((a, b) => b.verwijderdOp - a.verwijderdOp);
  } catch {
    return [];
  }
}

async function naarPrullenbak(regels) {
  if (!regels.length) return;
  await metPrullenbak("readwrite", (os) => {
    for (const regel of regels) os.put(regel);
  });
}

// ---------------------------------------------------------------------------
// Gemeenschappelijke rekenhulp
// ---------------------------------------------------------------------------

// Ruwe schatting van hoeveel een record in beslag neemt: blobs tellen exact
// mee, tekst per teken, de rest als een handvol bytes. Genoeg om "hoeveel heb
// ik vrijgemaakt" eerlijk te tonen zonder alles te serialiseren.
function recordBytes(record) {
  let bytes = 0;
  for (const waarde of Object.values(record || {})) {
    if (waarde instanceof Blob) bytes += waarde.size;
    else if (typeof waarde === "string") bytes += waarde.length;
    else if (waarde != null) bytes += 8;
  }
  return bytes;
}

// Tijdstip van een record. Onbekend = nooit opruimen; liever iets laten staan
// dan iets weggooien waarvan we de leeftijd niet kennen.
function tijdstipVan(record) {
  const t = record?.timestamp;
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) return ms;
  }
  // Alle modules beginnen hun id met Date.now(), dus dat is een prima reserve.
  const uitId = Number.parseInt(String(record?.id || ""), 10);
  if (Number.isFinite(uitId) && uitId > 1e12) return uitId;
  return null;
}

export function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fmtDatum(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function opslagInfo() {
  try {
    if (!navigator.storage?.estimate) return null;
    const schatting = await navigator.storage.estimate();
    if (!schatting?.quota) return null;
    return { gebruikt: schatting.usage || 0, quota: schatting.quota };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// De bronnen zelf
// ---------------------------------------------------------------------------

// Een IndexedDB-bron van een andere module: records ouder dan `dagen` gaan via
// de prullenbak weg.
function idbBron({ dbNaam, store, label }) {
  return {
    async scan(dagen) {
      const grens = Date.now() - (dagen || 0) * DAG_MS;
      const records = await leesAlles(dbNaam, store);
      const gevonden = [];
      for (const record of records) {
        const tijd = tijdstipVan(record);
        if (tijd == null || tijd >= grens) continue;
        gevonden.push({ id: record.id, bytes: recordBytes(record), tijd, label: label(record) });
      }
      return gevonden.sort((a, b) => a.tijd - b.tijd);
    },
    async ruimOp(items, bronKey) {
      const naarBak = [];
      for (const item of items) {
        const record = await leesRecord(dbNaam, store, item.id);
        if (!record) continue;
        naarBak.push({
          id: `${bronKey}:${item.id}`,
          bron: bronKey,
          dbNaam,
          store,
          record,
          bytes: item.bytes,
          label: item.label,
          verwijderdOp: Date.now(),
        });
      }
      await naarPrullenbak(naarBak);
      await verwijderRecords(dbNaam, store, naarBak.map((r) => r.record.id));
      return naarBak.length;
    },
  };
}

function korteTekst(tekst, max = 48) {
  const schoon = String(tekst || "").replace(/\s+/g, " ").trim();
  if (!schoon) return "";
  return schoon.length > max ? `${schoon.slice(0, max - 1)}…` : schoon;
}

// Alleen onze eigen offline-caches aanraken (daglog-v1, daglog-v2, …) en
// altijd de hoogste versie laten staan: dat is degene die de app nu gebruikt.
function verouderdeCaches(namen) {
  const eigen = [];
  for (const naam of namen) {
    const match = /^daglog-v(\d+)$/.exec(naam);
    if (match) eigen.push({ naam, versie: Number(match[1]) });
  }
  if (eigen.length < 2) return [];
  const hoogste = Math.max(...eigen.map((c) => c.versie));
  return eigen.filter((c) => c.versie !== hoogste).map((c) => c.naam);
}

async function cacheBytes(cache) {
  let bytes = 0;
  const requests = await cache.keys();
  for (const request of requests) {
    try {
      const res = await cache.match(request);
      if (!res) continue;
      const lengte = res.headers.get("content-length");
      if (lengte) bytes += Number(lengte) || 0;
      else bytes += (await res.clone().blob()).size;
    } catch {
      /* onleesbaar item — telt als 0, het wordt straks toch gewist */
    }
  }
  return { bytes, aantal: requests.length };
}

const SCANNERS = {
  "sw-cache": {
    async scan() {
      if (typeof caches === "undefined") return [];
      const oud = verouderdeCaches(await caches.keys());
      const gevonden = [];
      for (const naam of oud) {
        try {
          const cache = await caches.open(naam);
          const { bytes, aantal } = await cacheBytes(cache);
          gevonden.push({ id: naam, bytes, tijd: null, label: `${naam} · ${aantal} bestanden` });
        } catch {
          gevonden.push({ id: naam, bytes: 0, tijd: null, label: naam });
        }
      }
      return gevonden;
    },
    async ruimOp(items) {
      let aantal = 0;
      for (const item of items) {
        if (await caches.delete(item.id)) aantal += 1;
      }
      return aantal;
    },
  },

  "flitsers-cache": {
    async scan(dagen) {
      const raw = localStorage.getItem("flitsers-osm-v2");
      if (!raw) return [];
      let opgehaald = null;
      let aantal = 0;
      try {
        const data = JSON.parse(raw);
        opgehaald = data?.fetchedAt || null;
        aantal = (data?.cameras?.length || 0) + (data?.sections?.length || 0);
      } catch {
        /* onleesbaar — juist een reden om 'm op te ruimen */
      }
      if (dagen && opgehaald && Date.now() - opgehaald < dagen * DAG_MS) return [];
      return [
        {
          id: "flitsers-osm-v2",
          bytes: raw.length,
          tijd: opgehaald,
          label: aantal ? `${aantal} camera's en trajecten` : "kaartcache",
        },
      ];
    },
    async ruimOp(items) {
      for (const item of items) localStorage.removeItem(item.id);
      return items.length;
    },
  },

  afbeeldingen: idbBron({
    dbNaam: "images3d-db",
    store: "images",
    label: (r) => korteTekst(r.prompt) || "render",
  }),

  stem: idbBron({
    dbNaam: "voice-db",
    store: "clips",
    label: (r) => korteTekst(r.text) || "fragment",
  }),

  vakantie: idbBron({
    dbNaam: "vakantie-db",
    store: "photos",
    label: (r) => korteTekst(r.caption) || `foto van ${r.date || "onbekende datum"}`,
  }),

  prullenbak: {
    async scan() {
      const grens = Date.now() - TRASH_DAGEN * DAG_MS;
      const regels = await leesPrullenbak();
      return regels
        .filter((regel) => regel.verwijderdOp < grens)
        .map((regel) => ({
          id: regel.id,
          bytes: regel.bytes || recordBytes(regel.record),
          tijd: regel.verwijderdOp,
          label: regel.label || regel.bron,
        }));
    },
    async ruimOp(items) {
      await metPrullenbak("readwrite", (os) => {
        for (const item of items) os.delete(item.id);
      });
      return items.length;
    },
  },
};

// ---------------------------------------------------------------------------
// Scannen, opruimen, terugzetten
// ---------------------------------------------------------------------------

function actieveBronnen(instellingen) {
  const opAndroid = nativeBeschikbaar();
  return BRONNEN.filter((bron) => {
    if (bron.native && !opAndroid) return false;
    return bron.altijd || instellingen.bronnen[bron.key]?.aan;
  });
}

function leegResultaat(bron, extra = {}) {
  return { key: bron.key, naam: bron.naam, items: [], aantal: 0, bytes: 0, fout: null, ...extra };
}

// Droogloop: kijken wat er weg zou gaan, zonder iets aan te raken.
export async function scanAlles(instellingen = laadInstellingen()) {
  const actief = actieveBronnen(instellingen);
  const resultaten = [];

  for (const bron of actief.filter((b) => !b.native)) {
    const dagen = instellingen.bronnen[bron.key]?.dagen ?? bron.standaardDagen ?? 0;
    try {
      const items = await SCANNERS[bron.key].scan(dagen);
      resultaten.push({
        ...leegResultaat(bron),
        items,
        aantal: items.length,
        bytes: items.reduce((som, i) => som + (i.bytes || 0), 0),
      });
    } catch (e) {
      resultaten.push({ ...leegResultaat(bron), fout: e?.message || "kon niet nakijken" });
    }
  }

  // De telefoon doorzoeken we in één keer voor alle native bronnen samen —
  // één wandeling over de opslag in plaats van zes.
  const nativeBronnen = actief.filter((b) => b.native);
  if (nativeBronnen.length) {
    try {
      const scan = await nativeScan(instellingen);
      for (const bron of nativeBronnen) {
        const vak = scan?.categorieen?.[bron.key] || { aantal: 0, bytes: 0 };
        const items = (scan?.items || [])
          .filter((item) => item.categorie === bron.key)
          .map((item) => ({ id: item.pad, bytes: item.bytes, tijd: item.gewijzigd, label: item.naam }));
        resultaten.push({
          ...leegResultaat(bron),
          items,
          // De plugin geeft hooguit een paar honderd voorbeelden terug, maar
          // telt wel alles: aantal en bytes komen dus uit de totalen.
          aantal: vak.aantal || 0,
          bytes: vak.bytes || 0,
          native: true,
          afgekapt: !!scan?.afgekapt,
        });
      }
    } catch (e) {
      const melding = e?.message === "geen-toestemming" ? "geen toegang tot de opslag" : e?.message || "kon niet nakijken";
      for (const bron of nativeBronnen) {
        resultaten.push({ ...leegResultaat(bron), native: true, fout: melding });
      }
    }
  }

  return {
    bronnen: resultaten,
    aantal: resultaten.reduce((som, r) => som + r.aantal, 0),
    bytes: resultaten.reduce((som, r) => som + r.bytes, 0),
    opslag: await opslagInfo(),
    instellingen,
  };
}

// Voert een eerder gemaakte scan uit. Elke bron staat op zichzelf: gaat er één
// mis, dan gaan de andere gewoon door.
export async function ruimOp(scan, { modus = "handmatig" } = {}) {
  const per = {};
  let aantal = 0;
  let bytes = 0;
  const fouten = [];

  for (const bronResultaat of scan.bronnen) {
    if (bronResultaat.native || !bronResultaat.items.length) continue;
    try {
      const gedaan = await SCANNERS[bronResultaat.key].ruimOp(bronResultaat.items, bronResultaat.key);
      const opgeruimd = typeof gedaan === "number" ? gedaan : bronResultaat.items.length;
      const bronBytes = bronResultaat.items
        .slice(0, opgeruimd)
        .reduce((som, i) => som + (i.bytes || 0), 0);
      per[bronResultaat.key] = { aantal: opgeruimd, bytes: bronBytes };
      aantal += opgeruimd;
      bytes += bronBytes;
    } catch (e) {
      fouten.push(`${bronResultaat.naam}: ${e?.message || "mislukt"}`);
    }
  }

  // De telefoon ruimt zichzelf op per categorie, in één opdracht.
  const nativeKeys = scan.bronnen.filter((b) => b.native && b.aantal > 0).map((b) => b.key);
  if (nativeKeys.length) {
    try {
      const uit = await nativeRuimOp(nativeKeys, scan.instellingen || laadInstellingen());
      for (const key of nativeKeys) {
        const vak = uit?.categorieen?.[key];
        if (vak) per[key] = { aantal: vak.aantal || 0, bytes: vak.bytes || 0 };
      }
      aantal += uit?.aantal || 0;
      bytes += uit?.bytes || 0;
      if (uit?.mislukt) fouten.push(`${uit.mislukt} bestanden op de telefoon konden niet weg`);
    } catch (e) {
      fouten.push(`Telefoonopslag: ${e?.message || "mislukt"}`);
    }
  }

  const regel = { op: Date.now(), modus, aantal, bytes, per, fouten };
  // Een ronde die niets vond hoeft niet in het logboek: anders staat het na
  // een week vol met lege automatische rondes.
  if (aantal || fouten.length) schrijfLog(regel);
  return regel;
}

// Eén druk op de knop: scannen en meteen opruimen.
export async function scanEnRuimOp(opties = {}) {
  const instellingen = opties.instellingen || laadInstellingen();
  const scan = await scanAlles(instellingen);
  return { scan, resultaat: await ruimOp(scan, opties) };
}

/**
 * De prullenbak zoals de app 'm toont: de eigen items plus, op Android, die
 * van de telefoonopslag. Intern blijft `leesPrullenbak` bewust web-only — die
 * voedt de bron die na TRASH_DAGEN definitief wist, en de telefoon ruimt zijn
 * eigen bak op bij elke native ronde.
 */
export async function leesPrullenbakAlles() {
  const eigen = (await leesPrullenbak()).map((regel) => ({ ...regel, soort: "app" }));
  if (!nativeBeschikbaar()) return eigen;
  const telefoon = (await nativePrullenbak()).map((regel) => ({
    id: `telefoon:${regel.bakNaam}`,
    soort: "telefoon",
    bakNaam: regel.bakNaam,
    bron: "telefoon",
    label: regel.naam,
    pad: regel.pad,
    bytes: regel.bytes,
    verwijderdOp: regel.verwijderdOp,
  }));
  return [...eigen, ...telefoon].sort((a, b) => b.verwijderdOp - a.verwijderdOp);
}

export async function zetTerug(regel) {
  if (regel?.soort === "telefoon") return await nativeZetTerug(regel.bakNaam);
  if (!regel?.record || !regel?.dbNaam || !regel?.store) return false;
  await schrijfRecord(regel.dbNaam, regel.store, regel.record);
  await metPrullenbak("readwrite", (os) => {
    os.delete(regel.id);
  });
  return true;
}

export async function leegPrullenbak() {
  const regels = await leesPrullenbak();
  await metPrullenbak("readwrite", (os) => {
    os.clear();
  });
  let aantal = regels.length;
  let bytes = regels.reduce((som, r) => som + (r.bytes || 0), 0);

  if (nativeBeschikbaar()) {
    const telefoon = await nativePrullenbak();
    const vrij = await nativeLeegPrullenbak();
    aantal += telefoon.length;
    bytes += vrij;
  }
  return { aantal, bytes };
}

// ---------------------------------------------------------------------------
// Automatisch draaien
// ---------------------------------------------------------------------------

// Draait hooguit één keer per etmaal, zodra je een van de Daglog-apps opent.
// Echt draaien zónder de app te openen doet de service worker (periodic sync,
// alleen Chromium) en straks de Android-laag.
export async function automatischOpruimen() {
  const instellingen = laadInstellingen();
  if (!instellingen.automatisch) return null;
  // Eigen tijdstempel, los van het logboek: een ronde die niets vond komt daar
  // niet in te staan en zou anders bij elke keer openen opnieuw gaan scannen.
  let vorige = 0;
  try {
    vorige = Number(localStorage.getItem(AUTO_KEY)) || 0;
  } catch {
    return null;
  }
  if (vorige && Date.now() - vorige < AUTO_INTERVAL_MS) return null;
  try {
    localStorage.setItem(AUTO_KEY, String(Date.now()));
  } catch {
    /* zonder opslag draaien we hooguit één keer per sessie te vaak */
  }
  const { resultaat } = await scanEnRuimOp({ instellingen, modus: "automatisch" });
  return resultaat;
}

// Vraagt de browser om de service worker periodiek te wekken. Chrome doet dat
// alleen voor een geïnstalleerde app die je regelmatig gebruikt; lukt het
// niet, dan valt de app terug op `automatischOpruimen` bij het openen.
export async function registreerAchtergrond() {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registratie = await navigator.serviceWorker.ready;
    if (!registratie.periodicSync) return false;
    const status = await navigator.permissions?.query({ name: "periodic-background-sync" });
    if (status && status.state !== "granted") return false;
    await registratie.periodicSync.register("opruim", { minInterval: DAG_MS });
    return true;
  } catch {
    return false;
  }
}
