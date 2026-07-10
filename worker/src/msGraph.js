// Kleine helpers rond Microsoft's OAuth-tokenendpoint en de Graph API.
// De Worker praat hier als "public client" (geen client secret) — precies
// zoals de browser dat ook doet, met dezelfde clientId die de gebruiker in
// de app heeft ingevuld.
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite";

export async function refreshAccessToken(clientId, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token verversen mislukt (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function graphFetch(accessToken, path, options = {}) {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

export async function createSubscription(accessToken, resource, changeType, notificationUrl, clientState, expirationDateTime) {
  const res = await graphFetch(accessToken, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({ changeType, notificationUrl, resource, expirationDateTime, clientState }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Abonnement aanmaken mislukt (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function renewSubscription(accessToken, id, expirationDateTime) {
  const res = await graphFetch(accessToken, `/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Abonnement verlengen mislukt (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function deleteSubscription(accessToken, id) {
  try {
    await graphFetch(accessToken, `/subscriptions/${id}`, { method: "DELETE" });
  } catch {
    /* best-effort opruimen */
  }
}
