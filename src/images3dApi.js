// Genereert een 3D-render-stijl afbeelding via Pollinations.ai — een
// volledig gratis, publieke text-to-image-API zonder account of API-key.
// Werkt direct vanuit de browser, geen eigen backend/Worker nodig.
//
// https://image.pollinations.ai/prompt/<omschrijving>?width=&height=&seed=&nologo=true

const BASE_URL = "https://image.pollinations.ai/prompt/";

export async function generateImage({ prompt, width, height }) {
  const clean = String(prompt || "").trim();
  if (!clean) throw new Error("Omschrijving is verplicht.");
  // Een willekeurige seed voorkomt dat dezelfde prompt+afmeting altijd
  // dezelfde (gecachete) afbeelding teruggeeft.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: "true",
    model: "flux",
  });
  const res = await fetch(`${BASE_URL}${encodeURIComponent(clean)}?${params.toString()}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Onverwacht antwoord van de beeldgenerator.");
  }
  return blob;
}
