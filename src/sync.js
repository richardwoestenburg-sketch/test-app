// Client for the Daglog Cloudflare Worker backend.
// When configured with a base URL + shared key, the app reads/writes its
// entries to the Worker (so phone, watch and any browser share one journal).
// When not configured, the app stays fully local (localStorage only).

const CONFIG_KEY = "daglog-sync";

export function getSyncConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg && cfg.baseUrl && cfg.key) {
      return { baseUrl: String(cfg.baseUrl).replace(/\/+$/, ""), key: String(cfg.key) };
    }
    return null;
  } catch {
    return null;
  }
}

export function setSyncConfig(cfg) {
  if (!cfg || !cfg.baseUrl || !cfg.key) {
    localStorage.removeItem(CONFIG_KEY);
    return;
  }
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ baseUrl: String(cfg.baseUrl).replace(/\/+$/, ""), key: String(cfg.key) })
  );
}

export function isSyncConfigured() {
  return getSyncConfig() != null;
}

async function req(cfg, path, options = {}) {
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

export async function testConnection(cfg) {
  await req(cfg, "/entries", { method: "GET" });
  return true;
}

export async function fetchEntries(cfg) {
  const data = await req(cfg, "/entries", { method: "GET" });
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function addEntry(cfg, payload) {
  const data = await req(cfg, "/entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function deleteEntry(cfg, id) {
  const data = await req(cfg, "/entries?id=" + encodeURIComponent(id), { method: "DELETE" });
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function clearAll(cfg) {
  const data = await req(cfg, "/entries?all=1", { method: "DELETE" });
  return Array.isArray(data.entries) ? data.entries : [];
}
