// Afbeeldingen-tab: genereert een hoge-resolutie 3D-render-stijl afbeelding
// via OpenAI's Images API (gpt-image-1). De OPENAI_API_KEY-secret blijft op
// de Worker; de browser stuurt alleen de omschrijving + gewenste afmeting.

const ALLOWED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const MAX_PROMPT_LEN = 800;

export async function handleImages(request, env, path, origin, json) {
  if (path === "/images/generate" && request.method === "POST") {
    if (!env.OPENAI_API_KEY) {
      return json(
        { error: "OPENAI_API_KEY is niet ingesteld op de Worker. Zie worker/DEPLOY.md." },
        500,
        origin
      );
    }
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid json" }, 400, origin);
    }
    const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT_LEN);
    if (!prompt) return json({ error: "prompt required" }, 400, origin);
    const size = ALLOWED_SIZES.has(body.size) ? body.size : "1024x1024";

    let res;
    try {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
      });
    } catch {
      return json({ error: "Kon OpenAI niet bereiken." }, 502, origin);
    }

    if (!res.ok) {
      let message = `OpenAI-fout (${res.status})`;
      try {
        const errBody = await res.json();
        if (errBody?.error?.message) message = errBody.error.message;
      } catch {}
      return json({ error: message }, 502, origin);
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return json({ error: "Geen afbeelding ontvangen van OpenAI." }, 502, origin);
    return json({ imageBase64: b64, mimeType: "image/png" }, 200, origin);
  }

  return json({ error: "not found" }, 404, origin);
}
