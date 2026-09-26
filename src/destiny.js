// Destiny: alles van Destiny 2 op PS5 én Xbox op één plek — je kluis (wapens,
// armor, overig), je karakters, je voortgang (raids, dungeons, catalysts,
// quests) en losse notities. Plus een vraag-en-antwoord-motor die je eigen
// opslag doorzoekt.
//
// Alles blijft lokaal: tekstgegevens in localStorage, foto's in IndexedDB
// (verkleind, zoals in vakantie.js en garage.js). Geen account, geen server,
// werkt offline.
// De Q&A is een lokale taalparser (geen internet of API-key): hij haalt uit je
// vraag de filters (platform, wapensoort, element, rarity, tag, locatie) en de
// bedoeling (hoeveel / welke / waar / sterkste / nog te doen) en beantwoordt
// die met je eigen gegevens.

const KEY_ITEMS = "destiny-items-v1";
const KEY_CHARS = "destiny-chars-v1";
const KEY_ACTS = "destiny-activities-v1";
const KEY_NOTES = "destiny-notes-v1";
const KEY_QUESTS = "destiny-quests-v1";
const KEY_PROFILE = "destiny-profile-v1";
const KEY_HISTORY = "destiny-questions-v1";
const KEY_IMPORTLOG = "destiny-import-log-v1";

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
    /* opslag vol of geblokkeerd — app blijft in-memory werken */
  }
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// -- Vaste lijstjes ---------------------------------------------------------

export const PLATFORMS = [
  { id: "ps5", name: "PlayStation 5", short: "PS5", syn: ["ps5", "ps 5", "playstation", "ps4", "sony"] },
  { id: "xbox", name: "Xbox", short: "Xbox", syn: ["xbox", "series x", "series s", "xbox one", "microsoft"] },
];

export const CLASSES = [
  { name: "Titan", syn: ["titan"] },
  { name: "Hunter", syn: ["hunter", "jager"] },
  { name: "Warlock", syn: ["warlock", "magier"] },
];

export const ELEMENTS = [
  { name: "Kinetic", syn: ["kinetic", "kinetisch"] },
  { name: "Arc", syn: ["arc", "elektrisch"] },
  { name: "Solar", syn: ["solar", "zonne", "vuur"] },
  { name: "Void", syn: ["void", "leegte"] },
  { name: "Stasis", syn: ["stasis", "ijs"] },
  { name: "Strand", syn: ["strand", "draad"] },
];

export const RARITIES = [
  { name: "Exotic", plural: "exotics", syn: ["exotic", "exotics", "exotisch"] },
  { name: "Legendary", plural: "legendaries", syn: ["legendary", "legendarisch", "legendaries"] },
  { name: "Rare", plural: "rares", syn: ["rare", "zeldzaam"] },
  { name: "Common", plural: "commons", syn: ["common", "gewoon"] },
];

export const WEAPON_TYPES = [
  { name: "Hand Cannon", syn: ["hand cannon", "handcannon", "revolver"] },
  { name: "Auto Rifle", syn: ["auto rifle", "autorifle"] },
  { name: "Pulse Rifle", syn: ["pulse rifle", "pulse"] },
  { name: "Scout Rifle", syn: ["scout rifle", "scout"] },
  { name: "Sidearm", syn: ["sidearm", "pistool"] },
  { name: "Submachine Gun", syn: ["submachine gun", "smg"] },
  { name: "Trace Rifle", syn: ["trace rifle", "trace"] },
  { name: "Bow", syn: ["bow", "boog"] },
  { name: "Shotgun", syn: ["shotgun", "hagelgeweer"] },
  { name: "Sniper Rifle", syn: ["sniper rifle", "sniper", "sluipschutter"] },
  { name: "Fusion Rifle", syn: ["fusion rifle", "fusion"] },
  { name: "Linear Fusion Rifle", syn: ["linear fusion rifle", "linear fusion", "lfr"] },
  { name: "Glaive", syn: ["glaive"] },
  { name: "Grenade Launcher", syn: ["grenade launcher", "granaatwerper"] },
  { name: "Rocket Launcher", syn: ["rocket launcher", "rocket", "raketwerper"] },
  { name: "Machine Gun", syn: ["machine gun", "machinegeweer"] },
  { name: "Sword", syn: ["sword", "zwaard"] },
];

export const ARMOR_TYPES = [
  { name: "Helm", plural: "helmen", syn: ["helm", "helmet", "hoofd"] },
  { name: "Handschoenen", plural: "handschoenen", syn: ["handschoenen", "gauntlets", "armen", "handen"] },
  { name: "Bruststuk", plural: "bruststukken", syn: ["bruststuk", "chest", "borst"] },
  { name: "Beenstukken", plural: "beenstukken", syn: ["beenstukken", "legs", "benen", "broek"] },
  { name: "Klasse-item", plural: "klasse-items", syn: ["klasse-item", "klasse item", "class item", "mark", "bond", "cape", "cloak"] },
];

export const OTHER_TYPES = [
  { name: "Ghost", plural: "ghosts", syn: ["ghost", "spook"] },
  { name: "Sparrow", plural: "sparrows", syn: ["sparrow", "voertuig"] },
  { name: "Schip", plural: "schepen", syn: ["schip", "ship", "schepen"] },
  { name: "Shader", plural: "shaders", syn: ["shader", "kleur"] },
  { name: "Emblem", plural: "emblems", syn: ["emblem", "embleem"] },
];

// Soort ding in de kluis: bepaalt welke type-lijst je te zien krijgt.
export const KINDS = [
  { id: "wapen", name: "Wapen", plural: "wapens", types: WEAPON_TYPES, syn: ["wapen", "wapens", "weapon", "weapons", "gun", "guns"] },
  { id: "armor", name: "Armor", plural: "armor", types: ARMOR_TYPES, syn: ["armor", "armour", "harnas", "uitrusting", "gear"] },
  { id: "overig", name: "Overig", plural: "overige dingen", types: OTHER_TYPES, syn: ["overig", "spullen", "cosmetisch"] },
];

export const SLOTS = ["Kinetic", "Energy", "Power"];

// Tags: korte labels om later snel op te zoeken ("welke god rolls heb ik?").
export const TAG_PRESETS = [
  { name: "god roll", syn: ["god roll", "godroll", "god rolls", "godrolls"] },
  { name: "favoriet", syn: ["favoriet", "favorieten", "favorite"] },
  { name: "PvE", syn: ["pve"] },
  { name: "PvP", syn: ["pvp", "crucible"] },
  { name: "craftable", syn: ["craftable", "craften", "gecraft", "smeden"] },
  { name: "masterwork", syn: ["masterwork", "masterworked", "mw"] },
  { name: "wegdoen", syn: ["wegdoen", "shard", "sharden", "verkopen", "slopen"] },
];

