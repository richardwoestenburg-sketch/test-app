// Daglog backend — a small Cloudflare Worker that stores log entries in KV,
// so the phone app and a Wear OS watch can share one journal.
//
// Auth: every request must send the shared secret, either as an
// `X-Daglog-Key` header or a `?key=` query param, matching the DAGLOG_TOKEN
// secret. This keeps the endpoint private without a full login system.
//
// Data: a single KV key ("entries") holds a JSON array of entries with the
// same shape the web app uses: { id, date, timeLabel, timestamp, text, lat, lon }.

const KV_KEY = "entries";
const AGENDA_KEY = "agenda";
const MAX_ENTRIES = 5000;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

function authorized(request, url, env) {
  if (!env.DAGLOG_TOKEN) return false;
  const key = request.headers.get("X-Daglog-Key") || url.searchParams.get("key");
  return key === env.DAGLOG_TOKEN;
}

async function readEntries(env) {
  const raw = await env.DAGLOG_KV.get(KV_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortEntries(list) {
  return list.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

async function writeEntries(env, list) {
  const trimmed = sortEntries(list).slice(-MAX_ENTRIES);
  await env.DAGLOG_KV.put(KV_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function makeEntry(input) {
  const now = new Date();
  const timestamp = input.timestamp || now.toISOString();
  const d = new Date(timestamp);
  const date = input.date || (isNaN(d) ? now : d).toISOString().slice(0, 10);
  const timeLabel = input.timeLabel || (isNaN(d) ? now : d).toTimeString().slice(0, 5);
  return {
    id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    timeLabel,
    timestamp,
    text: String(input.text || "").slice(0, 500),
    lat: input.lat ?? null,
    lon: input.lon ?? null,
  };
}

// --- Agenda (planner) items -------------------------------------------------
// Stored under a separate KV key so they don't mix with the daglog entries.
// Shape mirrors the web app: { id, title, date, timeLabel, timestamp,
// remindOffset, remindAt, done, notified }.

async function readAgenda(env) {
  const raw = await env.DAGLOG_KV.get(AGENDA_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAgenda(env, list) {
  const trimmed = sortEntries(list).slice(-MAX_ENTRIES);
  await env.DAGLOG_KV.put(AGENDA_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function makeAgendaItem(input) {
  const now = new Date();
  const timestamp = input.timestamp || now.toISOString();
  const d = new Date(timestamp);
  const date = input.date || (isNaN(d) ? now : d).toISOString().slice(0, 10);
  const timeLabel = input.timeLabel || (isNaN(d) ? now : d).toTimeString().slice(0, 5);
  const offset =
    input.remindOffset === null || input.remindOffset === undefined
      ? null
      : Number(input.remindOffset);
  const repeatValues = ["none", "daily", "weekdays", "weekly", "monthly"];
  return {
    id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(input.title || "").slice(0, 300),
    date,
    timeLabel,
    timestamp,
    remindOffset: Number.isFinite(offset) ? offset : null,
    remindAt: input.remindAt || null,
    repeat: repeatValues.includes(input.repeat) ? input.repeat : "none",
    done: !!input.done,
    notified: !!input.notified,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (!authorized(request, url, env)) {
      return json({ error: "unauthorized" }, 401, origin);
    }

    // GET /entries -> all entries
    if (path === "/entries" && request.method === "GET") {
      const entries = await readEntries(env);
      return json({ entries: sortEntries(entries) }, 200, origin);
    }

    // POST /entries -> add one entry (from the web app)
    if (path === "/entries" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400, origin);
      }
      if (!String(body.text || "").trim()) {
        return json({ error: "text required" }, 400, origin);
      }
      const entries = await readEntries(env);
      const entry = makeEntry(body);
      const saved = await writeEntries(env, [...entries, entry]);
      return json({ entry, entries: saved }, 201, origin);
    }

    // DELETE /entries?id=... -> remove one; DELETE /entries?all=1 -> clear
    if (path === "/entries" && request.method === "DELETE") {
      if (url.searchParams.get("all") === "1") {
        await writeEntries(env, []);
        return json({ entries: [] }, 200, origin);
      }
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400, origin);
      const entries = await readEntries(env);
      const saved = await writeEntries(env, entries.filter((e) => e.id !== id));
      return json({ entries: saved }, 200, origin);
    }

    // GET /agenda -> all agenda items
    if (path === "/agenda" && request.method === "GET") {
      const items = await readAgenda(env);
      return json({ items: sortEntries(items) }, 200, origin);
    }

    // POST /agenda -> upsert one item (add new, or replace by id on edit/done)
    if (path === "/agenda" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400, origin);
      }
      if (!String(body.title || "").trim()) {
        return json({ error: "title required" }, 400, origin);
      }
      const items = await readAgenda(env);
      const item = makeAgendaItem(body);
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items[idx] = item;
      else items.push(item);
      const saved = await writeAgenda(env, items);
      return json({ item, items: saved }, idx >= 0 ? 200 : 201, origin);
    }

    // DELETE /agenda?id=... -> remove one; DELETE /agenda?all=1 -> clear
    if (path === "/agenda" && request.method === "DELETE") {
      if (url.searchParams.get("all") === "1") {
        await writeAgenda(env, []);
        return json({ items: [] }, 200, origin);
      }
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400, origin);
      const items = await readAgenda(env);
      const saved = await writeAgenda(env, items.filter((x) => x.id !== id));
      return json({ items: saved }, 200, origin);
    }

    // POST/GET /log -> ultra-simple endpoint for the watch: just text.
    // GET so it works from a plain "open URL" Shortcut/HTTP action too.
    if (path === "/log" && (request.method === "POST" || request.method === "GET")) {
      let text = url.searchParams.get("text") || "";
      if (!text && request.method === "POST") {
        const ctype = request.headers.get("Content-Type") || "";
        if (ctype.includes("application/json")) {
          try {
            text = (await request.json()).text || "";
          } catch {
            text = "";
          }
        } else {
          text = await request.text();
        }
      }
      text = String(text).trim();
      if (!text) return json({ error: "text required" }, 400, origin);
      const entries = await readEntries(env);
      const entry = makeEntry({ text });
      await writeEntries(env, [...entries, entry]);
      return json({ ok: true, entry }, 201, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
};
