// Local-first storage + helpers for the Agenda (planner).
// Kept fully local (localStorage) like the rest of the app — no account needed.
//
// An item shape:
// { id, title, date: "YYYY-MM-DD", timeLabel: "HH:MM", timestamp: ISO (event),
//   remindOffset: minutes-before (number), remindAt: ISO|null,
//   repeat: "none"|"daily"|"weekdays"|"weekly"|"monthly",
//   repeatUntil: "YYYY-MM-DD"|null (inclusive end date; null = no end),
//   done: bool, notified: bool }
//
// Recurring items are a single record that rolls forward: once an occurrence
// has passed (or is ticked off) it advances to the next occurrence in place,
// so the list stays small and one reminder is scheduled at a time. When the
// next occurrence would fall after repeatUntil, the series has ended.

const STORE_KEY = "daglog-agenda";

export function loadItems() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveItems(items) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Local-time date key (YYYY-MM-DD) for a Date.
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build an event timestamp from a date (YYYY-MM-DD) + time (HH:MM) in local time.
export function eventTimestamp(date, timeLabel) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (timeLabel || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).toISOString();
}

// Reminder moment = event time minus offset (minutes). offset 0 => at the time.
export function reminderAt(timestamp, offsetMinutes) {
  if (offsetMinutes == null) return null;
  return new Date(new Date(timestamp).getTime() - offsetMinutes * 60000).toISOString();
}

export const REMIND_OPTIONS = [
  { value: 0, label: "Op tijd" },
  { value: 5, label: "5 min ervoor" },
  { value: 15, label: "15 min ervoor" },
  { value: 30, label: "30 min ervoor" },
  { value: 60, label: "1 uur ervoor" },
  { value: 1440, label: "1 dag ervoor" },
  { value: null, label: "Geen melding" },
];

export const REPEAT_OPTIONS = [
  { value: "none", label: "Herhaalt niet" },
  { value: "daily", label: "Elke dag" },
  { value: "weekdays", label: "Elke werkdag" },
  { value: "weekly", label: "Elke week" },
  { value: "monthly", label: "Elke maand" },
];

const REPEAT_VALUES = REPEAT_OPTIONS.map((o) => o.value);

export function normalizeRepeat(v) {
  return REPEAT_VALUES.includes(v) ? v : "none";
}

export function isRecurring(item) {
  return item && item.repeat && item.repeat !== "none";
}

export function repeatLabel(v) {
  const o = REPEAT_OPTIONS.find((r) => r.value === v);
  return o && o.value !== "none" ? o.label : null;
}

// Advance a local timestamp (ms) by one step of the given cadence, keeping the
// wall-clock time of day (so DST shifts don't drift the reminder).
function addRepeat(ms, repeat) {
  const d = new Date(ms);
  switch (repeat) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekdays":
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly": {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, daysInMonth));
      break;
    }
    default:
      d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

// Roll a recurring item forward to its next occurrence strictly after `now`.
// Always advances at least one step (so ticking off a not-yet-due occurrence
// moves to the following one). Resets the per-occurrence notified/done flags.
// Returns null when the next occurrence falls after repeatUntil — i.e. the
// series has ended and the item should be removed.
export function rollForward(item, now = Date.now()) {
  let ms = new Date(item.timestamp).getTime();
  let guard = 0;
  do {
    ms = addRepeat(ms, item.repeat);
    guard += 1;
  } while (ms <= now && guard < 2000);
  const ts = new Date(ms);
  const date = localDateKey(ts);
  if (item.repeatUntil && date > item.repeatUntil) {
    return null; // past the end date — no further occurrences
  }
  const timestamp = ts.toISOString();
  return {
    ...item,
    date,
    timestamp,
    remindAt: reminderAt(timestamp, item.remindOffset),
    done: false,
    notified: false,
  };
}

// Sanitize an optional end date to a "YYYY-MM-DD" string (or null).
function normalizeUntil(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function makeItem({ title, date, timeLabel, remindOffset, repeat, repeatUntil }) {
  const rep = normalizeRepeat(repeat);
  const timestamp = eventTimestamp(date, timeLabel);
  return {
    id: newId(),
    title: String(title).trim().slice(0, 300),
    date,
    timeLabel,
    timestamp,
    remindOffset: remindOffset ?? null,
    remindAt: reminderAt(timestamp, remindOffset),
    repeat: rep,
    repeatUntil: rep !== "none" ? normalizeUntil(repeatUntil) : null,
    done: false,
    notified: false,
  };
}

export function sortItems(list) {
  return [...list].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}