export const ACTIVITY_KINDS = [
  { id: "raid", name: "Raid", plural: "raids", syn: ["raid", "raids"] },
  { id: "dungeon", name: "Dungeon", plural: "dungeons", syn: ["dungeon", "dungeons", "kerker"] },
  { id: "exotic", name: "Exotic quest", plural: "exotic quests", syn: ["exotic quest", "exotic missie", "exotic quests"] },
  { id: "catalyst", name: "Catalyst", plural: "catalysts", syn: ["catalyst", "catalysts", "katalysator"] },
  { id: "seizoen", name: "Seizoen / quest", plural: "seizoensquests", syn: ["seizoen", "season", "quest", "quests", "battlepass"] },
  { id: "triomf", name: "Triomf / titel", plural: "triomfen", syn: ["triomf", "triumph", "titel", "title", "seal"] },
  { id: "overig", name: "Overig", plural: "overige activiteiten", syn: ["overig"] },
];

export const STATUSES = [
  { id: "todo", name: "Nog te doen" },
  { id: "bezig", name: "Bezig" },
  { id: "klaar", name: "Gehaald" },
];

// Handige presets om snel aan te vinken. Vul zelf aan wat er nieuw bijkomt.
export const ACTIVITY_PRESETS = {
  raid: [
    "Last Wish", "Garden of Salvation", "Deep Stone Crypt", "Vault of Glass",
    "Vow of the Disciple", "King's Fall", "Root of Nightmares", "Crota's End",
    "Salvation's Edge",
  ],
  dungeon: [
    "The Shattered Throne", "Pit of Heresy", "Prophecy", "Grasp of Avarice",
    "Duality", "Spire of the Watcher", "Ghosts of the Deep", "Warlord's Ruin",
    "Vesper's Host", "Sundered Doctrine",
  ],
};

export function platformLabel(id) {
  const p = PLATFORMS.find((x) => x.id === id);
  return p ? p.short : id || "";
}

export function kindLabel(id) {
  const k = KINDS.find((x) => x.id === id);
  return k ? k.name : id || "";
}

export function activityKindLabel(id) {
  const k = ACTIVITY_KINDS.find((x) => x.id === id);
  return k ? k.name : id || "";
}

export function statusLabel(id) {
  const s = STATUSES.find((x) => x.id === id);
  return s ? s.name : id || "";
}

// Meervoud van een lijst-item, voor nette antwoorden ("3 hand cannons").
function pluralOf(entry) {
  if (!entry) return "";
  if (entry.plural) return entry.plural;
  const n = entry.name.toLowerCase();
  return n.endsWith("s") ? n : `${n}s`;
}

function entryByName(list, name) {
  return list.find((e) => norm(e.name) === norm(name)) || null;
}

export function typesForKind(kindId) {
  const k = KINDS.find((x) => x.id === kindId);
  return k ? k.types.map((t) => t.name) : [];
}

// -- Opslag ----------------------------------------------------------------

export function loadItems() {
  const list = readJson(KEY_ITEMS, []);
  return Array.isArray(list) ? list : [];
}
export function saveItems(items) {
  writeJson(KEY_ITEMS, items);
  return items;
}

export function loadCharacters() {
  const list = readJson(KEY_CHARS, []);
  return Array.isArray(list) ? list : [];
}
export function saveCharacters(chars) {
  writeJson(KEY_CHARS, chars);
  return chars;
}

export function loadActivities() {
  const list = readJson(KEY_ACTS, []);
  return Array.isArray(list) ? list : [];
}
export function saveActivities(acts) {
  writeJson(KEY_ACTS, acts);
  return acts;
}

export function loadNotes() {
  const list = readJson(KEY_NOTES, []);
  return Array.isArray(list) ? list : [];
}
export function saveNotes(notes) {
  writeJson(KEY_NOTES, notes);
  return notes;
}

export function loadQuests() {
  const list = readJson(KEY_QUESTS, []);
  return Array.isArray(list) ? list : [];
}
export function saveQuests(quests) {
  writeJson(KEY_QUESTS, quests);
  return quests;
}

export function loadProfile() {
  const p = readJson(KEY_PROFILE, null);
  return { ps5: "", xbox: "", ...(p && typeof p === "object" ? p : {}) };
}
export function saveProfile(profile) {
  writeJson(KEY_PROFILE, profile);
  return profile;
}

export function loadHistory() {
  const list = readJson(KEY_HISTORY, []);
  return Array.isArray(list) ? list : [];
}
export function saveHistory(list) {
  writeJson(KEY_HISTORY, list.slice(0, 20));
  return list;
}

// Alles in één object — voor de Q&A, de statistieken en de back-up.
// -- Importlogboek ---------------------------------------------------------
// Wat er bij de laatste imports werkelijk is binnengekomen. Zonder dit is een
// mislukte import niet te onderscheiden van "je kijkt op het verkeerde
// platform" — en dat valt op een telefoon niet te achterhalen.

export function loadImportLog() {
  const list = readJson(KEY_IMPORTLOG, []);
  return Array.isArray(list) ? list : [];
}

export function noteImport(entry) {
  const list = [{ ...entry, at: Date.now() }, ...loadImportLog()].slice(0, 5);
  writeJson(KEY_IMPORTLOG, list);
  return list;
}

function kort(ts) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function importLogRegel(e) {
  if (!e) return "";
  const bron = e.bron === "dim" ? "uit DIM" : "uit Destiny 2";
  const stukken = [`${e.items || 0} nieuw`];
  if (e.updated) stukken.push(`${e.updated} bijgewerkt`);
  if (e.chars) stukken.push(`${e.chars} karakters`);
  if (e.quests) stukken.push(`${e.quests} quests`);
  const regel = `${kort(e.at)} — ${bron} naar ${platformLabel(e.platform)}: ${stukken.join(", ")}`;
  // De kolomnamen erbij: DIM hernoemt ze weleens, en dan valt een veld stil weg.
  return e.kolommen?.length ? `${regel}\n  Kolommen: ${e.kolommen.join(", ")}` : regel;
}

