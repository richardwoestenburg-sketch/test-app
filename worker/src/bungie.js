// Bungie-koppeling voor de Destiny-app.
//
// Waarom via de Worker: een "confidential" app bij Bungie geeft naast een
// access-token (1 uur) ook een refresh-token (90 dagen), zodat je niet elk uur
// opnieuw hoeft in te loggen. Daarvoor is een client_secret nodig, en die mag
// niet in een webapp staan — dus doet de Worker de uitwisseling.
//
// Secrets op de Worker:
//   BUNGIE_CLIENT_ID      client id van je Bungie-app (confidential)
//   BUNGIE_CLIENT_SECRET  het bijbehorende geheim
//   BUNGIE_API_KEY        optioneel; wordt meegestuurd als Bungie erom vraagt
//
// De app praat alleen met deze twee routes en stuurt daarbij, net als de rest
// van de Worker, de gedeelde sleutel mee (X-Daglog-Key).

const TOKEN_URL = "https://www.bungie.net/platform/app/oauth/token/";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Daglog-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

async function exchange(env, params, origin) {
  const clientId = env.BUNGIE_CLIENT_ID;
  const clientSecret = env.BUNGIE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return json(
      { error: "bungie_not_configured", message: "BUNGIE_CLIENT_ID en BUNGIE_CLIENT_SECRET ontbreken op de Worker." },
      500,
      origin
    );
  }

  const body = new URLSearchParams({ ...params, client_id: clientId });
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        ...(env.BUNGIE_API_KEY ? { "X-API-Key": env.BUNGIE_API_KEY } : {}),
      },
      body: body.toString(),
    });
  } catch {
    return json({ error: "bungie_unreachable", message: "Bungie is niet bereikbaar vanaf de Worker." }, 502, origin);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.access_token) {
    return json(
      {
        error: data?.error || "bungie_error",
        message: data?.error_description || `Bungie gaf status ${res.status}.`,
      },
      res.status === 401 ? 401 : 502,
      origin
    );
  }

  // Alleen doorgeven wat de app nodig heeft — het geheim blijft hier.
  return json(
    {
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || null,
      refresh_expires_in: data.refresh_expires_in || null,
      membership_id: data.membership_id || null,
    },
    200,
    origin
  );
}

export async function handleBungie(request, env, url, origin, path) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  if (path === "/bungie/token") {
    if (!body.code) return json({ error: "code_required" }, 400, origin);
    return exchange(env, { grant_type: "authorization_code", code: String(body.code) }, origin);
  }

  if (path === "/bungie/refresh") {
    if (!body.refresh_token) return json({ error: "refresh_token_required" }, 400, origin);
    return exchange(env, { grant_type: "refresh_token", refresh_token: String(body.refresh_token) }, origin);
  }

  return json({ error: "not_found" }, 404, origin);
}
