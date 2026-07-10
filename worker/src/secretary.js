// Backend voor de "Secretaresse"-tab: bewaart de Microsoft-koppeling,
// verlengt Graph-abonnementen (webhooks) op tijd, en stuurt Web Push-
// meldingen naar de telefoon — ook als de app niet open staat.
import webpush from "web-push";
import { getJSON, putJSON } from "./kv.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { refreshAccessToken, graphFetch, createSubscription, renewSubscription, deleteSubscription } from "./msGraph.js";

const ACCOUNT_KEY = "secretary-account";
const ACCESS_KEY = "secretary-access"; // kortlevend access-token, los van het account
const PUSH_KEY = "secretary-push-subs";
const SETTINGS_KEY = "secretary-settings";
const NOTIFIED_KEY = "secretary-notified";

const DEFAULT_SETTINGS = { notifyAllMail: true, eventReminderMinutes: 10, muted: false };
const SUB_LIFETIME_MS = 4200 * 60 * 1000; // ruim onder Graph's max (~4230 min)
const RENEW_MARGIN_MS = 6 * 60 * 60 * 1000; // 6 uur van tevoren verlengen
const NOTIFIED_TTL_MS = 3 * 24 * 3600 * 1000;

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Daglog-Key",
    "Access-Control-Max-Age": "86400",
  };
}

async function getAccount(env) {
  return getJSON(env, ACCOUNT_KEY, null);
}
async function getSettings(env) {
  return { ...DEFAULT_SETTINGS, ...(await getJSON(env, SETTINGS_KEY, {})) };
}

// Zorgt dat we een geldig (niet-verlopen) access-token hebben. Het access-token
// wordt in een eigen KV-sleutel gecachet, los van het account. Zo hoeft een
// routinematige tokenophaling (webhook, cron, /token) het account — met het
// roterende ververstoken — niet te herschrijven; dat gebeurt alleen wanneer het
// ververstoken daadwerkelijk roteert. Dat verkleint het risico dat twee
// gelijktijdige verversingen elkaars nieuwste ververstoken overschrijven.
async function ensureAccessToken(env, account) {
  const cached = await getJSON(env, ACCESS_KEY, null);
  if (cached && cached.accessToken && cached.expiry > Date.now() + 60000) {
    return { accessToken: cached.accessToken, expiry: cached.expiry, account };
  }
  const refreshToken = await decryptSecret(env, account.refreshTokenEnc);
  const tokens = await refreshAccessToken(account.clientId, refreshToken);
  const expiry = Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000;
  await putJSON(env, ACCESS_KEY, { accessToken: tokens.access_token, expiry });

  // Alleen het account herschrijven als het ververstoken écht is geroteerd.
  let nextAccount = account;
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    nextAccount = { ...account, refreshTokenEnc: await encryptSecret(env, tokens.refresh_token) };
    await putJSON(env, ACCOUNT_KEY, nextAccount);
  }
  return { accessToken: tokens.access_token, expiry, account: nextAccount };
}

async function loadNotified(env) {
  const list = await getJSON(env, NOTIFIED_KEY, []);
  const cutoff = Date.now() - NOTIFIED_TTL_MS;
  return list.filter((e) => e.ts > cutoff);
}
function hasNotified(list, id) {
  return list.some((e) => e.id === id);
}
async function saveNotified(env, list) {
  await putJSON(env, NOTIFIED_KEY, list.slice(-500));
}

async function pushToAllDevices(env, messages) {
  if (!messages.length) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return; // push niet ingesteld
  const subs = await getJSON(env, PUSH_KEY, []);
  if (!subs.length) return;
  const vapidDetails = {
    subject: env.VAPID_SUBJECT || "mailto:secretary@example.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const survivors = [];
  for (const sub of subs) {
    let alive = true;
    for (const msg of messages) {
      try {
        await sendWebPush(sub, JSON.stringify(msg), vapidDetails);
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          alive = false;
          break;
        }
        // andere fouten (tijdelijk netwerkprobleem e.d.): device toch bewaren
      }
    }
    if (alive) survivors.push(sub);
  }
  if (survivors.length !== subs.length) await putJSON(env, PUSH_KEY, survivors);
}

