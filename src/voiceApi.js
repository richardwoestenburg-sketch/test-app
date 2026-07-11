// Client voor Fish Audio (https://fish.audio) — gebruikt om een stem te
// klonen (instant voice cloning) op basis van je eigen opnames, en om tekst
// in die gekloonde stem te laten voorlezen. Vereist een eigen Fish Audio
// API-key (gratis laag beschikbaar, voor persoonlijk niet-commercieel
// gebruik); alle aanroepen gaan rechtstreeks van de browser naar Fish
// Audio, er is geen eigen backend voor nodig.

const BASE_URL = "https://api.fish.audio";

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
  } catch {
    /* geen JSON-body */
  }
  if (res.status === 401 || res.status === 403) return "Ongeldige Fish Audio API-key.";
  if (res.status === 429) return "Limiet van je Fish Audio-abonnement bereikt (gratis laag is beperkt per maand).";
  return `HTTP ${res.status}`;
}

async function throwForStatus(res) {
  const err = new Error(await readErrorMessage(res));
  err.status = res.status;
  throw err;
}

export async function addVoice({ apiKey, name, samples }) {
  if (!apiKey) throw new Error("Geen Fish Audio API-key ingesteld.");
  if (!samples || samples.length === 0) throw new Error("Neem eerst minstens één stemopname op.");
  const form = new FormData();
  form.append("title", name || "Mijn stem");
  form.append("type", "tts");
  form.append("visibility", "private");
  samples.forEach((blob, i) => form.append("voices", blob, `sample-${i + 1}.webm`));
  const res = await fetch(`${BASE_URL}/model`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) await throwForStatus(res);
  const data = await res.json();
  const voiceId = data._id || data.id;
  return { voiceId, voiceName: name };
}

export async function deleteVoice({ apiKey, voiceId }) {
  if (!apiKey || !voiceId) return;
  const res = await fetch(`${BASE_URL}/model/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok && res.status !== 404) await throwForStatus(res);
}

export async function textToSpeech({ apiKey, voiceId, text }) {
  if (!apiKey) throw new Error("Geen Fish Audio API-key ingesteld.");
  if (!voiceId) throw new Error("Nog geen gekloonde stem.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Tekst is verplicht.");
  const res = await fetch(`${BASE_URL}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: clean,
      reference_id: voiceId,
      format: "mp3",
    }),
  });
  if (!res.ok) await throwForStatus(res);
  return res.blob();
}
