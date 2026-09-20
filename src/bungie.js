// Koppeling met de officiële Bungie-API (Destiny 2).
//
// Wat het doet: je logt één keer in met je Bungie-account, waarna de app je
// karakters en je kluis kan ophalen — namen, soort, rarity, element, power,
// waar iets staat en (voor wat je importeert) de perks. Je eigen labels,
// notities en foto's blijven daarbij altijd staan; alleen de spelgegevens
// worden bijgewerkt.
//
// Opzet: een "public" OAuth-app bij Bungie heeft geen geheime sleutel nodig,
// dus alles kan rechtstreeks vanuit de browser. Nadeel: zo'n token is een uur
// geldig en er is geen refresh-token, dus voor een volgende synchronisatie log
// je opnieuw in. Dat is prima, want synchroniseren doe je met de hand.
//
// Documentatie: https://github.com/Bungie-net/api/wiki/OAuth-Documentation

const ROOT = "https://www.bungie.net";
const API = `${ROOT}/Platform`;

const KEY_CFG = "destiny-bungie-config";
const KEY_TOKEN = "destiny-bungie-token";
const KEY_LINKS = "destiny-bungie-links";
const KEY_STATE = "destiny-bungie-state";

// Onze state begint hiermee, zodat App.jsx een terugkomst van Bungie herkent
// en meteen de Destiny-app opent.
export const STATE_PREFIX = "dst-";

// membershipType uit de Bungie-API.
export const MEMBERSHIP_TYPES = {
  1: { name: "Xbox", platform: "xbox" },
  2: { name: "PlayStation", platform: "ps5" },
  3: { name: "Steam", platform: null },
  4: { name: "Blizzard", platform: null },
  5: { name: "Stadia", platform: null },
  6: { name: "Epic Games", platform: null },
};

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
  } catch {}
}

// -- Instellingen ----------------------------------------------------------

export function getConfig() {
  const c = readJson(KEY_CFG, null);
  return { apiKey: "", clientId: "", ...(c && typeof c === "object" ? c : {}) };
}

export function saveConfig(cfg) {
  writeJson(KEY_CFG, { apiKey: (cfg.apiKey || "").trim(), clientId: (cfg.clientId || "").trim() });
  return getConfig();
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.apiKey && c.clientId);
}

// De URL die je bij Bungie als "Redirect URL" moet invullen: de app zelf,
// zonder vraagtekens erachter (Bungie vergelijkt letterlijk).
export function redirectUrl() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

// -- Token -----------------------------------------------------------------

export function getToken() {
  const t = readJson(KEY_TOKEN, null);
  if (!t || !t.accessToken) return null;
  if (t.expiresAt && t.expiresAt < Date.now()) return null;
  return t;
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function logout() {
  try { localStorage.removeItem(KEY_TOKEN); } catch {}
}

export function getLinks() {
  const l = readJson(KEY_LINKS, null);
  return { ps5: null, xbox: null, ...(l && typeof l === "object" ? l : {}) };
}

export function saveLinks(links) {
  writeJson(KEY_LINKS, links);
  return getLinks();
}

// -- Inloggen --------------------------------------------------------------

export function startLogin() {
  const { clientId } = getConfig();
  const state = STATE_PREFIX + Math.random().toString(36).slice(2, 12);
  try { localStorage.setItem(KEY_STATE, state); } catch {}
  // Let op: géén scope-parameter meesturen, die wijst Bungie af.
  window.location.href =
    `${ROOT}/en/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code&state=${encodeURIComponent(state)}`;
}

// Komt de huidige pagina terug van Bungie? Dan staan code en state in de URL.
export function pendingRedirect() {
  try {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("code");
    const state = p.get("state");
    if (code && state && state.startsWith(STATE_PREFIX)) return { code, state };
  } catch {}
  return null;
}

function clearRedirectFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

export async function completeLogin({ code, state }) {
  const saved = localStorage.getItem(KEY_STATE);
  clearRedirectFromUrl();
  if (!saved || saved !== state) {
    throw new Error("De terugkoppeling van Bungie hoorde niet bij deze inlogpoging. Probeer opnieuw in te loggen.");
  }
  try { localStorage.removeItem(KEY_STATE); } catch {}

  const { clientId, apiKey } = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
  });
  const res = await fetch(`${API}/App/OAuth/Token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-API-Key": apiKey },
    body: body.toString(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.access_token) {
    const detail = json?.error_description || json?.error || `status ${res.status}`;
    throw new Error(`Inloggen bij Bungie lukte niet (${detail}).`);
  }
  writeJson(KEY_TOKEN, {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    membershipId: json.membership_id || null,
  });
  return getToken();
}

// -- API-aanroepen ---------------------------------------------------------

export class BungieError extends Error {
  constructor(message, { status, code, needsLogin } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.needsLogin = Boolean(needsLogin);
  }
}

async function api(path, { auth = true } = {}) {
  const { apiKey } = getConfig();
  if (!apiKey) throw new BungieError("Er is nog geen Bungie API-key ingesteld.");
  const headers = { "X-API-Key": apiKey };
  if (auth) {
    const token = getToken();
    if (!token) throw new BungieError("Je Bungie-sessie is verlopen. Log opnieuw in.", { needsLogin: true });
    headers.Authorization = `Bearer ${token.accessToken}`;
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, { headers });
  } catch {
    throw new BungieError("Geen verbinding met Bungie. Ben je online?");
  }
  if (res.status === 401) {
    logout();
    throw new BungieError("Je Bungie-sessie is verlopen. Log opnieuw in.", { status: 401, needsLogin: true });
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new BungieError(`Onverwacht antwoord van Bungie (status ${res.status}).`, { status: res.status });
  if (json.ErrorCode && json.ErrorCode !== 1) {
    throw new BungieError(json.Message || `Bungie gaf een fout (${json.ErrorStatus}).`, { code: json.ErrorCode });
  }
  return json.Response;
}

// Alle Destiny-profielen die aan je Bungie-account hangen. Zonder cross save
// is dat er één per platform (PlayStation, Xbox, …).
export async function getMemberships() {
  const r = await api("/User/GetMembershipsForCurrentUser/");
  return (r?.destinyMemberships || []).map((m) => ({
    membershipType: m.membershipType,
    membershipId: m.membershipId,
    displayName: m.bungieGlobalDisplayName
      ? `${m.bungieGlobalDisplayName}#${m.bungieGlobalDisplayNameCode}`
      : m.displayName || "",
    typeName: MEMBERSHIP_TYPES[m.membershipType]?.name || `Platform ${m.membershipType}`,
    suggestedPlatform: MEMBERSHIP_TYPES[m.membershipType]?.platform || null,
    crossSaveOverride: m.crossSaveOverride || 0,
  }));
}