// web-push's eigen sendNotification() gebruikt Node's https.request, dat in
// de Workers-runtime niet beschikbaar is. De versleuteling en VAPID-JWT
// (generateRequestDetails) werken wél via de nodejs_compat-shims, dus die
// hergebruiken we — alleen het versturen zelf doen we met de eigen fetch().
async function sendWebPush(subscription, payload, vapidDetails) {
  const requestDetails = webpush.generateRequestDetails(subscription, payload, { vapidDetails });
  const headers = { ...requestDetails.headers };
  delete headers["Content-Length"];
  const res = await fetch(requestDetails.endpoint, {
    method: requestDetails.method,
    headers,
    body: requestDetails.body ? new Uint8Array(requestDetails.body) : undefined,
  });
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`Web push mislukt (${res.status})`);
    err.statusCode = res.status;
    throw err;
  }
}

// -- Graph-abonnementen (webhooks) --------------------------------------

async function ensureSubscriptions(env, account) {
  const notificationUrl = `${account.workerUrl}/secretary/graph-webhook`;
  const clientState = env.DAGLOG_TOKEN;
  const now = Date.now();
  const needsMail = !account.mailSubId || account.mailSubExpiry - now < RENEW_MARGIN_MS;
  const needsCal = !account.calSubId || account.calSubExpiry - now < RENEW_MARGIN_MS;
  if (!needsMail && !needsCal) return account;

  const { accessToken, account: refreshed } = await ensureAccessToken(env, account);
  let next = refreshed;
  const newExp = new Date(Date.now() + SUB_LIFETIME_MS).toISOString();

  if (needsMail) {
    try {
      if (next.mailSubId) {
        const r = await renewSubscription(accessToken, next.mailSubId, newExp);
        next = { ...next, mailSubExpiry: new Date(r.expirationDateTime).getTime() };
      } else {
        throw new Error("geen bestaand abonnement");
      }
    } catch {
      try {
        const sub = await createSubscription(accessToken, "me/mailFolders('inbox')/messages", "created", notificationUrl, clientState, newExp);
        next = { ...next, mailSubId: sub.id, mailSubExpiry: new Date(sub.expirationDateTime).getTime() };
      } catch {
        next = { ...next, mailSubId: null, mailSubExpiry: 0 };
      }
    }
  }
  if (needsCal) {
    try {
      if (next.calSubId) {
        const r = await renewSubscription(accessToken, next.calSubId, newExp);
        next = { ...next, calSubExpiry: new Date(r.expirationDateTime).getTime() };
      } else {
        throw new Error("geen bestaand abonnement");
      }
    } catch {
      try {
        const sub = await createSubscription(accessToken, "me/events", "created,updated", notificationUrl, clientState, newExp);
        next = { ...next, calSubId: sub.id, calSubExpiry: new Date(sub.expirationDateTime).getTime() };
      } catch {
        next = { ...next, calSubId: null, calSubExpiry: 0 };
      }
    }
  }
  await putJSON(env, ACCOUNT_KEY, next);
  return next;
}

async function fetchMessagePreview(accessToken, id) {
  const res = await graphFetch(accessToken, `/me/messages/${id}?$select=subject,from`);
  if (!res.ok) return null;
  const m = await res.json();
  const from = m.from && m.from.emailAddress ? m.from.emailAddress.name || m.from.emailAddress.address : "onbekend";
  return { subject: m.subject || "(geen onderwerp)", from };
}

