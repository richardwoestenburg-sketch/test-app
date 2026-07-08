// Local-first time tracking for the "Tijd" tab.
// Fast activity logging: one tap starts an activity and stops the previous one,
// so switching tasks is a single tap and each activity's duration is recorded.
//
// Session shape: { id, label, start: ISO, end: ISO|null }
// The active session is the one with end === null (at most one at a time).
// Presets are the quick-tap activity labels the user configures.

import { localDateKey } from "./agenda.js";

const SESSIONS_KEY = "daglog-timelog";
const PRESETS_KEY = "daglog-presets";

// Sensible starting buttons; the user can edit these.
const DEFAULT_PRESETS = ["E-mail", "Bellen", "Overleg", "Administratie", "Pauze"];

// Sessions shorter than this are treated as mis-taps and dropped on switch/stop.
export const MIN_SESSION_MS = 2000;

export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(list) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw == null) return [...DEFAULT_PRESETS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [...DEFAULT_PRESETS];
  } catch {
    return [...DEFAULT_PRESETS];
  }
}

export function savePresets(list) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function activeSession(sessions) {
  return sessions.find((s) => !s.end) || null;
}

export function sessionMs(session, now = Date.now()) {
  const start = new Date(session.start).getTime();
  const end = session.end ? new Date(session.end).getTime() : now;
  return Math.max(0, end - start);
}

// Stop the running activity (if any) and — unless it's the same label already
// running — start a new one. Returns a new sessions array.
export function switchActivity(sessions, label, now = new Date()) {
  const nowMs = now.getTime();
  const clean = String(label || "").trim().slice(0, 120);
  if (!clean) return sessions;
  let next = sessions.slice();
  const active = activeSession(next);
  let sameRunning = false;
  if (active) {
    sameRunning = active.label === clean;
    if (nowMs - new Date(active.start).getTime() < MIN_SESSION_MS) {
      next = next.filter((s) => s.id !== active.id); // drop a mis-tap
    } else {
      next = next.map((s) => (s.id === active.id ? { ...s, end: now.toISOString() } : s));
    }
  }
  // Tapping the activity that's already running just stops it (toggle off).
  if (!sameRunning) {
    next.push({ id: newId(), label: clean, start: now.toISOString(), end: null });
  }
  return next;
}

// Stop the running activity without starting a new one.
export function stopActivity(sessions, now = new Date()) {
  const nowMs = now.getTime();
  const active = activeSession(sessions);
  if (!active) return sessions;
  if (nowMs - new Date(active.start).getTime() < MIN_SESSION_MS) {
    return sessions.filter((s) => s.id !== active.id);
  }
  return sessions.map((s) => (s.id === active.id ? { ...s, end: now.toISOString() } : s));
}

// Aggregate one day's sessions: total time, time per label (sorted), and the
// raw sessions for that day (sorted by start).
export function dayStats(sessions, dateKey, now = Date.now()) {
  const day = sessions.filter((s) => localDateKey(new Date(s.start)) === dateKey);
  const byLabel = new Map();
  let total = 0;
  for (const s of day) {
    const ms = sessionMs(s, now);
    total += ms;
    byLabel.set(s.label, (byLabel.get(s.label) || 0) + ms);
  }
  const perLabel = [...byLabel.entries()]
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => b.ms - a.ms);
  const ordered = day.slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { total, perLabel, sessions: ordered };
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}u ${rm}m` : `${h}u`;
}

export function formatClock(iso) {
  return new Date(iso).toTimeString().slice(0, 5);
}

// Compare two session lists to find what to upsert/remove on the server.
export function diffSessions(prev, next) {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextIds = new Set(next.map((s) => s.id));
  const upserts = next.filter((s) => {
    const before = prevById.get(s.id);
    return !before || before.label !== s.label || before.start !== s.start || before.end !== s.end;
  });
  const removedIds = prev.filter((s) => !nextIds.has(s.id)).map((s) => s.id);
  return { upserts, removedIds };
}
