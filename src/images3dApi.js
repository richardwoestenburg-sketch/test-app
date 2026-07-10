// Client voor het (nog te bouwen) /images/generate-endpoint op dezelfde
// Cloudflare Worker die ook de Daglog-sync bedient (zelfde Worker-URL +
// sleutel, ingesteld via het tandwiel ⚙️ in de Daglog-tab). De Worker houdt
// de API-key van de beeldgenerator geheim; de browser stuurt alleen de
// omschrijving + gewenste afmeting.
//
// Verwacht contract: POST /images/generate met { prompt, size } als JSON,
// antwoord { imageBase64, mimeType } (base64-gecodeerde PNG/JPEG).
import { getSyncConfig } from "./sync.js";

function cfgOrThrow() {
  const cfg = getSyncConfig();
  if (!cfg) {
    const err = new Error("Stel eerst je Worker-koppeling in via het tandwiel ⚙️ (tab Daglog).");
    err.noWorker = true;
    throw err;
  }
  return cfg;
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function hasWorkerConfigured() {
  return getSyncConfig() != null;
}

export async function generateImage({ prompt, size }) {
  const cfg = cfgOrThrow();
  const res = await fetch(cfg.baseUrl + "/images/generate", {
    method: "POST",
    headers: {
      "X-Daglog-Key": cfg.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, size }),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data.imageBase64) throw new Error("Onverwacht antwoord van de Worker.");
  return base64ToBlob(data.imageBase64, data.mimeType || "image/png");
}
