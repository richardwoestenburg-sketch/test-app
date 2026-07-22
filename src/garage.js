// Garage: onderhouds- en detailing-logboek voor de auto's.
//
// Alles blijft lokaal: auto's, logboek, datums en detailing-historie in
// localStorage; foto's in IndexedDB (zelfde aanpak als vakantie.js, met
// client-side verkleining zodat de opslag klein blijft).

const KEY_CARS = "garage-cars-v1";
const KEY_LOG = "garage-log-v1";
const KEY_DETAIL = "garage-detailing-v1";
const KEY_ACTIVE = "garage-active-car";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* opslag vol of geblokkeerd — negeren, blijft in-memory werken */
  }
}

// -- Auto's ----------------------------------------------------------------

// Startgegevens uit de eerdere "Auto Onderhoud Tracker" (stand 08-06-2026):
// laatste APK en grote beurt waren op 2026-06-08 bij 202.765 km, met een
// jaarinterval — vandaar de vervaldatums op 2027-06-08.
const DEFAULT_CARS = [
  {
    id: "spider",
    name: "Spider 916",
    fullName: "Alfa Romeo Spider 916 2.0 TS (1996) · 45-FX-SV",
    km: 202765,
    // Belangrijke datums (ISO yyyy-mm-dd); null = nog niet ingesteld.
    dates: { apk: "2027-06-08", verzekering: null, beurt: "2027-06-08" },
  },
  {
    id: "mito",
    name: "MiTo",
    fullName: "Alfa Romeo MiTo (rood)",
    km: null,
    dates: { apk: null, verzekering: null, beurt: null },
  },
];

export const DATE_LABELS = {
  apk: "APK",
  verzekering: "Verzekering",
  beurt: "Onderhoudsbeurt",
};

export function loadCars() {
  const stored = readJson(KEY_CARS, null);
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_CARS.map((c) => ({ ...c, dates: { ...c.dates } }));
  // Vul ontbrekende velden aan zodat oudere opgeslagen versies blijven werken.
  return stored.map((c) => ({
    ...c,
    dates: { apk: null, verzekering: null, beurt: null, ...(c.dates || {}) },
  }));
}

export function saveCars(cars) {
  writeJson(KEY_CARS, cars);
  return cars;
}

export function loadActiveCarId(cars) {
  const saved = localStorage.getItem(KEY_ACTIVE);
  return cars.some((c) => c.id === saved) ? saved : cars[0].id;
}

export function saveActiveCarId(id) {
  try {
    localStorage.setItem(KEY_ACTIVE, id);
  } catch {}
}

