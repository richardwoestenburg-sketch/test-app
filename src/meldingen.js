// IndexedDB-backed storage for het Ongevallenmeldingsformulier (ongeval /
// bijna-ongeval / onveilige situatie / materiaal- of milieuschade), plus
// localStorage-instellingen (standaard melder + e-mailadres quality) en een
// mailto-opbouwer om een melding direct vanaf de telefoon door te sturen.
const DB_NAME = "meldingen-db";
const DB_VERSION = 1;
const STORE = "meldingen";
const SETTINGS_KEY = "meldingen-settings";

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

export const INCIDENT_TYPES = [
  { key: "ongeval", label: "Ongeval" },
  { key: "bijna_ongeval", label: "Bijna ongeval/incident" },
  { key: "onveilige_situatie", label: "Onveilige situatie/handeling" },
  { key: "schade", label: "Schade materiaal/milieu" },
];

export function typeLabel(key) {
  return INCIDENT_TYPES.find((t) => t.key === key)?.label || key;
}

// --- Instellingen (standaard melder + quality-adres) ---------------------

const DEFAULT_SETTINGS = {
  qualityEmail: "quality@eurosort.com",
  melderNaam: "Richard Woestenburg",
  melderFunctie: "Supervisor assembly",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

// --- IndexedDB opslag van meldingen ---------------------------------------

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

async function resizePhoto(file) {
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

export async function addMelding(fields) {
  const blob = fields.photo ? await resizePhoto(fields.photo) : null;
  const db = await openDB();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    melderNaam: fields.melderNaam || "",
    melderFunctie: fields.melderFunctie || "",
    date: fields.date,
    timeLabel: fields.timeLabel,
    timestamp: fields.timestamp,
    locatie: fields.locatie || "",
    soorten: fields.soorten || [],
    omschrijving: fields.omschrijving || "",
    betrokkeneNaam: fields.betrokkeneNaam || "",
    betrokkeneAdres: fields.betrokkeneAdres || "",
    betrokkenePostcode: fields.betrokkenePostcode || "",
    betrokkeneGeboortedatum: fields.betrokkeneGeboortedatum || "",
    betrokkeneIndiensttreding: fields.betrokkeneIndiensttreding || "",
    betrokkeneAfdeling: fields.betrokkeneAfdeling || "",
    betrokkeneEigenOfAnders: fields.betrokkeneEigenOfAnders || "",
    maatregelen: fields.maatregelen || "",
    actieLeidinggevende: fields.actieLeidinggevende || "",
    verstuurd: false,
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

export async function markVerstuurd(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.verstuurd = true;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAllMeldingen() {
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

export async function deleteMelding(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAllMeldingen() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// --- Doorsturen naar quality (mailto) -------------------------------------
// Een mailto-link kan geen bijlage meesturen — een eventuele foto blijft
// alleen lokaal in de app bewaard; die voeg je zelf toe in je mail-app.

function formatDatum(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export function buildEmailSubject(entry) {
  const soort = entry.soorten.length ? entry.soorten.map(typeLabel).join(" / ") : "Melding";
  return `Ongevallenmeldingsformulier — ${soort} — ${formatDatum(entry.date)} ${entry.timeLabel} — ${entry.locatie || "onbekende locatie"}`;
}

export function buildEmailBody(entry) {
  const lines = [
    "Het ingevulde ongevallenmeldingsformulier (.docx) is zojuist gedownload —",
    "voeg dat bestand hier toe als bijlage voordat je verstuurt.",
    "Hieronder ter controle dezelfde gegevens als platte tekst.",
    "",
    `Naam melder: ${entry.melderNaam || "-"}`,
    `Functie: ${entry.melderFunctie || "-"}`,
    `Datum en tijd: ${formatDatum(entry.date)} ${entry.timeLabel}`,
    `Locatie: ${entry.locatie || "-"}`,
    "",
    "Soort incident:",
    entry.soorten.length ? entry.soorten.map((k) => `- ${typeLabel(k)}`).join("\n") : "- (niet aangevinkt)",
    "",
    "Omschrijving:",
    entry.omschrijving || "-",
  ];
  const betrokkeneVelden = [
    ["Naam", entry.betrokkeneNaam],
    ["Adres", entry.betrokkeneAdres],
    ["Postcode en woonplaats", entry.betrokkenePostcode],
    ["Geboortedatum", entry.betrokkeneGeboortedatum],
    ["Datum indiensttreding", entry.betrokkeneIndiensttreding],
    ["Afdeling", entry.betrokkeneAfdeling],
    ["Eigen medewerker/anders", entry.betrokkeneEigenOfAnders],
  ].filter(([, v]) => v && v.trim());
  if (betrokkeneVelden.length) {
    lines.push("", "Gegevens betrokkene:");
    for (const [label, value] of betrokkeneVelden) lines.push(`${label}: ${value}`);
  }
  if (entry.maatregelen && entry.maatregelen.trim()) {
    lines.push("", "Genomen of te nemen maatregelen om herhaling te voorkomen:", entry.maatregelen);
  }
  if (entry.actieLeidinggevende && entry.actieLeidinggevende.trim()) {
    lines.push("", "Actie leidinggevende:", entry.actieLeidinggevende);
  }
  if (entry.blob) {
    lines.push("", "(Let op: er hoort ook een foto bij deze melding — voeg die zelf toe als bijlage.)");
  }
  return lines.join("\n");
}

export function buildMailtoUrl(entry, toEmail) {
  const subject = encodeURIComponent(buildEmailSubject(entry));
  const body = encodeURIComponent(buildEmailBody(entry));
  const to = encodeURIComponent(toEmail || "");
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
