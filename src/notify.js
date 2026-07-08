// Notifications for the Agenda.
//
// Two delivery paths, best-effort and progressively enhanced:
//  1. Notification Triggers (TimestampTrigger) — the browser/OS fires the
//     reminder at the scheduled time even when the app is closed. Supported on
//     Chromium (Android especially). Used when available.
//  2. In-app timers (setTimeout) — a fallback that only fires while the app is
//     open, plus a "catch-up" on load for reminders whose time already passed
//     while the app was closed (for browsers without triggers, e.g. Safari).

const timers = new Map(); // id -> timeout handle

export function notifySupported() {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

export function permission() {
  return typeof Notification !== "undefined" ? Notification.permission : "denied";
}

export async function requestPermission() {
  if (typeof Notification === "undefined") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function triggersSupported() {
  return typeof window !== "undefined" && "TimestampTrigger" in window;
}

async function reg() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function abs(path) {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}

function options(item, extra = {}) {
  return {
    body: item.timeLabel ? `${item.timeLabel} — ${item.title}` : item.title,
    tag: `agenda-${item.id}`,
    icon: abs("icon-192.png"),
    badge: abs("favicon-32.png"),
    lang: "nl",
    renotify: true,
    data: { id: item.id, url: document.baseURI },
    ...extra,
  };
}

async function showNow(item) {
  if (permission() !== "granted") return;
  const r = await reg();
  if (r) {
    try {
      await r.showNotification("Agenda — herinnering", options(item));
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    new Notification("Agenda — herinnering", options(item));
  } catch {
    /* ignore */
  }
}

function clearTimer(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

// Cancel any pending reminder for an item (in-app timer + scheduled trigger).
export async function cancelReminder(id) {
  clearTimer(id);
  const r = await reg();
  if (r) {
    try {
      const list = await r.getNotifications({ tag: `agenda-${id}`, includeTriggered: true });
      list.forEach((n) => n.close());
    } catch {
      /* getNotifications options unsupported — ignore */
    }
  }
}

// Schedule (or reschedule) the reminder for a single item.
export async function scheduleReminder(item) {
  await cancelReminder(item.id);
  if (item.done || !item.remindAt || permission() !== "granted") return;
  const when = new Date(item.remindAt).getTime();
  if (isNaN(when)) return;
  const delay = when - Date.now();

  // Path 1: OS-level scheduled notification (fires even when app is closed).
  if (triggersSupported() && when > Date.now()) {
    const r = await reg();
    if (r) {
      try {
        await r.showNotification("Agenda — herinnering", options(item, {
          showTrigger: new window.TimestampTrigger(when),
        }));
        return;
      } catch {
        /* fall through to timers */
      }
    }
  }

  // Path 2: in-app timer (only while the app stays open).
  if (delay <= 0) {
    showNow(item);
    return;
  }
  if (delay > 2 ** 31 - 1) return; // beyond setTimeout's range; handled on next load
  timers.set(
    item.id,
    setTimeout(() => {
      timers.delete(item.id);
      showNow(item);
    }, delay)
  );
}

// Reconcile all reminders against the current item list. Returns the ids of
// items that were fired as a "catch-up" (missed while the app was closed and
// triggers are unavailable) so the caller can persist their notified flag.
export async function syncReminders(items) {
  for (const id of [...timers.keys()]) clearTimer(id);

  const caughtUp = [];
  const now = Date.now();
  const canTrigger = triggersSupported();

  for (const it of items) {
    if (it.done || !it.remindAt) continue;
    const when = new Date(it.remindAt).getTime();
    if (isNaN(when)) continue;

    if (when > now) {
      await scheduleReminder(it);
    } else if (!it.notified && !canTrigger && when > now - 6 * 3600000) {
      // Missed within the last 6h and no OS trigger delivered it — show once.
      await showNow(it);
      caughtUp.push(it.id);
    }
  }
  return caughtUp;
}
