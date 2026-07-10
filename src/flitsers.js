// Flitsers: opslag, geo-berekeningen en de OpenStreetMap-databron.
//
// Twee camera-bronnen die samen één lijst vormen:
//  - OSM (Overpass API): vaste flitspalen en trajectcontroles, gratis en
//    zonder account. Wordt lokaal gecached (localStorage) met een tijdstempel
//    zodat de app ook zonder internet nog de laatst opgehaalde lijst toont.
//  - Eigen locaties: handmatig toegevoegd op je huidige GPS-positie, voor
//    plekken die OSM mist. Blijven altijd lokaal op dit apparaat bewaard.

const KEY_OSM = "flitsers-osm-v1";
const KEY_CUSTOM = "flitsers-custom-v1";
const KEY_SETTINGS = "flitsers-settings-v1";

const DEFAULT_SETTINGS = {
  warnDistance: 600, // meter — waarop de eerste waarschuwing afgaat
  muted: false,
  onlyAhead: true, // alleen waarschuwen voor camera's in rijrichting (als koers bekend is)
};

// Nederland + ruime marge (België/Duitse grens net binnen bereik).
const BBOX = "50.6,3.2,53.7,7.3";

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

export function loadOsmCameras() {
  return readJson(KEY_OSM, { fetchedAt: null, cameras: [] });
}

function saveOsmCameras(cameras) {
  const data = { fetchedAt: Date.now(), cameras };
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

// Haalt vaste flitspalen en trajectcontroles op via de publieke Overpass API
// (OpenStreetMap). Geen API-key nodig; wel afhankelijk van een gratis,
// gedeelde server — bewaar het resultaat dus lokaal en ververs niet te vaak.
export async function fetchOsmCameras({ signal } = {}) {
  const query = `[out:json][timeout:25];(node["highway"="speed_camera"](${BBOX});node["enforcement"](${BBOX}););out body;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass gaf status ${res.status}`);
  const json = await res.json();
  const cameras = (json.elements || [])
    .filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number")
    .map((el) => {
      const tags = el.tags || {};
      let kind = "fixed";
      if (tags.enforcement === "average_speed") kind = "section";
      else if (tags.enforcement === "mobile") kind = "mobile";
      return {
        id: `osm-${el.id}`,
        lat: el.lat,
        lon: el.lon,
        kind,
        maxspeed: tags.maxspeed || null,
      };
    });
  saveOsmCameras(cameras);
  return { fetchedAt: Date.now(), cameras };
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

// intensity: 1 = ver (rustig), 2 = dichtbij (dubbele piep)
export function playAlertSound(intensity = 1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const beeps = intensity >= 2 ? 2 : 1;
  for (let i = 0; i < beeps; i++) {
    const t0 = ctx.currentTime + i * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(intensity >= 2 ? 1046 : 880, t0);
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
  navigator.vibrate(intensity >= 2 ? [120, 80, 120] : [150]);
}

export const KIND_LABEL = {
  fixed: "Flitspaal",
  section: "Trajectcontrole",
  mobile: "Mobiele controle",
  custom: "Eigen locatie",
};