// Eén blok tekst dat precies zegt wat er op dit toestel staat. Bedoeld om te
// lezen én te kopiëren, zodat je niet hoeft te raden waar je gegevens zijn.
export function statusRapport({ items = [], characters = [], quests = [], activities = [], notes = [], photos = 0, versie = "", log = null }) {
  const per = (p) => {
    const tel = (list) => list.filter((x) => x.platform === p).length;
    return `${platformLabel(p)}: ${tel(items)} dingen, ${tel(characters)} karakters, ${tel(quests)} quests, ${tel(activities)} activiteiten`;
  };
  const geen = items.filter((x) => x.platform !== "ps5" && x.platform !== "xbox").length;
  const historie = Array.isArray(log) ? log : loadImportLog();
  const regels = [
    "Destiny-app — wat er op dit toestel staat",
    versie ? `Appversie: ${versie}` : "",
    ...PLATFORMS.map((p) => per(p.id)),
    geen ? `Zonder platform: ${geen} dingen` : "",
    `Notities: ${notes.length} · Foto's: ${photos}`,
    historie.length
      ? `Laatste import: ${importLogRegel(historie[0])}`
      : "Nog nooit iets geïmporteerd.",
    ...historie.slice(1).map((e) => `Daarvoor: ${importLogRegel(e)}`),
  ];
  return regels.filter(Boolean).join("\n");
}

export function loadAll() {
  return {
    items: loadItems(),
    characters: loadCharacters(),
    activities: loadActivities(),
    notes: loadNotes(),
    quests: loadQuests(),
    profile: loadProfile(),
  };
}

// -- Back-up ---------------------------------------------------------------

export async function exportData() {
  const data = loadAll();
  // Foto's gaan als data-URL mee, anders zou een back-up ze stilletjes
  // verliezen (ze staan in IndexedDB, niet in localStorage).
  const photos = [];
  for (const p of await getAllPhotos().catch(() => [])) {
    const dataUrl = await blobToDataUrl(p.blob);
    if (dataUrl) photos.push({ ...p, blob: undefined, dataUrl });
  }
  return JSON.stringify(
    { app: "destiny", version: 2, exportedAt: new Date().toISOString(), ...data, photos },
    null,
    2
  );
}

// Voegt een back-up samen met wat er al staat (op id), zodat importeren nooit
// per ongeluk je huidige kluis wist. Geeft terug hoeveel er is toegevoegd.
export async function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") throw new Error("Onbekend bestand.");
  const merge = (current, incoming) => {
    const list = Array.isArray(incoming) ? incoming : [];
    const seen = new Set(current.map((x) => x.id));
    const added = list.filter((x) => x && x.id && !seen.has(x.id));
    return { list: [...current, ...added], added: added.length };
  };
  const items = merge(loadItems(), parsed.items);
  const chars = merge(loadCharacters(), parsed.characters);
  const acts = merge(loadActivities(), parsed.activities);
  const notes = merge(loadNotes(), parsed.notes);
  saveItems(items.list);
  saveCharacters(chars.list);
  saveActivities(acts.list);
  saveNotes(notes.list);
  if (parsed.profile && typeof parsed.profile === "object") {
    saveProfile({ ...loadProfile(), ...parsed.profile });
  }

  let photosAdded = 0;
  if (Array.isArray(parsed.photos) && parsed.photos.length) {
    const existing = new Set((await getAllPhotos().catch(() => [])).map((p) => p.id));
    const db = await openDB();
    for (const p of parsed.photos) {
      if (!p || !p.id || !p.dataUrl || existing.has(p.id)) continue;
      const blob = await dataUrlToBlob(p.dataUrl).catch(() => null);
      if (!blob) continue;
      await new Promise((resolve) => {
        const tx = db.transaction(PHOTO_STORE, "readwrite");
        tx.objectStore(PHOTO_STORE).add({
          id: p.id,
          itemId: p.itemId || null,
          noteId: p.noteId || null,
          platform: p.platform || null,
          caption: p.caption || "",
          timestamp: p.timestamp || Date.now(),
          blob,
        });
        tx.oncomplete = () => { photosAdded += 1; resolve(); };
        tx.onerror = () => resolve();
      });
    }
    db.close();
  }

  return {
    items: items.added, characters: chars.added, activities: acts.added,
    notes: notes.added, photos: photosAdded,
  };
}

// -- Foto's (IndexedDB) ----------------------------------------------------
//
// Een foto hangt aan een ding uit je kluis (itemId) of aan een notitie
// (noteId) — bijvoorbeeld een kiekje van je scherm met de roll van een wapen.
// Blobs horen niet in localStorage, vandaar IndexedDB; ze worden eerst
// verkleind zodat de opslag klein blijft.

const DB_NAME = "destiny-db";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
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

export async function addPhoto({ file, itemId, noteId, platform, caption }) {
  const blob = await resizeImage(file);
  const entry = {
    id: newId(),
    itemId: itemId || null,
    noteId: noteId || null,
    platform: platform || null,
    caption: caption || "",
    timestamp: Date.now(),
    blob,
  };
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return entry;
}

export async function getAllPhotos() {
  const db = await openDB();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result.sort((a, b) => a.timestamp - b.timestamp);
}

