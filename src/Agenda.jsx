import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, Plus, Trash2, Check, Clock, Bell, BellOff, BellRing,
  Cloud, RefreshCw, Repeat,
} from "lucide-react";
import {
  loadItems, saveItems, makeItem, sortItems, rollForward, isRecurring,
  REMIND_OPTIONS, REPEAT_OPTIONS, repeatLabel,
} from "./agenda.js";
import * as notify from "./notify.js";
import * as sync from "./sync.js";

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysKey(base, n) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

function formatDayLabel(dateStr) {
  const today = todayKey();
  if (dateStr === today) return "Vandaag";
  if (dateStr === addDaysKey(today, 1)) return "Morgen";
  if (dateStr === addDaysKey(today, -1)) return "Gisteren";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

function remindLabel(offset) {
  const o = REMIND_OPTIONS.find((r) => r.value === offset);
  return o ? o.label : null;
}

export default function Agenda() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(nowHHMM());
  const [remindOffset, setRemindOffset] = useState(15);
  const [repeat, setRepeat] = useState("none");
  const [showDone, setShowDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [perm, setPerm] = useState(notify.notifySupported() ? notify.permission() : "unsupported");
  const [notifHint, setNotifHint] = useState("");
  const [synced, setSynced] = useState(sync.isSyncConfigured());
  const [syncStatus, setSyncStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Write the local cache and keep reminders reconciled with the list. When
  // sync is on, a "catch-up" that fires here is pushed back so other devices
  // (and re-pulls) don't re-notify for the same item. Recurring items whose
  // occurrence has passed are rolled forward to their next occurrence.
  const applyLocal = useCallback(async (next, { reschedule = true } = {}) => {
    const cfg = sync.getSyncConfig();
    let list = next;
    if (reschedule) {
      const now = Date.now();
      const advancedIds = [];
      list = next.map((it) => {
        if (isRecurring(it) && !it.done) {
          const ts = new Date(it.timestamp).getTime();
          if (Number.isFinite(ts) && ts <= now) {
            advancedIds.push(it.id);
            return rollForward(it, now);
          }
        }
        return it;
      });
      // Sync the rolled-forward dates so other devices see the same next occurrence.
      if (advancedIds.length && cfg) {
        list
          .filter((it) => advancedIds.includes(it.id))
          .forEach((it) => sync.putAgendaItem(cfg, it).catch(() => {}));
      }
    }
    const sorted = sortItems(list);
    setItems(sorted);
    saveItems(sorted);
    if (reschedule && notify.notifySupported()) {
      try {
        const caughtUp = await notify.syncReminders(sorted);
        if (caughtUp.length) {
          const marked = sorted.map((it) =>
            caughtUp.includes(it.id) ? { ...it, notified: true } : it
          );
          setItems(marked);
          saveItems(marked);
          if (cfg) {
            marked
              .filter((it) => caughtUp.includes(it.id))
              .forEach((it) => sync.putAgendaItem(cfg, it).catch(() => {}));
          }
          return marked;
        }
      } catch {
        /* notifications are best-effort */
      }
    }
    return sorted;
  }, []);

  // Pull the shared agenda from the Worker (on load, refresh and regained focus).
  const pullFromServer = useCallback(async () => {
    const cfg = sync.getSyncConfig();
    if (!cfg) return false;
    const remote = await sync.fetchAgenda(cfg);
    await applyLocal(remote);
    return true;
  }, [applyLocal]);

  // Initial load: from server when synced, otherwise the local cache.
  useEffect(() => {
    (async () => {
      const cfg = sync.getSyncConfig();
      if (cfg) {
        try {
          await pullFromServer();
        } catch {
          await applyLocal(loadItems());
          setSyncStatus("Offline — lokale kopie getoond.");
        }
      } else {
        await applyLocal(loadItems());
      }
      setLoaded(true);
    })();
  }, [pullFromServer, applyLocal]);

  // Refresh from the server when the app regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (sync.isSyncConfigured()) pullFromServer().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pullFromServer]);

  // Keep the cloud indicator in step if sync gets (un)configured on the other tab.
  useEffect(() => {
    const onVisible = () => setSynced(sync.isSyncConfigured());
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const enableNotifications = async () => {
    setNotifHint("");
    const result = await notify.requestPermission();
    setPerm(result);
    if (result === "granted") {
      await notify.syncReminders(items);
      if (!notify.triggersSupported()) {
        setNotifHint(
          "Meldingen aan. Let op: op dit toestel komen ze alleen binnen terwijl de app open is (of als inhaalmelding bij het openen)."
        );
      }
    } else if (result === "denied") {
      setNotifHint("Meldingen zijn geblokkeerd. Zet ze aan in je browser-/systeeminstellingen voor deze app.");
    }
  };

  // Push a single item to the server (upsert) and adopt the returned list.
  const pushItem = async (item) => {
    const cfg = sync.getSyncConfig();
    if (!cfg) return;
    try {
      const remote = await sync.putAgendaItem(cfg, item);
      await applyLocal(remote);
      setSyncStatus("");
    } catch {
      setSyncStatus("Offline — lokaal opgeslagen, nog niet gesynct.");
    }
  };

  const addItem = async () => {
    if (!title.trim() || !date) return;
    const item = makeItem({ title, date, timeLabel: time, remindOffset, repeat });
    // applyLocal may roll a recurring item forward if its first occurrence is
    // already past; adopt whichever version ends up in the list for the server.
    const result = await applyLocal([...items, item]);
    const saved = result.find((it) => it.id === item.id) || item;
    setTitle("");
    setTime(nowHHMM());
    if (notify.notifySupported() && notify.permission() === "default" && remindOffset != null) {
      // Nudge the user to enable notifications on their first reminder.
      setPerm("default");
    }
    await pushItem(saved);
  };

  const toggleDone = async (id) => {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    // Ticking off a recurring item completes this occurrence and advances it to
    // the next one, so the series keeps going.
    const updated = isRecurring(target) && !target.done
      ? rollForward(target, Date.now())
      : { ...target, done: !target.done, notified: target.done ? target.notified : true };
    await applyLocal(items.map((it) => (it.id === id ? updated : it)));
    await pushItem(updated);
  };

  const deleteItem = async (id) => {
    if (notify.notifySupported()) {
      try { await notify.cancelReminder(id); } catch {}
    }
    await applyLocal(items.filter((it) => it.id !== id), { reschedule: false });
    const cfg = sync.getSyncConfig();
    if (cfg) {
      try {
        const remote = await sync.deleteAgendaItem(cfg, id);
        await applyLocal(remote, { reschedule: false });
      } catch {
        setSyncStatus("Offline — verwijderen nog niet gesynct.");
      }
    }
  };

  const resetAll = async () => {
    if (notify.notifySupported()) {
      for (const it of items) {
        try { await notify.cancelReminder(it.id); } catch {}
      }
    }
    await applyLocal([], { reschedule: false });
    setConfirmReset(false);
    const cfg = sync.getSyncConfig();
    if (cfg) {
      try {
        await sync.clearAgenda(cfg);
        setSyncStatus("");
      } catch {
        setSyncStatus("Offline — wissen nog niet gesynct.");
      }
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setSyncStatus("");
    try {
      await pullFromServer();
    } catch {
      setSyncStatus("Verversen lukte niet. Ben je online?");
    }
    setRefreshing(false);
  };

  const visible = items.filter((it) => showDone || !it.done);
  const openCount = items.filter((it) => !it.done).length;
  const groups = visible.reduce((acc, it) => {
    (acc[it.date] = acc[it.date] || []).push(it);
    return acc;
  }, {});
  const orderedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const nowMs = Date.now();

  const notifBtn = () => {
    if (perm === "unsupported") return null;
    if (perm === "granted") {
      return (
        <span className="dl-btn-ghost p-2 inline-flex" title="Meldingen staan aan">
          <BellRing size={15} color="#b8892b" />
        </span>
      );
    }
    return (
      <button
        onClick={enableNotifications}
        className="dl-btn-ghost p-2"
        aria-label="Meldingen inschakelen"
        title="Meldingen inschakelen"
      >
        {perm === "denied" ? <BellOff size={15} /> : <Bell size={15} />}
      </button>
    );
  };

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-6">
        <CalendarDays size={26} strokeWidth={1.6} color="#b8892b" />
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Agenda</h1>
          <p className="text-xs opacity-60 dl-mono">plan vooruit — met een seintje op tijd</p>
        </div>
        {synced && (
          <>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="dl-btn-ghost p-2"
              aria-label="Ververs vanaf server"
              title="Ververs vanaf server"
            >
              <RefreshCw size={15} className={refreshing ? "dl-spin" : ""} />
            </button>
            <span className="dl-btn-ghost p-2 inline-flex" title="Agenda wordt gesynchroniseerd">
              <Cloud size={15} color="#b8892b" />
            </span>
          </>
        )}
        {notifBtn()}
      </header>

      {/* Notification banner */}
      {perm === "default" && (
        <div className="dl-card p-3 mb-6 flex items-center gap-3">
          <Bell size={16} color="#b8892b" className="shrink-0" />
          <p className="text-xs flex-1 opacity-80">
            Zet meldingen aan om een seintje te krijgen wanneer een afspraak eraan komt.
          </p>
          <button onClick={enableNotifications} className="dl-btn-primary text-xs px-3 py-1.5 shrink-0">
            Aanzetten
          </button>
        </div>
      )}
      {notifHint && <p className="text-xs mb-6 -mt-2 opacity-70">{notifHint}</p>}
      {syncStatus && <p className="text-xs mb-6 -mt-2 opacity-70">{syncStatus}</p>}
      {!synced && (
        <p className="text-xs mb-6 -mt-2 opacity-55">
          Tip: koppel de sync via het tandwiel ⚙️ op het Daglog-tabblad om je agenda
          tussen telefoon, horloge en browser te delen.
        </p>
      )}

      {/* New item card */}
      <div className="dl-card p-4 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Plus size={16} color="#b8892b" />
          <span className="text-xs uppercase dl-day-label opacity-70">Nieuwe afspraak</span>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Wat staat er op de planning?"
          className="dl-input px-3 py-2 text-sm w-full mb-3"
          aria-label="Titel"
        />
        <div className="flex gap-2 mb-3 flex-wrap">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="dl-input dl-mono px-3 py-2 text-sm flex-1 min-w-[9rem]"
            aria-label="Datum"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="dl-input dl-mono px-3 py-2 text-sm w-28"
            aria-label="Tijdstip"
          />
        </div>
        <div className="flex items-center gap-3 gap-y-2 mb-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "#241d10" }}>
            <Bell size={13} className="opacity-60" />
            <select
              value={String(remindOffset)}
              onChange={(e) => {
                const v = e.target.value;
                setRemindOffset(v === "null" ? null : Number(v));
              }}
              className="dl-input px-2 py-1.5 text-xs"
              aria-label="Herinnering"
            >
              {REMIND_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "#241d10" }}>
            <Repeat size={13} className="opacity-60" />
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="dl-input px-2 py-1.5 text-xs"
              aria-label="Herhaling"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            onClick={addItem}
            disabled={!title.trim() || !date}
            className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
          >
            <Plus size={15} /> Inplannen
          </button>
        </div>
      </div>

      {/* List */}
      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : items.length === 0 ? (
        <p className="text-sm opacity-50">Nog niets gepland. Voeg hierboven je eerste afspraak toe.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm opacity-50">Alles afgerond 🎉</p>
      ) : (
        orderedDates.map((d) => (
          <div key={d} className="mb-6">
            <div className="dl-mono text-xs uppercase dl-day-label opacity-50 mb-3">
              {formatDayLabel(d)}
            </div>
            <div className="flex flex-col gap-2">
              {groups[d].map((it) => {
                const overdue = !it.done && new Date(it.timestamp).getTime() < nowMs;
                return (
                  <div
                    key={it.id}
                    className={`dl-ag-item p-3 flex items-start gap-3 ${overdue ? "dl-ag-over" : ""} ${it.done ? "dl-ag-done" : ""}`}
                  >
                    <button
                      onClick={() => toggleDone(it.id)}
                      className={`dl-check ${it.done ? "dl-check-on" : ""}`}
                      aria-label={
                        isRecurring(it)
                          ? "Deze keer afvinken — schuift door naar de volgende"
                          : it.done ? "Markeer als niet gedaan" : "Markeer als gedaan"
                      }
                      title={isRecurring(it) ? "Deze keer afvinken — gaat door naar de volgende keer" : undefined}
                      aria-pressed={it.done}
                    >
                      {it.done && <Check size={14} strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0" style={{ color: "#241d10" }}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="dl-mono text-xs opacity-60 inline-flex items-center gap-1">
                          <Clock size={11} /> {it.timeLabel}
                        </span>
                        <span className="dl-ag-title text-sm">{it.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {overdue && <span className="dl-badge dl-badge-over">Verlopen</span>}
                        {isRecurring(it) && repeatLabel(it.repeat) && (
                          <span className="dl-badge">
                            <Repeat size={9} /> {repeatLabel(it.repeat)}
                          </span>
                        )}
                        {!it.done && it.remindOffset != null && remindLabel(it.remindOffset) && (
                          <span className="dl-badge">
                            <Bell size={9} /> {remindLabel(it.remindOffset)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteItem(it.id)}
                      className="opacity-30 hover:opacity-80 transition-opacity shrink-0 mt-0.5"
                      style={{ color: "#241d10" }}
                      aria-label="Verwijder afspraak"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Footer controls */}
      {items.length > 0 && (
        <div className="mt-8 flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="dl-btn-ghost text-xs px-3 py-1.5 opacity-70 hover:opacity-100"
          >
            {showDone ? "Verberg afgerond" : `Toon afgerond (${items.length - openCount})`}
          </button>
          {confirmReset ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="opacity-60">Alles wissen?</span>
              <button onClick={resetAll} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
              <button onClick={() => setConfirmReset(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="dl-btn-ghost text-xs px-3 py-1.5 opacity-50 hover:opacity-90"
            >
              Alles wissen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