async function fetchEventPreview(accessToken, id) {
  const res = await graphFetch(accessToken, `/me/events/${id}?$select=subject,start`, {
    headers: { Prefer: 'outlook.timezone="W. Europe Standard Time"' },
  });
  if (!res.ok) return null;
  const e = await res.json();
  const when = e.start && e.start.dateTime ? new Date(e.start.dateTime) : null;
  const label = when
    ? when.toLocaleString("nl-NL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "";
  return { subject: e.subject || "(geen titel)", label };
}

// -- Achtergrondtaak: draait elke 10 minuten (Cron Trigger) --------------

export async function runScheduled(env) {
  const account = await getAccount(env);
  if (!account) return;
  let current = account;
  try {
    current = await ensureSubscriptions(env, current);
  } catch {
    /* volgende cron-tik probeert het opnieuw */
  }
  await checkUpcomingEventReminders(env, current);
}

async function checkUpcomingEventReminders(env, account) {
  const settings = await getSettings(env);
  if (settings.muted || !settings.eventReminderMinutes) return;
  let accessToken;
  try {
    ({ accessToken } = await ensureAccessToken(env, account));
  } catch {
    return;
  }
  const now = new Date();
  const windowEnd = new Date(now.getTime() + (settings.eventReminderMinutes + 10) * 60000);
  const res = await graphFetch(
    accessToken,
    `/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${windowEnd.toISOString()}&$select=id,subject,start,isAllDay&$orderby=start/dateTime`,
    { headers: { Prefer: 'outlook.timezone="UTC"' } }
  );
  if (!res.ok) return;
  const data = await res.json();
  const notified = await loadNotified(env);
  const toSend = [];
  for (const ev of data.value || []) {
    if (ev.isAllDay || !ev.start || !ev.start.dateTime) continue;
    const startMs = new Date(`${ev.start.dateTime}Z`).getTime();
    const minsUntil = (startMs - now.getTime()) / 60000;
    const key = `evt-${ev.id}`;
    if (minsUntil > 0 && minsUntil <= settings.eventReminderMinutes && !hasNotified(notified, key)) {
      toSend.push({ title: "Afspraak zo begint", body: `${ev.subject || "(geen titel)"} — over ${Math.round(minsUntil)} min`, url: "secretaresse", tag: `evt-rem-${ev.id}` });
      notified.push({ id: key, ts: Date.now() });
    }
  }
  if (toSend.length) {
    await pushToAllDevices(env, toSend);
    await saveNotified(env, notified);
  }
}

// -- HTTP-routes ----------------------------------------------------------

export async function handleSecretary(request, env, ctx, url, origin, path) {
  // Microsoft roept dit endpoint zelf aan (validatie + notificaties) — dat
  // kan geen X-Daglog-Key meesturen, dus deze route ligt buiten de auth-poort
  // (de aanroeper wordt geverifieerd via clientState, zie processNotifications).
  if (path === "/secretary/graph-webhook") {
    return handleGraphWebhook(request, env, ctx, url);
  }
  if (path === "/secretary/vapid-key" && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null }, 200, origin);
  }

  if (path === "/secretary/connect" && request.method === "POST") {
    return handleConnect(request, env, ctx, origin);
  }
  if (path === "/secretary/disconnect" && request.method === "POST") {
    return handleDisconnect(env, origin);
  }
  if (path === "/secretary/status" && request.method === "GET") {
    return handleStatus(env, origin);
  }
  if (path === "/secretary/token" && request.method === "GET") {
    return handleGetToken(env, origin);
  }
  if (path === "/secretary/settings" && request.method === "POST") {
    return handleSettings(request, env, origin);
  }
  if (path === "/secretary/push-subscribe" && request.method === "POST") {
    return handlePushSubscribe(request, env, origin);
  }
  if (path === "/secretary/push-unsubscribe" && request.method === "POST") {
    return handlePushUnsubscribe(request, env, origin);
  }
  return json({ error: "not found" }, 404, origin);
}

async function handleConnect(request, env, ctx, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400, origin);
  }
  const { clientId, workerUrl, refreshToken, accessToken, expiresIn, email, name } = body;
  if (!clientId || !workerUrl || !refreshToken) {
    return json({ error: "clientId, workerUrl en refreshToken zijn vereist" }, 400, origin);
  }
  const account = {
    clientId,
    workerUrl: String(workerUrl).replace(/\/+$/, ""),
    email: email || null,
    name: name || null,
    refreshTokenEnc: await encryptSecret(env, refreshToken),
    mailSubId: null,
    mailSubExpiry: 0,
    calSubId: null,
    calSubExpiry: 0,
  };
  await putJSON(env, ACCOUNT_KEY, account);
  // Het meegegeven access-token in de eigen (kortlevende) cache zetten.
  if (accessToken) {
    await putJSON(env, ACCESS_KEY, {
      accessToken,
      expiry: Date.now() + (Number(expiresIn || 3600) - 60) * 1000,
    });
  } else {
    await putJSON(env, ACCESS_KEY, null);
  }
  ctx.waitUntil(
    ensureSubscriptions(env, account).catch(() => {})
  );
  return json({ ok: true }, 200, origin);
}

async function handleDisconnect(env, origin) {
  const account = await getAccount(env);
  if (account) {
    try {
      const { accessToken } = await ensureAccessToken(env, account);
      if (account.mailSubId) await deleteSubscription(accessToken, account.mailSubId);
      if (account.calSubId) await deleteSubscription(accessToken, account.calSubId);
    } catch {
      /* best-effort — als het account al ongeldig is hoeven we niets op te ruimen bij Microsoft */
    }
  }
  await putJSON(env, ACCOUNT_KEY, null);
  await putJSON(env, ACCESS_KEY, null);
  await putJSON(env, NOTIFIED_KEY, []);
  return json({ ok: true }, 200, origin);
}

