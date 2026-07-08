// Local-first storage + helpers for the Agenda (planner).
// Kept fully local (localStorage) like the rest of the app — no account needed.
//
// An item shape:
// { id, title, date: "YYYY-MM-DD", timeLabel: "HH:MM", timestamp: ISO (event),
//   remindOffset: minutes-before (number), remindAt: ISO|null, done: bool,
//   notified: bool }

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

export function makeItem({ title, date, timeLabel, remindOffset }) {
  const timestamp = eventTimestamp(date, timeLabel);
  return {
    id: newId(),
    title: String(title).trim().slice(0, 300),
    date,
    timeLabel,
    timestamp,
    remindOffset: remindOffset ?? null,
    remindAt: reminderAt(timestamp, remindOffset),
    done: false,
    notified: false,
  };
}

export function sortItems(list) {
  return [...list].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}
