import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarDays, Plus, Trash2, Check, Clock, Bell, BellOff, BellRing,
} from "lucide-react";
import {
  loadItems, saveItems, makeItem, sortItems, reminderAt,
  REMIND_OPTIONS,
} from "./agenda.js";
import * as notify from "./notify.js";

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
  const [showDone, setShowDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [perm, setPerm] = useState(notify.notifySupported() ? notify.permission() : "unsupported");
  const [notifHint, setNotifHint] = useState("");
  const didSync = useRef(false);

  // Persist and keep reminders in sync with the current list.
  const commit = useCallback(async (next, { reschedule = true } = {}) => {
    const sorted = sortItems(next);
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
        }
      } catch {
        /* notifications are best-effort */
      }
    }
    return sorted;
  }, []);

  // Initial load + reconcile reminders once.
  useEffect(() => {
    const initial = sortItems(loadItems());
    setItems(initial);
    setLoaded(true);
    if (!didSync.current && notify.notifySupported()) {
      didSync.current = true;
      notify.syncReminders(initial).then((caughtUp) => {
        if (caughtUp && caughtUp.length) {
          const marked = initial.map((it) =>
            caughtUp.includes(it.id) ? { ...it, notified: true } : it
          );
          setItems(marked);
          saveItems(marked);
        }
      }).catch(() => {});
    }
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

  const addItem = async () => {
    if (!title.trim() || !date) return;
    const item = makeItem({ title, date, timeLabel: time, remindOffset });
    await commit([...items, item]);
    setTitle("");
    setTime(nowHHMM());
    if (notify.notifySupported() && notify.permission() === "default" && remindOffset != null) {
      // Nudge the user to enable notifications on their first reminder.
      setPerm("default");
    }
  };

  const toggleDone = async (id) => {
    const next = items.map((it) =>
      it.id === id ? { ...it, done: !it.done, notified: it.done ? it.notified : true } : it
    );
    await commit(next);
  };

  const deleteItem = async (id) => {
    if (notify.notifySupported()) {
      try { await notify.cancelReminder(id); } catch {}
    }
    await commit(items.filter((it) => it.id !== id), { reschedule: false });
  };

  const resetAll = async () => {
    if (notify.notifySupported()) {
      for (const it of items) {
        try { await notify.cancelReminder(it.id); } catch {}
      }
    }
    await commit([], { reschedule: false });
    setConfirmReset(false);
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
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
                      aria-label={it.done ? "Markeer als niet gedaan" : "Markeer als gedaan"}
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
