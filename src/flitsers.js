// Flitsers: opslag, geo-berekeningen en de OpenStreetMap-databron.
//
// Drie soorten controles die samen één beeld vormen:
//  - Losse camera's (OSM-nodes, highway=speed_camera): vaste flitspalen en
//    roodlichtcamera's.
//  - Trajectcontroles (OSM-relaties, type=enforcement + enforcement=average_speed):
//    een heel wegvak met begin, eind, maximumsnelheid en route. Die route
//    gebruiken we om live je gemiddelde snelheid over het traject te meten.
//  - Eigen locaties: handmatig toegevoegd op je huidige GPS-positie, voor
//    plekken die OSM mist. Blijven altijd lokaal op dit apparaat bewaard.
//
// Alles wordt lokaal gecached (localStorage) met een tijdstempel, zodat de app
// ook zonder internet de laatst opgehaalde lijst blijft gebruiken.

const KEY_OSM = "flitsers-osm-v2"; // v2 = inclusief trajectcontroles met route
const KEY_CUSTOM = "flitsers-custom-v1";
const KEY_SETTINGS = "flitsers-settings-v1";

const DEFAULT_SETTINGS = {
  warnDistance: 600, // meter — waarop de eerste waarschuwing afgaat
  muted: false,
  onlyAhead: true, // alleen waarschuwen voor camera's in rijrichting (als koers bekend is)
  notify: false, // ook een systeemmelding als de app op de achtergrond staat
  keepAwake: true, // scherm aan houden tijdens het rijden
};

// Nederland + ruime marge (België/Duitse grens net binnen bereik).
const BBOX = "50.6,3.2,53.7,7.3";

// Publieke Overpass-servers. Gratis en gedeeld, dus: op volgorde proberen en
// het resultaat lang bewaren.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

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

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(KEY_SETTINGS, {}) };
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  writeJson(KEY_SETTINGS, next);
  return next;
}

export const EMPTY_OSM = { fetchedAt: null, cameras: [], sections: [] };

export function loadOsmCameras() {
  const data = readJson(KEY_OSM, EMPTY_OSM);
  return {
    fetchedAt: data.fetchedAt || null,
    cameras: Array.isArray(data.cameras) ? data.cameras : [],
    sections: Array.isArray(data.sections) ? data.sections : [],
  };
}

function saveOsm(cameras, sections) {
  const data = { fetchedAt: Date.now(), cameras, sections };
  writeJson(KEY_OSM, data);
  return data;
}

export function loadCustomCameras() {
  return readJson(KEY_CUSTOM, []);
}