async function handleStatus(env, origin) {
  const account = await getAccount(env);
  const settings = await getSettings(env);
  const subs = await getJSON(env, PUSH_KEY, []);
  return json(
    {
      connected: !!account,
      email: account ? account.email : null,
      name: account ? account.name : null,
      mailSubExpiry: account ? account.mailSubExpiry : null,
      calSubExpiry: account ? account.calSubExpiry : null,
      pushDevices: subs.length,
      settings,
    },
    200,
    origin
  );
}

async function handleGetToken(env, origin) {
  const account = await getAccount(env);
  if (!account) return json({ error: "not connected" }, 400, origin);
  try {
    const { accessToken, expiry } = await ensureAccessToken(env, account);
    return json({ accessToken, expiresIn: Math.round((expiry - Date.now()) / 1000) }, 200, origin);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, origin);
  }
}

async function handleSettings(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400, origin);
  }
  const next = { ...(await getSettings(env)), ...body };
  await putJSON(env, SETTINGS_KEY, next);
  return json({ ok: true, settings: next }, 200, origin);
}

async function handlePushSubscribe(request, env, origin) {
  let sub;
  try {
    sub = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400, origin);
  }
  if (!sub || !sub.endpoint || !sub.keys) return json({ error: "invalid subscription" }, 400, origin);
  const subs = await getJSON(env, PUSH_KEY, []);
  const next = subs.filter((s) => s.endpoint !== sub.endpoint);
  next.push({ endpoint: sub.endpoint, keys: sub.keys });
  await putJSON(env, PUSH_KEY, next);
  return json({ ok: true }, 200, origin);
}

async function handlePushUnsubscribe(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400, origin);
  }
  const subs = await getJSON(env, PUSH_KEY, []);
  await putJSON(env, PUSH_KEY, subs.filter((s) => s.endpoint !== body.endpoint));
  return json({ ok: true }, 200, origin);
}

// -- Graph-webhook: validatie + binnenkomende meldingen -------------------

async function handleGraphWebhook(request, env, ctx, url) {
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken != null) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  let body = null;
  try {
    body = await request.json();
  } catch {
    /* leeg of ongeldig — niets te doen */
  }
  if (body) ctx.waitUntil(processGraphNotifications(env, body));
  // Snel antwoorden: Microsoft verwacht een vlotte 202, de verwerking loopt door op de achtergrond.
  return new Response(null, { status: 202 });
}

async function processGraphNotifications(env, body) {
  const account = await getAccount(env);
  if (!account) return;
  const items = Array.isArray(body.value) ? body.value : [];
  const valid = items.filter((n) => n.clientState === env.DAGLOG_TOKEN);
  if (!valid.length) return;

  const settings = await getSettings(env);
  if (settings.muted) return;

  let accessToken;
  try {
    ({ accessToken } = await ensureAccessToken(env, account));
  } catch {
    return;
  }

  const notified = await loadNotified(env);
  const toSend = [];
  for (const n of valid) {
    const resourceId = n.resourceData && n.resourceData.id;
    if (!resourceId || hasNotified(notified, resourceId)) continue;

    if (typeof n.resource === "string" && n.resource.toLowerCase().includes("messages")) {
      if (!settings.notifyAllMail) continue;
      const msg = await fetchMessagePreview(accessToken, resourceId);
      if (msg) toSend.push({ title: `Nieuwe mail van ${msg.from}`, body: msg.subject, url: "secretaresse", tag: `mail-${resourceId}` });
    } else if (typeof n.resource === "string" && n.resource.toLowerCase().includes("events")) {
      if (n.changeType !== "created") continue;
      const ev = await fetchEventPreview(accessToken, resourceId);
      if (ev) toSend.push({ title: "Nieuwe afspraak", body: `${ev.subject}${ev.label ? " — " + ev.label : ""}`, url: "secretaresse", tag: `evt-new-${resourceId}` });
    }
    notified.push({ id: resourceId, ts: Date.now() });
  }

  if (toSend.length) await pushToAllDevices(env, toSend);
  await saveNotified(env, notified);
}
