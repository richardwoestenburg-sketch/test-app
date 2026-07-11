// Lokale instellingen (ElevenLabs API-key + gekloonde stem) en een IndexedDB-
// geschiedenis van eerder gegenereerde audiofragmenten. De API-key en de
// voice-id worden alleen lokaal in de browser bewaard (localStorage) — er is
// geen eigen backend/Worker voor nodig, alle aanroepen gaan rechtstreeks van
// de browser naar ElevenLabs.
const CONFIG_KEY = "daglog-voice";
const DB_NAME = "voice-db";
const DB_VERSION = 1;
const STORE = "clips";

export function getVoiceConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return {};
    const cfg = JSON.parse(raw);
    return cfg && typeof cfg === "object" ? cfg : {};
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function getApiKey() {
  return getVoiceConfig().apiKey || "";
}

export function setApiKey(apiKey) {
  const cfg = getVoiceConfig();
  if (!apiKey) {
    delete cfg.apiKey;
  } else {
    cfg.apiKey = apiKey;
  }
  saveConfig(cfg);
}

export function getClonedVoice() {
  const cfg = getVoiceConfig();
  return cfg.voiceId ? { voiceId: cfg.voiceId, voiceName: cfg.voiceName || "" } : null;
}

export function setClonedVoice(voice) {
  const cfg = getVoiceConfig();
  if (!voice) {
    delete cfg.voiceId;
    delete cfg.voiceName;
  } else {
    cfg.voiceId = voice.voiceId;
    cfg.voiceName = voice.voiceName || "";
  }
  saveConfig(cfg);
}

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

export async function addClip({ text, blob }) {
  const db = await openDB();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    timestamp: new Date().toISOString(),
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

export async function getAllClips() {
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

export async function deleteClip(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAllClips() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