export function addCustomCamera(lat, lon, label = "") {
  const list = loadCustomCameras();
  const cam = {
    id: `custom-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
    lat,
    lon,
    kind: "custom",
    label: label || "Eigen locatie",
  };
  const next = [...list, cam];
  writeJson(KEY_CUSTOM, next);
  return next;
}

export function removeCustomCamera(id) {
  const next = loadCustomCameras().filter((c) => c.id !== id);
  writeJson(KEY_CUSTOM, next);
  return next;
}

// -- Geo-helpers -------------------------------------------------------

const R = 6371000; // aardstraal in meter
const toRad = (d) => (d * Math.PI) / 180;

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const COMPASS = ["noord", "noordoost", "oost", "zuidoost", "zuid", "zuidwest", "west", "noordwest"];

export function compassLabel(deg) {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// Lokale platte projectie (meters) rond een referentiebreedtegraad. Over de
// lengte van een traject (tientallen kilometers) ruim nauwkeurig genoeg en
// veel goedkoper dan Haversine per segment.
function localXY(lat, lon, lat0) {
  return [toRad(lon) * Math.cos(toRad(lat0)) * R, toRad(lat) * R];
}

// Cumulatieve afstand per routepunt; wordt op het traject zelf gecachet zodat
// dit maar één keer per traject gebeurt in plaats van bij elke GPS-update.
function cumulative(section) {
  if (section._cum) return section._cum;
  const cum = [0];
  for (let i = 1; i < section.path.length; i++) {
    const [aLat, aLon] = section.path[i - 1];
    const [bLat, bLon] = section.path[i];
    cum.push(cum[i - 1] + distanceMeters(aLat, aLon, bLat, bLon));
  }
  Object.defineProperty(section, "_cum", { value: cum, enumerable: false });
  return cum;
}

// Projecteert een positie op de route van een traject.
// Geeft { along, offset, fraction }: hoeveel meter je het traject in bent,
// hoe ver je van de route af zit (dus: rij je er überhaupt op), en de
// voortgang als fractie 0..1.
export function projectOnSection(section, lat, lon) {
  const path = section.path;
  if (!path || path.length < 2) return null;
  const cum = cumulative(section);
  const lat0 = path[0][0];
  const [px, py] = localXY(lat, lon, lat0);
  let best = null;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = localXY(path[i][0], path[i][1], lat0);
    const [bx, by] = localXY(path[i + 1][0], path[i + 1][1], lat0);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const offset = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (!best || offset < best.offset) {
      best = { offset, along: cum[i] + t * Math.sqrt(len2) };
    }
  }
  if (!best) return null;
  const length = cum[cum.length - 1] || 1;
  return { ...best, fraction: Math.max(0, Math.min(1, best.along / length)) };
}

// Kortste afstand tot een traject: het beginpunt telt als "nog te gaan", de
// rest van de route als "je zit er al op".
export function distanceToSection(section, lat, lon) {
  const proj = projectOnSection(section, lat, lon);
  const start = section.path[0];
  const toStart = distanceMeters(lat, lon, start[0], start[1]);
  if (!proj) return { dist: toStart, proj: null };
  return { dist: Math.min(toStart, proj.offset), proj };
}

// -- OpenStreetMap ophalen ---------------------------------------------

// Zet de losse wegdelen van een trajectcontrole achter elkaar tot één route.
// Relaties zijn meestal netjes op volgorde, maar een wegdeel kan omgekeerd in
// de relatie zitten; daarom plakken we steeds het dichtstbijzijnde uiteinde.
function chainWays(members) {
  const segs = members
    .filter((m) => m.type === "way" && Array.isArray(m.geometry) && m.geometry.length > 1)
    .map((m) => m.geometry.map((g) => [g.lat, g.lon]));
  if (!segs.length) return [];
  let first = segs[0];
  if (segs.length > 1) {
    // Richt het eerste wegdeel zo dat het eind bij het volgende deel aansluit.
    const next = segs[1][0];
    const dHead = distanceMeters(first[0][0], first[0][1], next[0], next[1]);
    const dTail = distanceMeters(
      first[first.length - 1][0], first[first.length - 1][1], next[0], next[1]
    );
    if (dHead < dTail) first = [...first].reverse();
  }
  const out = [...first];
  for (let i = 1; i < segs.length; i++) {
    let seg = segs[i];
    const tail = out[out.length - 1];
    const dStart = distanceMeters(tail[0], tail[1], seg[0][0], seg[0][1]);
    const dEnd = distanceMeters(
      tail[0], tail[1], seg[seg.length - 1][0], seg[seg.length - 1][1]
    );
    if (dEnd < dStart) seg = [...seg].reverse();
    // Gat groter dan 300 m: dit wegdeel hoort bij de andere rijrichting van
    // dezelfde relatie — die laten we buiten de route.
    if (Math.min(dStart, dEnd) > 300) continue;
    out.push(...seg.slice(1));
  }
  return out;
}

// Dunt de route uit tot punten van ~50 m uit elkaar en rondt af op 5 decimalen
// (~1 m). Scheelt een factor in de opslag zonder merkbaar verlies.
function simplifyPath(path, minStep = 50) {
  if (path.length < 3) return path.map(roundPoint);
  const out = [roundPoint(path[0])];
  let last = path[0];
  for (let i = 1; i < path.length - 1; i++) {
    if (distanceMeters(last[0], last[1], path[i][0], path[i][1]) >= minStep) {
      out.push(roundPoint(path[i]));
      last = path[i];
    }
  }
  out.push(roundPoint(path[path.length - 1]));
  return out;
}

function roundPoint(p) {
  return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
}

function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distanceMeters(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return total;
}

function parseMaxspeed(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Naam van een trajectcontrole: OSM zet die niet altijd op de relatie, dus
// vallen we terug op het wegnummer en anders op een generieke naam.
function sectionName(tags) {
  return tags.name || tags.ref || tags["enforcement:name"] || "Trajectcontrole";
}

async function overpass(query, signal) {
  let lastError = null;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.json();
    } catch (e) {
      if (signal && signal.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError || new Error("Geen Overpass-server bereikbaar");
}

// Haalt flitspalen én trajectcontroles op via de publieke Overpass API
// (OpenStreetMap). Geen API-key nodig.
export async function fetchOsmCameras({ signal } = {}) {
  const query = `[out:json][timeout:90];
node["highway"="speed_camera"](${BBOX})->.cams;
relation["type"="enforcement"]["enforcement"~"average_speed|maxspeed"](${BBOX})->.secs;
.cams out body;
.secs out geom;`;
  const json = await overpass(query, signal);
  const elements = json.elements || [];

  const sections = [];
  const deviceIds = new Set(); // camera's die bij een traject horen

  for (const el of elements) {
    if (el.type !== "relation") continue;
    const tags = el.tags || {};
    const members = el.members || [];
    for (const m of members) {
      if (m.type === "node" && m.role === "device") deviceIds.add(m.ref);
    }
    let path = chainWays(members);
    if (path.length < 2) {
      // Geen wegdelen in de relatie: dan tekenen we de rechte lijn tussen
      // begin- en eindpunt. Minder precies, maar wel zichtbaar en bruikbaar.
      const from = members.find((m) => m.role === "from" && m.lat != null);
      const to = members.find((m) => m.role === "to" && m.lat != null);
      if (from && to) path = [[from.lat, from.lon], [to.lat, to.lon]];
    }
    if (path.length < 2) continue;

    // Zorg dat de route begint bij het "from"-punt, zodat voortgang en
    // gemiddelde snelheid de rijrichting volgen.
    const from = members.find((m) => m.role === "from" && m.lat != null);
    if (from) {
      const dHead = distanceMeters(path[0][0], path[0][1], from.lat, from.lon);
      const dTail = distanceMeters(
        path[path.length - 1][0], path[path.length - 1][1], from.lat, from.lon
      );
      if (dTail < dHead) path = [...path].reverse();
    }

    const simplified = simplifyPath(path);
    const length = pathLength(simplified);
    const isAverage =
      tags.enforcement === "average_speed" || (tags.enforcement === "maxspeed" && length > 1000);
    if (!isAverage) {
      // Enkele handhavingscamera zonder traject: die zit al als node in .cams.
      continue;
    }
    if (length < 200) continue; // te kort om een echt traject te zijn

    const bearing = bearingDegrees(
      simplified[0][0], simplified[0][1],
      simplified[simplified.length - 1][0], simplified[simplified.length - 1][1]
    );
    sections.push({
      id: `osm-rel-${el.id}`,
      name: sectionName(tags),
      maxspeed: parseMaxspeed(tags.maxspeed),
      length: Math.round(length),
      bearing: Math.round(bearing),
      direction: compassLabel(bearing),
      path: simplified,
    });
  }

  const cameras = elements
    .filter(
      (el) =>
        el.type === "node" &&
        typeof el.lat === "number" &&
        typeof el.lon === "number" &&
        !deviceIds.has(el.id)
    )
    .map((el) => {
      const tags = el.tags || {};
      let kind = "fixed";
      if (tags.enforcement === "traffic_signals" || tags["camera:type"] === "red_light") {
        kind = "redlight";
      } else if (tags.enforcement === "mobile") {
        kind = "mobile";
      }
      return {
        id: `osm-${el.id}`,
        lat: el.lat,
        lon: el.lon,
        kind,
        maxspeed: parseMaxspeed(tags.maxspeed),
      };
    });

  return saveOsm(cameras, sections);
}

// -- Waarschuwingsgeluid (Web Audio, geen mediabestand nodig) -----------

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// intensity: 1 = ver (rustig), 2 = dichtbij (dubbele piep), 3 = te hard
// (drie hoge piepjes, bij een gemiddelde boven de limiet)
export function playAlertSound(intensity = 1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const beeps = intensity >= 3 ? 3 : intensity >= 2 ? 2 : 1;
  const freq = intensity >= 3 ? 1318 : intensity >= 2 ? 1046 : 880;
  for (let i = 0; i < beeps; i++) {
    const t0 = ctx.currentTime + i * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }
}

export function vibrateAlert(intensity = 1) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (intensity >= 3) navigator.vibrate([100, 60, 100, 60, 100]);
  else navigator.vibrate(intensity >= 2 ? [120, 80, 120] : [150]);
}

// Systeemmelding via de service worker, zodat een waarschuwing ook aankomt
// als het scherm uit staat of de app op de achtergrond draait.
export async function showAlertNotification(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag: "flitsers-live", // vervangt de vorige melding in plaats van stapelen
      renotify: true,
      icon: "icon-192.png",
      badge: "favicon-32.png",
      lang: "nl",
      data: { url: "./?app=flitsers" },
    });
  } catch {
    /* melding mislukt — de piep en trilling blijven over */
  }
}

export const KIND_LABEL = {
  fixed: "Flitspaal",
  section: "Trajectcontrole",
  redlight: "Roodlichtcamera",
  mobile: "Mobiele controle",
  custom: "Eigen locatie",
};
