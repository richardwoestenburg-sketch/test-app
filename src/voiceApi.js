// Client voor ElevenLabs (https://elevenlabs.io) — gebruikt om een stem te
// klonen (instant voice cloning) op basis van je eigen opnames, en om tekst
// in die gekloonde stem te laten voorlezen. Vereist een eigen ElevenLabs
// API-key (gratis laag beschikbaar); alle aanroepen gaan rechtstreeks van de
// browser naar ElevenLabs, er is geen eigen backend voor nodig.

const BASE_URL = "https://api.elevenlabs.io/v1";

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    const detail = data && data.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail.message === "string") return detail.message;
  } catch {
    /* geen JSON-body */
  }
  if (res.status === 401) return "Ongeldige ElevenLabs API-key.";
  if (res.status === 429) return "Limiet van je ElevenLabs-abonnement bereikt.";
  return `HTTP ${res.status}`;
}

async function throwForStatus(res) {
  const err = new Error(await readErrorMessage(res));
  err.status = res.status;
  throw err;
}

export async function addVoice({ apiKey, name, samples }) {
  if (!apiKey) throw new Error("Geen ElevenLabs API-key ingesteld.");
  if (!samples || samples.length === 0) throw new Error("Neem eerst minstens één stemopname op.");
  const form = new FormData();
  form.append("name", name || "Mijn stem");
  samples.forEach((blob, i) => form.append("files", blob, `sample-${i + 1}.webm`));
  const res = await fetch(`${BASE_URL}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) await throwForStatus(res);
  const data = await res.json();
  return { voiceId: data.voice_id, voiceName: name };
}

export async function deleteVoice({ apiKey, voiceId }) {
  if (!apiKey || !voiceId) return;
  const res = await fetch(`${BASE_URL}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok && res.status !== 404) await throwForStatus(res);
}

export async function textToSpeech({ apiKey, voiceId, text }) {
  if (!apiKey) throw new Error("Geen ElevenLabs API-key ingesteld.");
  if (!voiceId) throw new Error("Nog geen gekloonde stem.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Tekst is verplicht.");
  const res = await fetch(`${BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: clean,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) await throwForStatus(res);
  return res.blob();
}
