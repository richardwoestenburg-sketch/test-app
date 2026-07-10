// Microsoft-inloggen (OAuth2 Authorization Code + PKCE) voor de
// Secretaresse-tab. De browser doet de inlogstap zelf (geen client secret
// nodig — dat is precies waar PKCE voor is). Het ververstoken wordt eenmalig
// aan de Worker gegeven (zie secretaryApi.js); die beheert het daarna
// (verversen, achtergrondmeldingen) zodat de app het zelf niet hoeft te
// bewaren.
const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite";

const CLIENT_ID_KEY = "secretary-client-id";
const STATE_KEY = "secretary-oauth-state";
const VERIFIER_KEY = "secretary-oauth-verifier";
const TOKEN_CACHE_KEY = "secretary-token-cache";

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || "";
}

export function setClientId(id) {
  if (id) localStorage.setItem(CLIENT_ID_KEY, id);
  else localStorage.removeItem(CLIENT_ID_KEY);
}

function base64url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(len = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(len)));
}

async function sha256base64url(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

export async function beginSignIn() {
  const clientId = getClientId();
  if (!clientId) throw new Error("Vul eerst je Microsoft Client-ID in.");
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const challenge = await sha256base64url(verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

// Op te roepen bij het laden van de app: verwerkt de redirect terug van
// Microsoft, als die er is. Geeft null terug als er niets te verwerken viel.
export async function completeSignInIfRedirected() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error_description") || params.get("error");
  if (!code && !error) return null;

  // Haal de OAuth-parameters altijd uit de zichtbare URL, ook bij een fout.
  window.history.replaceState({}, "", window.location.origin + window.location.pathname);

  if (error) return { error };

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier || !state || state !== expectedState) {
    return { error: "Ongeldige inlogstatus (state mismatch) — probeer opnieuw in te loggen." };
  }

  const clientId = getClientId();
  if (!clientId) return { error: "Client-ID ontbreekt — probeer opnieuw in te loggen." };

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    scope: SCOPES,
  });
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { error: "Kon geen verbinding maken met Microsoft om in te loggen." };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `Inloggen mislukt (${res.status}). ${text.slice(0, 200)}` };
  }
  const tokens = await res.json();

  let profile = {};
  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) profile = await meRes.json();
  } catch {
    /* niet kritiek voor de koppeling zelf */
  }

  cacheAccessToken(tokens.access_token, tokens.expires_in);

  return {
    ok: true,
    clientId,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    email: profile.mail || profile.userPrincipalName || null,
    name: profile.displayName || null,
  };
}

function cacheAccessToken(accessToken, expiresIn) {
  sessionStorage.setItem(
    TOKEN_CACHE_KEY,
    JSON.stringify({ accessToken, expiry: Date.now() + (Number(expiresIn || 3600) - 60) * 1000 })
  );
}

export function getCachedAccessToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const { accessToken, expiry } = JSON.parse(raw);
    return expiry > Date.now() ? accessToken : null;
  } catch {
    return null;
  }
}

export function setCachedAccessToken(accessToken, expiresIn) {
  cacheAccessToken(accessToken, expiresIn);
}

export function clearCachedAccessToken() {
  sessionStorage.removeItem(TOKEN_CACHE_KEY);
}