// 100 profiel · 102 kluis · 200 karakters · 201 inventaris per karakter
// 205 uitgerust · 300 instantiegegevens (power) · 305 sockets (perks)
const COMPONENTS = "100,102,200,201,205,300,305";

export async function getProfile(membershipType, membershipId) {
  return api(`/Destiny2/${membershipType}/Profile/${membershipId}/?components=${COMPONENTS}`);
}

// -- Definities (namen, soorten) met eigen cache ---------------------------
//
// De API geeft alleen hashes terug; de bijbehorende omschrijving haal je per
// stuk op. Dat cachen we, zodat een tweede synchronisatie bijna niets meer
// hoeft op te halen.

const DEF_DB = "destiny-bungie-db";
const DEF_STORE = "defs";

function openDefDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEF_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DEF_STORE)) db.createObjectStore(DEF_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCachedDefs(keys) {
  const found = new Map();
  if (!keys.length) return found;
  let db;
  try { db = await openDefDb(); } catch { return found; }
  await new Promise((resolve) => {
    const tx = db.transaction(DEF_STORE, "readonly");
    const store = tx.objectStore(DEF_STORE);
    keys.forEach((key) => {
      const req = store.get(key);
      req.onsuccess = () => { if (req.result) found.set(key, req.result.value); };
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
  return found;
}

async function writeCachedDefs(entries) {
  if (!entries.length) return;
  let db;
  try { db = await openDefDb(); } catch { return; }
  await new Promise((resolve) => {
    const tx = db.transaction(DEF_STORE, "readwrite");
    const store = tx.objectStore(DEF_STORE);
    entries.forEach(([key, value]) => store.put({ key, value }));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function clearDefinitionCache() {
  let db;
  try { db = await openDefDb(); } catch { return; }
  await new Promise((resolve) => {
    const tx = db.transaction(DEF_STORE, "readwrite");
    tx.objectStore(DEF_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

// Haalt definities op voor een lijst hashes: eerst uit de cache, de rest in
// kleine porties tegelijk (niet te veel ineens, dat vindt Bungie niet leuk).
export async function getDefinitions(entityType, hashes, onProgress) {
  const unique = [...new Set(hashes.filter((h) => h != null).map(String))];
  const out = new Map();
  const cached = await readCachedDefs(unique.map((h) => `${entityType}:${h}`));
  const missing = [];
  unique.forEach((h) => {
    const hit = cached.get(`${entityType}:${h}`);
    if (hit) out.set(h, hit);
    else missing.push(h);
  });

  let done = unique.length - missing.length;
  onProgress?.(done, unique.length);

  const CHUNK = 6;
  const fresh = [];
  for (let i = 0; i < missing.length; i += CHUNK) {
    const part = missing.slice(i, i + CHUNK);
    const results = await Promise.all(
      part.map((hash) =>
        api(`/Destiny2/Manifest/${entityType}/${hash}/`, { auth: false }).catch(() => null)
      )
    );
    results.forEach((def, idx) => {
      if (!def) return;
      const hash = part[idx];
      out.set(hash, def);
      fresh.push([`${entityType}:${hash}`, def]);
    });
    done += part.length;
    onProgress?.(Math.min(done, unique.length), unique.length);
  }
  await writeCachedDefs(fresh);
  return out;
}

// -- Vertaling naar het model van de app -----------------------------------

const CLASS_BY_TYPE = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
const ELEMENT_BY_DAMAGE = { 1: "Kinetic", 2: "Arc", 3: "Solar", 4: "Void", 6: "Stasis", 7: "Strand" };
// itemSubType voor armor; wapens hebben een bruikbare itemTypeDisplayName.
const ARMOR_BY_SUBTYPE = { 26: "Helm", 27: "Handschoenen", 28: "Bruststuk", 29: "Beenstukken", 30: "Klasse-item" };

export function mapCharacters(profile) {
  const data = profile?.characters?.data || {};
  return Object.values(data).map((c) => ({
    bungieId: c.characterId,
    cls: CLASS_BY_TYPE[c.classType] || "Titan",
    power: Number(c.light) || null,
    lastPlayed: c.dateLastPlayed || null,
  }));
}

// Alles wat je bezit: de kluis plus per karakter de inventaris en wat er
// aan staat. Alleen dingen met een itemInstanceId (dus geen stapels munitie).
export function collectRawItems(profile) {
  const rows = [];
  const push = (list, location) => {
    (list || []).forEach((it) => {
      if (!it.itemInstanceId) return;
      rows.push({
        itemHash: String(it.itemHash),
        instanceId: it.itemInstanceId,
        location,
        state: it.state || 0,
      });
    });
  };
  push(profile?.profileInventory?.data?.items, "kluis");
  const inv = profile?.characterInventories?.data || {};
  Object.entries(inv).forEach(([charId, d]) => push(d.items, charId));
  const eq = profile?.characterEquipment?.data || {};
  Object.entries(eq).forEach(([charId, d]) => push(d.items, charId));
  return rows;
}

// Maakt van de ruwe regels dingen zoals de app ze kent. Alleen wapens en
// armor: munitie, mods en materialen laten we buiten je kluis.
export async function mapItems(profile, { onProgress, platform } = {}) {
  const raw = collectRawItems(profile);
  const defs = await getDefinitions(
    "DestinyInventoryItemDefinition",
    raw.map((r) => r.itemHash),
    onProgress
  );
  const instances = profile?.itemComponents?.instances?.data || {};

  const items = [];
  for (const row of raw) {
    const def = defs.get(row.itemHash);
    if (!def) continue;
    const kind = def.itemType === 3 ? "wapen" : def.itemType === 2 ? "armor" : null;
    if (!kind) continue;

    const inst = instances[row.instanceId] || {};
    const tags = [];
    if ((row.state & 1) === 1) tags.push("favoriet"); // in de game vergrendeld
    if ((row.state & 4) === 4) tags.push("masterwork");

    items.push({
      instanceId: row.instanceId,
      bungieHash: row.itemHash,
      platform,
      kind,
      name: def.displayProperties?.name || "Onbekend",
      type: kind === "armor"
        ? ARMOR_BY_SUBTYPE[def.itemSubType] || def.itemTypeDisplayName || ""
        : def.itemTypeDisplayName || "",
      element: kind === "wapen" ? ELEMENT_BY_DAMAGE[def.defaultDamageType] || "" : "",
      rarity: def.inventory?.tierTypeName || "",
      charClass: kind === "armor" ? CLASS_BY_TYPE[def.classType] || "" : "",
      power: Number(inst.primaryStat?.value) || null,
      location: row.location,
      tags,
      locked: (row.state & 1) === 1,
      icon: def.displayProperties?.icon || "",
    });
  }
  return items;
}

// Perks/roll van één ding. Dit kost per ding een paar aanroepen, dus doen we
// alleen voor wat je daadwerkelijk importeert.
const SKIP_PLUG = ["shader", "ornament", "tracker", "masterwork", "mod_", "skins", "empty", "glow"];

export async function perksFor(profile, instanceId, onProgress) {
  const sockets = profile?.itemComponents?.sockets?.data?.[instanceId]?.sockets || [];
  const hashes = sockets.filter((s) => s.plugHash && s.isVisible !== false).map((s) => String(s.plugHash));
  if (!hashes.length) return "";
  const defs = await getDefinitions("DestinyInventoryItemDefinition", hashes, onProgress);
  const names = [];
  hashes.forEach((h) => {
    const def = defs.get(h);
    if (!def) return;
    const cat = (def.plug?.plugCategoryIdentifier || "").toLowerCase();
    if (SKIP_PLUG.some((s) => cat.includes(s))) return;
    const name = def.displayProperties?.name;
    if (name && !names.includes(name)) names.push(name);
  });
  return names.join(" / ");
}