export async function deletePhoto(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function deletePhotosWhere(match) {
  const all = await getAllPhotos();
  const doomed = all.filter(match);
  for (const p of doomed) await deletePhoto(p.id).catch(() => {});
  return doomed.length;
}

// Opruimen: foto's waarvan het ding of de notitie niet meer bestaat. Vangt
// ook foto's op van een formulier dat je hebt weggeklikt zonder op te slaan.
export async function cleanupOrphanPhotos(items, notes) {
  const itemIds = new Set(items.map((i) => i.id));
  const noteIds = new Set(notes.map((n) => n.id));
  return deletePhotosWhere(
    (p) => (p.itemId && !itemIds.has(p.itemId)) || (p.noteId && !noteIds.has(p.noteId))
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// -- Samenvoegen met gegevens van Bungie -----------------------------------
//
// Uitgangspunt: wat jíj hebt toegevoegd is heilig. Labels, notities, perks en
// foto's blijven staan; alleen de spelgegevens (naam, soort, power, waar het
// staat) worden bijgewerkt. Herkennen gaat op het instantie-id van Bungie, dat
// uniek is per exemplaar in je kluis.

export function mergeCharactersFromBungie(existing, incoming, platform) {
  const list = existing.slice();
  let added = 0;
  let updated = 0;

  for (const inc of incoming) {
    let idx = list.findIndex((c) => c.platform === platform && c.bungieId === inc.bungieId);
    // Nog niet gekoppeld? Dan een karakter van dezelfde klasse adopteren dat
    // je zelf had ingevoerd, zodat je notities meeverhuizen.
    if (idx < 0) {
      idx = list.findIndex(
        (c) => c.platform === platform && !c.bungieId && norm(c.cls) === norm(inc.cls)
      );
    }
    if (idx < 0) {
      list.push({
        id: newId(),
        platform,
        cls: inc.cls,
        name: "",
        subclass: "",
        power: inc.power,
        notes: "",
        bungieId: inc.bungieId,
      });
      added += 1;
    } else {
      list[idx] = { ...list[idx], cls: inc.cls, power: inc.power, bungieId: inc.bungieId };
      updated += 1;
    }
  }
  return { list, added, updated };
}

// `locationFor` vertaalt het karakter-id van Bungie naar het karakter in de
// app; geeft het niets terug, dan komt het ding in de kluis te staan.
export function mergeItemsFromBungie(existing, incoming, platform, locationFor) {
  const list = existing.slice();
  let added = 0;
  let updated = 0;

  for (const inc of incoming) {
    const location = inc.location === "kluis" ? "kluis" : locationFor(inc.location) || "kluis";
    const idx = list.findIndex((i) => i.platform === platform && i.instanceId === inc.instanceId);
    const fromGame = {
      platform,
      instanceId: inc.instanceId,
      bungieHash: inc.bungieHash,
      kind: inc.kind,
      name: inc.name,
      type: inc.type,
      element: inc.element,
      rarity: inc.rarity,
      charClass: inc.charClass,
      power: inc.power,
      location,
      source: "bungie",
    };

    if (idx < 0) {
      list.unshift({
        ...emptyFields(),
        ...fromGame,
        id: newId(),
        createdAt: Date.now(),
        perks: inc.perks || "",
        notes: inc.notes || "",
        tags: [...new Set(inc.tags || [])],
      });
      added += 1;
    } else {
      const old = list[idx];
      list[idx] = {
        ...old,
        ...fromGame,
        // Van jou, dus blijft staan:
        notes: old.notes,
        perks: old.perks || inc.perks || "",
        tags: [...new Set([...(old.tags || []), ...(inc.tags || [])])],
      };
      updated += 1;
    }
  }
  return { list, added, updated };
}

function emptyFields() {
  return { perks: "", notes: "", tags: [] };
}

// Quests zijn vluchtig: wat je in de game afrondt of weggooit, hoort hier ook
// te verdwijnen. Daarom vervangen we de hele set van dit platform, met behoud
// van je eigen notitie per quest.
export function mergeQuestsFromBungie(existing, incoming, platform) {
  // Quests die je zelf hebt ingevoerd blijven staan: een sync met Bungie
  // vervangt alleen wat uit de game komt.
  const anders = existing.filter((q) => q.platform !== platform || q.bron === "handmatig");
  const oudeNotities = new Map(existing.filter((q) => q.notes).map((q) => [q.instanceId, q.notes]));
  const verse = incoming.map((q) => ({
    ...q,
    id: newId(),
    notes: oudeNotities.get(q.instanceId) || "",
    updatedAt: Date.now(),
  }));
  return { list: [...anders, ...verse], aantal: verse.length };
}

// Soorten quests die je zelf kunt invoeren. "exotic" telt mee in het advies,
// "bounty" ook — zie questAdvies hieronder.
export const QUEST_KINDS = [
  { id: "quest", name: "Quest", soort: "Quest" },
  { id: "exotic", name: "Exotic-quest", soort: "Exotic Quest", rarity: "Exotic" },
  { id: "bounty", name: "Bounty", soort: "Bounty", isBounty: true },
  { id: "seizoen", name: "Seizoensopdracht", soort: "Seizoen" },
  { id: "catalyst", name: "Catalyst", soort: "Catalyst" },
];

export function emptyQuest(platform) {
  return {
    instanceId: `hand:${newId()}`,
    platform: platform || "ps5",
    bron: "handmatig",
    kindId: "quest",
    name: "",
    omschrijving: "",
    gedaan: "",
    totaal: "",
    verloopt: "",
    klaar: false,
  };
}

// Van formulier naar quest zoals de rest van de app hem kent. De stappen
// ("3 van 7") worden een percentage, want daar rekent het advies mee.
export function questUitFormulier(f) {
  const soort = QUEST_KINDS.find((k) => k.id === f.kindId) || QUEST_KINDS[0];
  const gedaan = Math.max(0, Number(f.gedaan) || 0);
  const totaal = Math.max(0, Number(f.totaal) || 0);
  const percent = totaal > 0 ? Math.min(100, Math.round((gedaan / totaal) * 100)) : 0;
  return {
    instanceId: f.instanceId,
    platform: f.platform,
    bron: "handmatig",
    kindId: f.kindId,
    name: String(f.name || "").trim().slice(0, 120),
    omschrijving: String(f.omschrijving || "").trim().slice(0, 400),
    soort: soort.soort,
    rarity: soort.rarity || "",
    isBounty: !!soort.isBounty,
    gedaan: f.gedaan === "" ? "" : gedaan,
    totaal: f.totaal === "" ? "" : totaal,
    percent,
    doelen: totaal > 0 ? [{ label: "Stappen", progress: gedaan, doel: totaal, klaar: gedaan >= totaal }] : [],
    verloopt: f.verloopt || "",
    klaar: !!f.klaar,
    updatedAt: Date.now(),
  };
}

// Advies: welke quest kun je het best doen? Alles hieronder komt uit je eigen
// gegevens, met de reden erbij — geen zwarte doos.
export function questAdvies(quests, activities = [], platform = null) {
  const open = (platform ? quests.filter((q) => q.platform === platform) : quests).filter((q) => !q.klaar);
  const nu = Date.now();
  const openActiviteiten = activities.filter((a) => a.status !== "klaar");

  const gescoord = open.map((q) => {
    let score = 0;
    const redenen = [];

    const urenTot = q.verloopt ? (new Date(q.verloopt).getTime() - nu) / 3600000 : null;
    if (urenTot != null && urenTot > 0 && urenTot <= 24) {
      score += 50;
      redenen.push(urenTot < 1 ? "verloopt binnen een uur" : `verloopt over ${Math.round(urenTot)} uur`);
    }

    if (q.percent >= 75) {
      score += 40;
      redenen.push(`bijna klaar (${q.percent}%)`);
    } else if (q.percent >= 40) {
      score += 20;
      redenen.push(`al ${q.percent}% gedaan`);
    }

    if (norm(q.rarity) === "exotic" || norm(q.soort).includes("exotic")) {
      score += 30;
      redenen.push("levert iets exotisch op");
    }

    // Hoort deze quest bij een raid of dungeon die nog op je lijst staat?
    const blob = norm(`${q.name} ${q.omschrijving}`);
    const bijActiviteit = openActiviteiten.find((a) => a.name && blob.includes(norm(a.name)));
    if (bijActiviteit) {
      score += 25;
      redenen.push(`hoort bij ${bijActiviteit.name}, die je nog moet doen`);
    }

    if (q.isBounty) {
      score += 10;
      redenen.push("bounty, meestal zo gedaan");
    }

    if (!redenen.length) redenen.push(q.percent > 0 ? `${q.percent}% gedaan` : "nog niet begonnen");
    return { quest: q, score, redenen };
  });

  return gescoord.sort((a, b) => b.score - a.score || b.quest.percent - a.quest.percent);
}

// -- Statistieken ----------------------------------------------------------

export function stats(data, platform) {
  const pick = (list) => (platform ? list.filter((x) => x.platform === platform) : list);
  const items = pick(data.items);
  const acts = pick(data.activities);
  const itemIds = new Set(items.map((i) => i.id));
  const noteIds = new Set(pick(data.notes).map((n) => n.id));
  const photos = (data.photos || []).filter(
    (p) => (p.itemId && itemIds.has(p.itemId)) || (p.noteId && noteIds.has(p.noteId))
  );
  const quests = pick(data.quests || []);
  return {
    quests: quests.filter((q) => !q.klaar).length,
    items: items.length,
    weapons: items.filter((i) => i.kind === "wapen").length,
    armor: items.filter((i) => i.kind === "armor").length,
    exotics: items.filter((i) => (i.rarity || "").toLowerCase() === "exotic").length,
    godRolls: items.filter((i) => (i.tags || []).some((t) => t.toLowerCase() === "god roll")).length,
    characters: pick(data.characters).length,
    activitiesDone: acts.filter((a) => a.status === "klaar").length,
    activitiesOpen: acts.filter((a) => a.status !== "klaar").length,
    notes: pick(data.notes).length,
    photos: photos.length,
  };
}

// =========================================================================
// Vragen stellen
// =========================================================================

export function norm(s) {
  return (s == null ? "" : String(s))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Woorden die niets zeggen over wát je zoekt.
const STOPWORDS = new Set([
  "welke", "welk", "wat", "waar", "wie", "hoeveel", "hoe", "veel", "heb", "hebben", "heeft",
  "ik", "mijn", "me", "mij", "m'n", "je", "jouw", "zijn", "is", "was", "de", "het", "een",
  "en", "of", "op", "in", "van", "voor", "met", "aan", "bij", "tot", "om", "te", "al",
  "nog", "moet", "moeten", "kan", "kun", "kunnen", "staat", "staan", "zit", "zitten",
  "ligt", "liggen", "er", "die", "dat", "deze", "dit", "als", "dan", "ook", "wel", "niet",
  "geen", "alle", "allemaal", "alles", "iets", "even", "eens", "zoek", "laat", "zien",
  "lijst", "geef", "vertel", "ding", "dingen", "doen", "over", "nu", "toch", "soort",
  "eigenlijk", "verder", "welke", "graag",
]);

function hasPhrase(text, phrase) {
  const p = norm(phrase);
  if (!p) return false;
  return new RegExp(`(^|\\s)${p.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`).test(text);
}

function stripPhrase(text, phrase) {
  const p = norm(phrase);
  return text
    .replace(new RegExp(`(^|\\s)${p.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Zoekt in een lijst { name, syn } welke er in de vraag staan en haalt de
// gevonden woorden uit de vraag, zodat de rest als naam-zoekterm overblijft.
function matchList(text, list) {
  const found = [];
  let rest = text;
  for (const entry of list) {
    const base = [entry.name, entry.plural, ...(entry.syn || [])].filter(Boolean);
    // Ook het meervoud herkennen: "hand cannons", "helmen", "zwaarden".
    const phrases = [...new Set(base.flatMap((b) => [b, `${b}s`, `${b}en`]))]
      .sort((a, b) => norm(b).length - norm(a).length);
    for (const phrase of phrases) {
      if (hasPhrase(rest, phrase)) {
        found.push(entry);
        rest = stripPhrase(rest, phrase);
        break;
      }
    }
  }
  return { found, rest };
}

const INTENTS = [
  { id: "count", syn: ["hoeveel", "aantal", "hoe veel"] },
  { id: "where", syn: ["waar", "op welk karakter", "welke kluis", "welk karakter"] },
  { id: "best", syn: ["sterkste", "hoogste", "beste", "best", "krachtigste", "zwaarste", "highest", "advies", "aanrader", "wat nu"] },
  { id: "worst", syn: ["zwakste", "laagste", "slechtste"] },
  { id: "missing", syn: ["nog niet", "niet gehaald", "mis ik", "mis", "ontbreekt", "ontbreken", "moet ik nog", "nog te doen", "openstaand", "todo"] },
  { id: "done", syn: ["gehaald", "afgerond", "voltooid", "uitgespeeld", "klaar", "gedaan", "behaald"] },
  { id: "overview", syn: ["overzicht", "samenvatting", "hoe sta ik ervoor", "stand van zaken", "hoeveel heb ik in totaal"] },
];

const SCOPES = [
  { id: "quests", syn: ["quest", "quests", "bounty", "bounties", "opdracht", "opdrachten", "pursuit"] },
  { id: "characters", syn: ["karakter", "karakters", "character", "characters", "guardian", "guardians"] },
  { id: "activities", syn: ["voortgang", "activiteit", "activiteiten", "progressie"] },
  { id: "notes", syn: ["notitie", "notities", "aantekening", "aantekeningen", "logboek", "opgeschreven"] },
];

const LOCATION_VAULT = ["kluis", "vault", "in de kluis"];

// "welke wapens heb ik met een foto erbij" / "waar heb ik een screenshot van"
const PHOTO_WORDS = ["foto", "fotos", "foto's", "screenshot", "screenshots", "plaatje", "kiekje"];

// Ontleed de vraag: bedoeling, waar het over gaat en de filters.
export function parseQuestion(question, data) {
  let text = norm(question);
  const filters = {
    platform: null, kinds: [], types: [], elements: [], rarities: [],
    classes: [], tags: [], activityKinds: [], location: null, locationClass: null,
    hasPhoto: false, terms: [],
  };

  // Overzichtsvraag eerst: die heeft geen filters nodig.
  const intents = [];
  for (const intent of INTENTS) {
    for (const phrase of intent.syn.slice().sort((a, b) => b.length - a.length)) {
      if (hasPhrase(text, phrase)) {
        intents.push(intent.id);
        text = stripPhrase(text, phrase);
        break;
      }
    }
  }

  // "op mijn titan" / "bij mijn hunter" = locatie, niet klasse-filter.
  const locMatch = text.match(/\b(op|bij|aan)\s+(mijn\s+|m'n\s+|de\s+)?(titan|hunter|jager|warlock|magier)\b/);
  if (locMatch) {
    const word = locMatch[3];
    const cls = CLASSES.find((c) => c.syn.includes(word) || norm(c.name) === word);
    if (cls) {
      filters.locationClass = cls.name;
      text = text.replace(locMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }
  for (const phrase of LOCATION_VAULT) {
    if (hasPhrase(text, phrase)) {
      filters.location = "kluis";
      text = stripPhrase(text, phrase);
    }
  }
  for (const phrase of PHOTO_WORDS) {
    if (hasPhrase(text, phrase)) {
      filters.hasPhoto = true;
      text = stripPhrase(text, phrase);
    }
  }

  const platform = matchList(text, PLATFORMS);
  if (platform.found.length) {
    filters.platform = platform.found[0].id;
    text = platform.rest;
  }

  const scope = matchList(text, SCOPES);
  let scopeId = scope.found.length ? scope.found[0].id : null;
  text = scope.rest;

  const acts = matchList(text, ACTIVITY_KINDS.filter((k) => k.id !== "overig"));
  if (acts.found.length) {
    filters.activityKinds = acts.found.map((k) => k.id);
    text = acts.rest;
    if (!scopeId) scopeId = "activities";
  }

  const tags = matchList(text, TAG_PRESETS);
  filters.tags = tags.found.map((t) => t.name);
  text = tags.rest;

  const rar = matchList(text, RARITIES);
  filters.rarities = rar.found.map((r) => r.name);
  text = rar.rest;

  const el = matchList(text, ELEMENTS);
  filters.elements = el.found.map((e) => e.name);
  text = el.rest;

  const allTypes = [...WEAPON_TYPES, ...ARMOR_TYPES, ...OTHER_TYPES];
  const ty = matchList(text, allTypes);
  filters.types = ty.found.map((t) => t.name);
  text = ty.rest;

  const kinds = matchList(text, KINDS);
  filters.kinds = kinds.found.map((k) => k.id);
  text = kinds.rest;

  const cls = matchList(text, CLASSES);
  filters.classes = cls.found.map((c) => c.name);
  text = cls.rest;

  // Wat overblijft: vrije zoekwoorden (een itemnaam, een perk, een woord uit
  // een notitie). Korte losse letters en stopwoorden vallen weg.
  filters.terms = text
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const geenFilters =
    !filters.kinds.length && !filters.types.length && !filters.terms.length &&
    !filters.tags.length && !filters.rarities.length && !filters.elements.length &&
    !filters.classes.length;

  if (!scopeId && intents.includes("best") && geenFilters) {
    // "Wat kan ik het best doen?" gaat over je lopende quests.
    scopeId = "quests";
  }

  if (!scopeId) {
    // Zonder aanwijzing: gaat het over de kluis, tenzij alleen naar voortgang
    // wordt gevraagd ("wat moet ik nog doen").
    if ((intents.includes("missing") || intents.includes("done")) &&
        !filters.kinds.length && !filters.types.length && !filters.terms.length &&
        !filters.tags.length && !filters.rarities.length && !filters.elements.length) {
      scopeId = "activities";
    } else {
      scopeId = "items";
    }
  }

  const intent =
    intents.find((i) => i === "overview") ||
    intents.find((i) => i === "count") ||
    intents.find((i) => i === "where") ||
    intents.find((i) => i === "best" || i === "worst") ||
    intents.find((i) => i === "missing" || i === "done") ||
    "list";

  return { intent, scope: scopeId, filters, rest: text, data };
}

function itemBlob(item, characters) {
  const char = characters.find((c) => c.id === item.location);
  return norm([
    item.name, item.type, item.kind, item.element, item.rarity, item.slot,
    item.charClass, item.perks, item.notes, (item.tags || []).join(" "),
    item.location === "kluis" ? "kluis vault" : char ? `${char.cls} ${char.name || ""}` : "",
    platformLabel(item.platform),
  ].join(" "));
}

export function filterItems(items, filters, characters) {
  return items.filter((item) => {
    if (filters.platform && item.platform !== filters.platform) return false;
    if (filters.kinds.length && !filters.kinds.includes(item.kind)) return false;
    if (filters.types.length && !filters.types.some((t) => norm(t) === norm(item.type))) return false;
    if (filters.elements.length && !filters.elements.some((e) => norm(e) === norm(item.element))) return false;
    if (filters.rarities.length && !filters.rarities.some((r) => norm(r) === norm(item.rarity))) return false;
    if (filters.classes.length && !filters.classes.some((c) => norm(c) === norm(item.charClass))) return false;
    if (filters.tags.length) {
      const own = (item.tags || []).map(norm);
      if (!filters.tags.every((t) => own.includes(norm(t)))) return false;
    }
    if (filters.location === "kluis" && item.location !== "kluis") return false;
    if (filters.locationClass) {
      const char = characters.find((c) => c.id === item.location);
      if (!char || norm(char.cls) !== norm(filters.locationClass)) return false;
    }
    if (filters.terms.length) {
      const blob = itemBlob(item, characters);
      if (!filters.terms.every((t) => blob.includes(t))) return false;
    }
    return true;
  });
}

export function filterActivities(activities, filters) {
  return activities.filter((a) => {
    if (filters.platform && a.platform !== filters.platform) return false;
    if (filters.activityKinds.length && !filters.activityKinds.includes(a.kind)) return false;
    if (filters.terms.length) {
      const blob = norm([a.name, a.notes, activityKindLabel(a.kind), statusLabel(a.status)].join(" "));
      if (!filters.terms.every((t) => blob.includes(t))) return false;
    }
    return true;
  });
}

// Korte omschrijving van waar de vraag over ging ("exotic hand cannons op PS5").
// Het zelfstandig naamwoord komt van het meest specifieke filter; de rest
// komt ervoor (bijvoeglijk) of erachter (locatie, platform).
function describe(filters, scope, n = 2) {
  const allTypes = [...WEAPON_TYPES, ...ARMOR_TYPES, ...OTHER_TYPES];
  // Bij precies één ding het enkelvoud gebruiken ("1 hand cannon").
  const nounOf = (entry, fallback) =>
    !entry ? fallback : n === 1 ? entry.name.toLowerCase() : pluralOf(entry);
  const before = [];
  if (filters.tags.length) before.push(filters.tags.join(" + "));

  let noun = "";
  if (filters.types.length) {
    noun = filters.types.map((t) => nounOf(entryByName(allTypes, t), t.toLowerCase())).join("/");
  } else if (filters.activityKinds.length) {
    noun = filters.activityKinds
      .map((k) => nounOf(ACTIVITY_KINDS.find((x) => x.id === k), activityKindLabel(k).toLowerCase()))
      .join("/");
  } else if (filters.kinds.length) {
    noun = filters.kinds.map((k) => nounOf(KINDS.find((x) => x.id === k), kindLabel(k).toLowerCase())).join("/");
  } else if (filters.rarities.length) {
    noun = filters.rarities.map((r) => nounOf(entryByName(RARITIES, r), r.toLowerCase())).join("/");
  } else if (scope === "activities") noun = n === 1 ? "activiteit" : "activiteiten";
  else if (scope === "characters") noun = n === 1 ? "karakter" : "karakters";
  else if (scope === "notes") noun = n === 1 ? "notitie" : "notities";
  else noun = n === 1 ? "ding" : "dingen";

  // Rarity als bijvoeglijk woord zodra er al een ander naamwoord staat.
  const firstRarity = entryByName(RARITIES, filters.rarities[0] || "");
  if (filters.rarities.length && noun !== nounOf(firstRarity, "")) {
    before.push(filters.rarities.map((r) => r.toLowerCase()).join("/"));
  }
  if (filters.elements.length) before.push(filters.elements.join("/"));
  if (filters.classes.length) before.push(filters.classes.join("/"));

  const after = [];
  if (filters.hasPhoto) after.push("met foto");
  if (filters.terms.length) after.push(`met "${filters.terms.join(" ")}"`);
  if (filters.location === "kluis") after.push("in de kluis");
  if (filters.locationClass) after.push(`op je ${filters.locationClass}`);
  if (filters.platform) after.push(`op ${platformLabel(filters.platform)}`);

  return [...before, noun, ...after].filter(Boolean).join(" ");
}

function itemWhere(item, characters) {
  if (item.location === "kluis" || !item.location) return "in de kluis";
  const char = characters.find((c) => c.id === item.location);
  return char ? `op je ${char.cls}${char.name ? ` (${char.name})` : ""}` : "in de kluis";
}

export function itemLine(item, characters) {
  const bits = [];
  if (item.rarity) bits.push(item.rarity);
  if (item.element && item.element !== "Kinetic") bits.push(item.element);
  if (item.type) bits.push(item.type);
  if (item.power) bits.push(`${item.power}`);
  bits.push(itemWhere(item, characters));
  bits.push(platformLabel(item.platform));
  return bits.filter(Boolean).join(" · ");
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Hoofdfunctie: vraag erin, antwoord + de gevonden regels eruit.
export function ask(question, data) {
  const q = (question || "").trim();
  if (!q) return { text: "Stel een vraag over je kluis, karakters of voortgang.", items: [], activities: [], characters: [], notes: [] };

  const parsed = parseQuestion(q, data);
  const { intent, filters, scope } = parsed;
  const characters = filters.platform ? data.characters.filter((c) => c.platform === filters.platform) : data.characters;
  const empty = { items: [], activities: [], characters: [], notes: [], quests: [] };
  const base = { question: q, intent, scope, filters, ...empty };

  if (intent === "overview") {
    const s = stats(data, filters.platform);
    const where = filters.platform ? ` op ${platformLabel(filters.platform)}` : " (PS5 + Xbox samen)";
    return {
      ...base,
      text:
        `In je opslag${where}: ${plural(s.items, "ding", "dingen")} in de kluis ` +
        `(${plural(s.weapons, "wapen", "wapens")}, ${s.armor}× armor, ` +
        `${plural(s.exotics, "exotic", "exotics")}, ${plural(s.godRolls, "god roll", "god rolls")}), ` +
        `${plural(s.characters, "karakter", "karakters")}, ` +
        `${s.activitiesDone} gehaald en ${s.activitiesOpen} nog te doen, ` +
        `${plural(s.quests, "openstaande quest", "openstaande quests")}, ` +
        `${plural(s.notes, "notitie", "notities")} en ${plural(s.photos, "foto", "foto's")}.`,
      characters,
    };
  }

  if (scope === "quests") {
    const advies = questAdvies(data.quests || [], data.activities || [], filters.platform);
    if (!advies.length) {
      const heeft = (data.quests || []).length;
      return {
        ...base,
        text: heeft
          ? "Al je opgehaalde quests staan op klaar. Haal ze opnieuw op voor de laatste stand."
          : "Er staan nog geen quests in de app. Een DIM-export bevat geen quests — alleen wapens en armor. " +
            "Zet ze er zelf bij via Voortgang → Quest, of haal ze op via de Bungie-koppeling (⚙️ → geavanceerd).",
      };
    }
    if (intent === "count") {
      return { ...base, text: `Je hebt ${plural(advies.length, "openstaande quest", "openstaande quests")}.`, quests: advies };
    }
    const top = advies[0];
    const tekst =
      advies.length === 1
        ? `Eén openstaande quest: ${top.quest.name} — ${top.redenen.join(", ")}.`
        : `Doe eerst ${top.quest.name} — ${top.redenen.join(", ")}. Daarna ${advies[1].quest.name} (${advies[1].redenen.join(", ")}).`;
    return { ...base, text: tekst, quests: advies };
  }

  if (scope === "characters") {
    let list = characters.slice();
    if (filters.classes.length) list = list.filter((c) => filters.classes.some((x) => norm(x) === norm(c.cls)));
    if (filters.terms.length) {
      list = list.filter((c) => {
        const blob = norm([c.cls, c.name, c.subclass, c.notes, platformLabel(c.platform)].join(" "));
        return filters.terms.every((t) => blob.includes(t));
      });
    }
    if (!list.length) return { ...base, text: "Nog geen karakters opgeslagen die daarbij passen. Voeg ze toe onder Karakters." };
    if (intent === "count") return { ...base, text: `Je hebt ${plural(list.length, "karakter", "karakters")} opgeslagen.`, characters: list };
    const withPower = list.filter((c) => Number(c.power) > 0);
    if ((intent === "best" || intent === "worst") && withPower.length) {
      const sorted = withPower.slice().sort((a, b) => (intent === "best" ? b.power - a.power : a.power - b.power));
      const top = sorted[0];
      return {
        ...base,
        text: `Je ${intent === "best" ? "hoogste" : "laagste"} karakter is je ${top.cls}${top.name ? ` (${top.name})` : ""} op ${platformLabel(top.platform)}: power ${top.power}.`,
        characters: sorted,
      };
    }
    return { ...base, text: `${plural(list.length, "karakter", "karakters")} gevonden:`, characters: list };
  }

  if (scope === "notes") {
    let list = data.notes.slice();
    if (filters.platform) list = list.filter((n) => n.platform === filters.platform);
    // "notities over raids": de soort telt hier als gewoon zoekwoord.
    if (filters.activityKinds.length) {
      filters.terms = [
        ...filters.terms,
        ...filters.activityKinds.map((k) => norm(activityKindLabel(k).split(" ")[0])),
      ];
    }
    if (filters.terms.length) {
      list = list.filter((n) => {
        const blob = norm([n.text, platformLabel(n.platform)].join(" "));
        return filters.terms.every((t) => blob.includes(t));
      });
    }
    if (filters.hasPhoto) {
      const withPhoto = new Set((data.photos || []).map((p) => p.noteId).filter(Boolean));
      list = list.filter((n) => withPhoto.has(n.id));
    }
    list.sort((a, b) => b.timestamp - a.timestamp);
    if (!list.length) return { ...base, text: "Geen notitie gevonden die daarbij past." };
    if (intent === "count") return { ...base, text: `Je hebt ${plural(list.length, "notitie", "notities")}${filters.terms.length ? ` met "${filters.terms.join(" ")}"` : ""}.`, notes: list };
    return { ...base, text: `${plural(list.length, "notitie", "notities")} gevonden:`, notes: list };
  }

  if (scope === "activities") {
    let list = filterActivities(data.activities, filters);
    if (intent === "missing") list = list.filter((a) => a.status !== "klaar");
    if (intent === "done") list = list.filter((a) => a.status === "klaar");
    const what0 = describe(filters, "activities", 2) || "activiteiten";
    if (!list.length) {
      const hint = data.activities.length
        ? "Staat het al onder Voortgang?"
        : "Er staat nog niets onder Voortgang — voeg raids, dungeons of catalysts toe.";
      return { ...base, text: `Geen ${what0} gevonden. ${hint}` };
    }
    const done = list.filter((a) => a.status === "klaar").length;
    const open = list.length - done;
    list.sort((a, b) => {
      const order = { todo: 0, bezig: 1, klaar: 2 };
      return (order[a.status] ?? 0) - (order[b.status] ?? 0) || norm(a.name).localeCompare(norm(b.name));
    });
    const what = describe(filters, "activities", list.length) || "activiteiten";
    if (intent === "count") return { ...base, text: `${list.length} ${what}: ${done} gehaald, ${open} nog open.`, activities: list };
    if (intent === "missing") return { ...base, text: `Nog ${list.length} ${what} te doen:`, activities: list };
    if (intent === "done") return { ...base, text: `${list.length} ${what} gehaald:`, activities: list };
    return { ...base, text: `${list.length} ${what}: ${done} gehaald, ${open} nog open.`, activities: list };
  }

  // scope === "items"
  let list = filterItems(data.items, filters, data.characters);
  if (filters.hasPhoto) {
    const withPhoto = new Set((data.photos || []).map((p) => p.itemId).filter(Boolean));
    list = list.filter((i) => withPhoto.has(i.id));
  }
  const what = describe(filters, "items", list.length) || (list.length === 1 ? "ding" : "dingen");
  if (!list.length) {
    const hint = data.items.length
      ? "Staat het al in je kluis? Voeg het toe onder Kluis, dan vind ik het volgende keer."
      : "Je kluis is nog leeg — voeg je eerste wapen of armor toe onder Kluis.";
    return {
      ...base,
      text: `Niets in je opslag dat past bij ${what}. ${hint}`.trim(),
      search: filters.terms.join(" "),
    };
  }

  const sortPower = (dir) =>
    list.slice().sort((a, b) => ((Number(b.power) || 0) - (Number(a.power) || 0)) * dir);

  if (intent === "count") {
    const exotics = list.filter((i) => norm(i.rarity) === "exotic").length;
    const extra = exotics && !filters.rarities.length ? ` (waarvan ${exotics} exotic)` : "";
    return { ...base, text: `Je hebt ${list.length} ${what}${extra}.`, items: sortPower(1) };
  }

  if (intent === "where") {
    if (list.length === 1) {
      const it = list[0];
      return { ...base, text: `${it.name} staat ${itemWhere(it, data.characters)} op ${platformLabel(it.platform)}.`, items: list };
    }
    const perPlace = {};
    list.forEach((i) => {
      const key = `${itemWhere(i, data.characters)} (${platformLabel(i.platform)})`;
      perPlace[key] = (perPlace[key] || 0) + 1;
    });
    const summary = Object.entries(perPlace).map(([k, v]) => `${v}× ${k}`).join(", ");
    return { ...base, text: `${list.length} ${what} — ${summary}:`, items: list };
  }

  if (intent === "best" || intent === "worst") {
    const withPower = list.filter((i) => Number(i.power) > 0);
    if (!withPower.length) {
      return { ...base, text: `Ik vond ${list.length} ${what}, maar nergens een power-waarde — vul die in om te kunnen vergelijken.`, items: list };
    }
    const sorted = withPower.slice().sort((a, b) => (intent === "best" ? b.power - a.power : a.power - b.power));
    const top = sorted[0];
    return {
      ...base,
      text: `${intent === "best" ? "Hoogste" : "Laagste"} van je ${what}: ${top.name} (${top.power}) — ${itemWhere(top, data.characters)} op ${platformLabel(top.platform)}.`,
      items: sorted,
    };
  }

  return { ...base, text: `${list.length} ${what}:`, items: sortPower(1) };
}

// Voorbeeldvragen — afgestemd op wat er daadwerkelijk in je opslag staat.
export function suggestions(data) {
  const out = ["Overzicht van mijn opslag"];
  const hasItems = data.items.length > 0;
  if (hasItems) {
    out.push("Hoeveel exotics heb ik op PS5?");
    const weapon = data.items.find((i) => i.kind === "wapen" && i.name);
    if (weapon) out.push(`Waar staat ${weapon.name}?`);
    out.push("Welke god rolls heb ik?");
    out.push("Wat is mijn sterkste wapen?");
    const armor = data.items.find((i) => i.kind === "armor");
    if (armor && armor.charClass) out.push(`Welke armor heb ik voor mijn ${armor.charClass}?`);
    out.push("Wat kan er weg uit mijn kluis?");
  } else {
    out.push("Hoeveel wapens heb ik op Xbox?");
    out.push("Welke god rolls heb ik?");
  }
  if (data.activities.length) {
    out.push("Welke raids heb ik nog niet gehaald?");
    out.push("Hoeveel dungeons heb ik gehaald op Xbox?");
  } else {
    out.push("Welke raids heb ik nog niet gehaald?");
  }
  if (data.characters.length) out.push("Wat is mijn sterkste karakter?");
  if ((data.quests || []).some((q) => !q.klaar)) out.push("Welke quest kan ik het best doen?");
  if ((data.photos || []).length) out.push("Waar heb ik een foto van?");
  return out.slice(0, 8);
}
