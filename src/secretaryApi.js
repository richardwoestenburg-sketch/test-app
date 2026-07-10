// Client voor de Secretaresse-endpoints op dezelfde Cloudflare Worker die ook
// de Daglog-sync bedient (zelfde Worker-URL + sleutel, ingesteld via het
// tandwiel ⚙️ in de Daglog-tab).
import { getSyncConfig } from "./sync.js";
import { getCachedAccessToken, setCachedAccessToken } from "./msAuth.js";

function cfgOrThrow() {
  const cfg = getSyncConfig();
  if (!cfg) {
    const err = new Error("Stel eerst je Worker-koppeling in via het tandwiel ⚙️ (tab Daglog).");
    err.noWorker = true;
    throw err;
  }
  return cfg;
}

async function workerReq(path, options = {}) {
  const cfg = cfgOrThrow();
  const res = await fetch(cfg.baseUrl + path, {
    ...options,
    headers: {
      "X-Daglog-Key": cfg.key,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function hasWorkerConfigured() {
  return getSyncConfig() != null;
}

export async function connectAccount({ clientId, refreshToken, accessToken, expiresIn, email, name }) {
  const cfg = cfgOrThrow();
  return workerReq("/secretary/connect", {
    method: "POST",
    body: JSON.stringify({ clientId, workerUrl: cfg.baseUrl, refreshToken, accessToken, expiresIn, email, name }),
  });
}

export async function disconnectAccount() {
  return workerReq("/secretary/disconnect", { method: "POST" });
}

export async function fetchStatus() {
  return workerReq("/secretary/status", { method: "GET" });
}

export async function saveSettings(partial) {
  return workerReq("/secretary/settings", { method: "POST", body: JSON.stringify(partial) });
}

export async function fetchVapidPublicKey() {
  const cfg = cfgOrThrow();
  const res = await fetch(cfg.baseUrl + "/secretary/vapid-key");
  if (!res.ok) throw new Error("Kon VAPID-sleutel niet ophalen.");
  const data = await res.json();
  return data.publicKey;
}

export async function registerPushSubscription(subscription) {
  return workerReq("/secretary/push-subscribe", { method: "POST", body: JSON.stringify(subscription) });
}

export async function unregisterPushSubscription(endpoint) {
  return workerReq("/secretary/push-unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) });
}

// Geeft een geldig access-token terug voor directe Graph-aanroepen; ververst
// via de Worker (die het ververstoken beheert) zodra het gecachete token
// verlopen is.
export async function getAccessToken() {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  const data = await workerReq("/secretary/token", { method: "GET" });
  setCachedAccessToken(data.accessToken, data.expiresIn);
  return data.accessToken;
}