// Dagen tot een ISO-datum (negatief = verstreken). null bij geen datum.
export function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`);
  if (isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// -- Startdata (eenmalige seed) --------------------------------------------

// Onderhoudshistorie van de Spider, overgenomen uit de eerdere standalone
// "Auto Onderhoud Tracker". Wordt eenmalig aan het logboek toegevoegd
// (marker in localStorage), ook als er al eigen aantekeningen staan.
const KEY_SEED = "garage-seed-v1";

const ts = (iso) => new Date(`${iso}T12:00:00`).getTime();

const SEED_LOG = [
  {
    id: "seed-beurt-2026-06-08",
    carId: "spider",
    type: "apk",
    km: 202765,
    timestamp: ts("2026-06-08"),
    text:
      "Grote beurt 200.000 km + APK bij Garage Grand Prix (factuur 2624653): olie ververst " +
      "(5L Eni i-sint 10W40), olie- en luchtfilter nieuw, 8 bougies vernieuwd (4x M14, 4x M10), " +
      "overmaat carterstop (schroefdraad getapt + koperen ring), remlicht rechtsachter en " +
      "kentekenverlichting hersteld, koplamp/mistlamp afgesteld, antenne afgekoppeld, Wepp " +
      "brandstofsysteemreiniger toegevoegd, sloten gesmeerd en vloeistoffen bijgevuld. APK gratis meegenomen.",
  },
  {
    id: "seed-vakantie-2026-05-27",
    carId: "spider",
    type: "onderhoud",
    km: 199716,
    timestamp: ts("2026-05-27"),
    text:
      "Vakantiecontrole Garage Grand Prix (factuur 2624652): achterbanden nieuw (Michelin Pilot " +
      "Sport 5 XL 225/45/R17 94Y), motorkapdempers (gasveren) nieuw, gebruikte radiateurgrille en " +
      "spiegelschakelaar gemonteerd, uitlaatrubber vernieuwd.",
  },
  {
    id: "seed-olie-2026-05-18",
    carId: "spider",
    type: "onderhoud",
    km: null,
    timestamp: ts("2026-05-18"),
    text:
      "750 ml motorolie bijgevuld. Olieverbruik tot de beurt: ±1 liter per 15.218 km — uitstekend " +
      "voor het 2.0 TS-blok. Sinds de beurt van 08-06-2026 geldt een nieuw startpunt voor metingen.",
  },
  {
    id: "seed-startonderbreker-2026-05-15",
    carId: "spider",
    type: "overig",
    km: null,
    timestamp: ts("2026-05-15"),
    text:
      "Aandachtspunt garage: motor viel rijdend uit (02-05 en 15-05-2026), startonderbreker-lampje " +
      "(sleutel) brandde; beide keren opgelost met sleutel eruit/erin. Navragen bij Garage Grand Prix " +
      "of dit bij de beurt van 08-06-2026 structureel is verholpen.",
  },
  {
    id: "seed-wielnaaf-2026-03-26",
    carId: "spider",
    type: "reparatie",
    km: 196151,
    timestamp: ts("2026-03-26"),
    text:
      "Garage Grand Prix (facturen 2624458 & 2624459): schroefdraad wielnaaf linksvoor hersteld (na " +
      "te lange wielbouten reservewiel) + 5 nieuwe wielbouten, voorbanden nieuw (Michelin Pilot Sport " +
      "5 XL 225/45/ZR17 94Y), zomerwielen gemonteerd en winterwielen gewassen de opslag in.",
  },
  {
    id: "seed-olie-2025-04",
    carId: "spider",
    type: "onderhoud",
    km: null,
    timestamp: ts("2025-04-15"),
    text: "April 2025: 0,75 liter motorolie bijgevuld door de garage.",
  },
];

// Eenmalig: zet de bekende historie in het logboek en vul auto-gegevens aan
// zonder eigen invoer te overschrijven. Veilig om vaker aan te roepen.
export function ensureSeeded() {
  try {
    if (localStorage.getItem(KEY_SEED)) return;
  } catch {
    return;
  }

  const cars = loadCars().map((c) => {
    const seed = DEFAULT_CARS.find((s) => s.id === c.id);
    if (!seed) return c;
    const dates = { ...c.dates };
    for (const key of Object.keys(seed.dates)) {
      if (!dates[key] && seed.dates[key]) dates[key] = seed.dates[key];
    }
    return { ...c, fullName: seed.fullName, km: c.km ?? seed.km, dates };
  });
  saveCars(cars);

  const existing = loadLog();
  const have = new Set(existing.map((e) => e.id));
  const merged = [...existing, ...SEED_LOG.filter((e) => !have.has(e.id))].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  saveLog(merged);

  try {
    localStorage.setItem(KEY_SEED, "1");
  } catch {}
}

// -- Onderhoudslogboek -----------------------------------------------------

export const LOG_TYPES = ["onderhoud", "reparatie", "apk", "overig"];

export function loadLog() {
  const items = readJson(KEY_LOG, []);
  return Array.isArray(items) ? items : [];
}

export function saveLog(items) {
  writeJson(KEY_LOG, items);
  return items;
}

export function addLogEntry({ carId, text, km, type }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    carId,
    text,
    km: km ?? null,
    type: LOG_TYPES.includes(type) ? type : "overig",
    timestamp: Date.now(),
  };
  return saveLog([entry, ...loadLog()]);
}

export function deleteLogEntry(id) {
  return saveLog(loadLog().filter((e) => e.id !== id));
}

// -- Detailing -------------------------------------------------------------

// De vaste exterieur-workflow, in volgorde, plus leerverzorging voor de
// Spider. intervalDays is een richtlijn: daarna is de stap "toe aan".
export const DETAILING_STEPS = [
  { id: "wassen", label: "Wassen + insectenverwijderaar", intervalDays: 21 },
  { id: "korrosol", label: "Korrosol (vliegroest)", intervalDays: 90 },
  { id: "klei", label: "Kleien", intervalDays: 180 },
  { id: "polijsten", label: "Polijsten", intervalDays: 365 },
  { id: "wax", label: "Waxen", intervalDays: 120 },
  { id: "leer", label: "Leerverzorging (kleurloos)", intervalDays: 90, onlyCar: "spider" },
];

export function stepsForCar(carId) {
  return DETAILING_STEPS.filter((s) => !s.onlyCar || s.onlyCar === carId);
}

// Vorm: { [carId]: { [stepId]: timestamp van laatste keer } }
export function loadDetailing() {
  const data = readJson(KEY_DETAIL, {});
  return data && typeof data === "object" ? data : {};
}

export function markStepDone(carId, stepId, when = Date.now()) {
  const data = loadDetailing();
  const next = { ...data, [carId]: { ...(data[carId] || {}), [stepId]: when } };
  writeJson(KEY_DETAIL, next);
  return next;
}

export function clearStep(carId, stepId) {
  const data = loadDetailing();
  const car = { ...(data[carId] || {}) };
  delete car[stepId];
  const next = { ...data, [carId]: car };
  writeJson(KEY_DETAIL, next);
  return next;
}

export function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

// -- Wasdag-advies ---------------------------------------------------------

// Gebruikt de weerdata uit cabrio.js (fetchWeather). Blockers maken het een
// slechte wasdag; cautions zijn aandachtspunten die het advies niet blokkeren.
export function computeWashAdvice(current, hours) {
  const blockers = [];
  const cautions = [];

  if (current.precipitation != null && current.precipitation > 0) {
    blockers.push("het regent nu");
  }
  if (current.temp != null && current.temp < 5) {
    blockers.push(`met ${Math.round(current.temp)}°C te koud — shampoo en wax werken slecht`);
  }
  const maxChance = Math.max(0, ...hours.map((h) => h.precipChance ?? 0));
  if (maxChance > 40) {
    blockers.push(`${Math.round(maxChance)}% regenkans de komende uren — zonde van een verse waxlaag`);
  }

  if (current.temp != null && current.temp > 28) {
    cautions.push("erg warm — producten drogen snel op, werk paneel voor paneel in de schaduw");
  }
  if (current.uvIndex != null && current.uvIndex >= 6) {
    cautions.push("felle zon — niet polijsten of waxen in direct zonlicht");
  }
  if (current.windGusts != null && current.windGusts > 45) {
    cautions.push("harde windstoten — stof en zand waaien op de natte lak");
  }

  return { ok: blockers.length === 0, blockers, cautions };
}

// -- Foto's (IndexedDB) ----------------------------------------------------

const DB_NAME = "garage-db";
const DB_VERSION = 1;
const STORE = "photos";

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale) || 1;
  const h = Math.round(bitmap.height * scale) || 1;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob || file;
}

export async function addPhoto({ file, carId, caption }) {
  const blob = await resizeImage(file);
  const db = await openDB();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    carId,
    caption: caption || "",
    timestamp: Date.now(),
    blob,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return entry;
}

export async function getAllPhotos() {
  const db = await openDB();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deletePhoto(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
