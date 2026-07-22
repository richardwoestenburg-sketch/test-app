import React, { useState, useEffect, useCallback } from "react";
import {
  Timer, Square, Plus, Trash2, ChevronLeft, ChevronRight, Pencil, X, Check,
  Cloud, RefreshCw,
} from "lucide-react";
import { localDateKey } from "./agenda.js";
import {
  loadSessions, saveSessions, loadPresets, savePresets,
  switchActivity, stopActivity, activeSession, sessionMs,
  dayStats, formatDuration, formatClock, diffSessions,
} from "./timelog.js";
import * as sync from "./sync.js";

function addDaysKey(base, n) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

function formatDayLabel(dateStr) {
  const today = localDateKey();
  if (dateStr === today) return "Vandaag";
  if (dateStr === addDaysKey(today, 1)) return "Morgen";
  if (dateStr === addDaysKey(today, -1)) return "Gisteren";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

export default function TimeLog() {
  const [sessions, setSessions] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [adhoc, setAdhoc] = useState("");
  const [editing, setEditing] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [, setTick] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [synced, setSynced] = useState(sync.isSyncConfigured());
  const [syncStatus, setSyncStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Adopt a server list into local state + cache.
  const adopt = useCallback((list) => {
    setSessions(list);
    saveSessions(list);
  }, []);

  useEffect(() => {
    setPresets(loadPresets());
    (async () => {
      const cfg = sync.getSyncConfig();
      if (cfg) {
        try {
          adopt(await sync.fetchSessions(cfg));
        } catch {
          setSessions(loadSessions());
          setSyncStatus("Offline — lokale kopie getoond.");
        }
      } else {
        setSessions(loadSessions());
      }
      setLoaded(true);
    })();
  }, [adopt]);

  // Refresh from the server when the app regains focus (picks up watch logs).
  useEffect(() => {
    const onFocus = () => {
      setSynced(sync.isSyncConfigured());
      const cfg = sync.getSyncConfig();
      if (cfg) sync.fetchSessions(cfg).then(adopt).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [adopt]);

  // Live-update the running timer once a second (only while something runs).
  const hasActive = sessions.some((s) => !s.end);
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [hasActive]);

  // Persist locally and push the delta to the server (upserts + deletes).
  const commit = useCallback((prev, next) => {
    setSessions(next);
    saveSessions(next);
    const cfg = sync.getSyncConfig();
    if (!cfg) return;
    const { upserts, removedIds } = diffSessions(prev, next);
    let failed = false;
    const fail = () => { if (!failed) { failed = true; setSyncStatus("Offline — nog niet gesynct."); } };
    upserts.forEach((s) => sync.putSession(cfg, s).then(() => setSyncStatus("")).catch(fail));
    removedIds.forEach((id) => sync.deleteSession(cfg, id).catch(fail));
  }, []);

  const persistPresets = useCallback((next) => {
    setPresets(next);
    savePresets(next);
  }, []);

  const active = activeSession(sessions);

  const start = (label) => commit(sessions, switchActivity(sessions, label));
  const stop = () => commit(sessions, stopActivity(sessions));

  const refresh = async () => {
    setRefreshing(true);
    setSyncStatus("");
    try {
      adopt(await sync.fetchSessions(sync.getSyncConfig()));
    } catch {
      setSyncStatus("Verversen lukte niet. Ben je online?");
    }
    setRefreshing(false);
  };

  const startAdhoc = () => {
    if (!adhoc.trim()) return;
    commit(sessions, switchActivity(sessions, adhoc));
    setAdhoc("");
  };

  const addPreset = () => {
    const v = newPreset.trim();
    if (!v || presets.some((p) => p.toLowerCase() === v.toLowerCase())) {
      setNewPreset("");
      return;
    }
    persistPresets([...presets, v.slice(0, 120)]);
    setNewPreset("");
  };

  const removePreset = (label) => persistPresets(presets.filter((p) => p !== label));

  const deleteSession = (id) => commit(sessions, sessions.filter((s) => s.id !== id));

  const clearDay = () => {
    commit(sessions, sessions.filter((s) => localDateKey(new Date(s.start)) !== selectedDate));
    setConfirmClear(false);
  };

  const now = Date.now();
  const stats = dayStats(sessions, selectedDate, now);
  const maxLabelMs = stats.perLabel.length ? stats.perLabel[0].ms : 0;

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-6">
        <Timer size={26} strokeWidth={1.6} color="#1f4e8c" />
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Tijd</h1>
          <p className="text-xs opacity-60 dl-mono">wat je doet en hoe lang · met daganalyse</p>
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
            <span className="dl-btn-ghost p-2 inline-flex" title="Tijdregistratie wordt gesynchroniseerd">
              <Cloud size={15} color="#1f4e8c" />
            </span>
          </>
        )}
      </header>
      {syncStatus && <p className="text-xs mb-4 -mt-2 opacity-70">{syncStatus}</p>}

      {/* Running now */}
      <div className="dl-card p-4 mb-6">
        {active ? (
          <div className="flex items-center gap-3">
            <span className="dl-dot" style={{ animation: "dl-pulse 1.4s ease-in-out infinite" }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase dl-day-label opacity-60">Bezig met</div>
              <div className="text-lg font-semibold truncate">{active.label}</div>
            </div>
            <div className="dl-mono text-xl tabular-nums" aria-live="polite">
              {formatDuration(sessionMs(active, now))}
            </div>
            <button onClick={stop} className="dl-btn-primary px-3 py-2 flex items-center gap-1.5 text-sm" aria-label="Stop">
              <Square size={14} /> Stop
            </button>
          </div>
        ) : (
          <div className="text-sm opacity-70 flex items-center gap-2">
            <Timer size={15} className="opacity-60" />
            Niets loopt — tik hieronder een activiteit om te starten.
          </div>
        )}
      </div>

      {/* Quick buttons */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase dl-day-label opacity-60">Snel registreren</span>
        <button
          onClick={() => setEditing((e) => !e)}
          className="dl-btn-ghost text-xs px-2 py-1 flex items-center gap-1"
          aria-pressed={editing}
        >
          {editing ? <><Check size={12} /> Klaar</> : <><Pencil size={12} /> Bewerk</>}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {presets.map((label) => {
          const isActive = active && active.label === label;
          return (
            <div key={label} className="relative">
              <button
                onClick={() => start(label)}
                className={`dl-qbtn w-full ${isActive ? "dl-qbtn-active" : ""}`}
              >
                {label}
              </button>
              {editing && (
                <button
                  onClick={() => removePreset(label)}
                  className="absolute -top-1.5 -right-1.5 bg-[#b3362a] text-white rounded-full p-0.5"
                  aria-label={`Verwijder knop ${label}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newPreset}
            onChange={(e) => setNewPreset(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPreset()}
            placeholder="Nieuwe knop…"
            className="dl-input px-3 py-2 text-sm flex-1"
            aria-label="Nieuwe knop"
          />
          <button onClick={addPreset} className="dl-btn-primary px-3 py-2 text-sm flex items-center gap-1">
            <Plus size={15} /> Toevoegen
          </button>
        </div>
      )}

      {/* Ad-hoc */}
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          value={adhoc}
          onChange={(e) => setAdhoc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startAdhoc()}
          placeholder="Iets anders… (eenmalig)"
          className="dl-input px-3 py-2 text-sm flex-1"
          aria-label="Eenmalige activiteit"
        />
        <button
          onClick={startAdhoc}
          disabled={!adhoc.trim()}
          className="dl-btn-ghost px-3 py-2 text-sm flex items-center gap-1"
         
        >
          Start
        </button>
      </div>

      {/* Day analysis */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setSelectedDate((d) => addDaysKey(d, -1))} className="dl-btn-ghost p-1.5" aria-label="Vorige dag">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <div className="dl-mono text-xs uppercase dl-day-label opacity-60">{formatDayLabel(selectedDate)}</div>
          <div className="text-sm">
            Totaal <span className="font-semibold">{formatDuration(stats.total)}</span>
            <span className="opacity-50"> · {stats.sessions.length} {stats.sessions.length === 1 ? "sessie" : "sessies"}</span>
          </div>
        </div>
        <button
          onClick={() => setSelectedDate((d) => addDaysKey(d, 1))}
          disabled={selectedDate >= localDateKey()}
          className="dl-btn-ghost p-1.5"
          aria-label="Volgende dag"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : stats.sessions.length === 0 ? (
        <p className="text-sm opacity-50">Nog niets geregistreerd op deze dag.</p>
      ) : (
        <>
          {/* Per-activity totals */}
          <div className="dl-card p-4 mb-4">
            <div className="flex flex-col gap-3">
              {stats.perLabel.map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm truncate">{row.label}</span>
                    <span className="dl-mono text-xs opacity-70 shrink-0">
                      {formatDuration(row.ms)}
                      {stats.total > 0 && (
                        <span className="opacity-50"> · {Math.round((row.ms / stats.total) * 100)}%</span>
                      )}
                    </span>
                  </div>
                  <div className="dl-bar">
                    <div className="dl-bar-fill" style={{ width: maxLabelMs ? `${(row.ms / maxLabelMs) * 100}%` : "0%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Session timeline */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase dl-day-label opacity-50">Sessies</span>
            {confirmClear ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="opacity-60">Dag wissen?</span>
                <button onClick={clearDay} className="dl-btn-ghost px-2 py-0.5">Ja</button>
                <button onClick={() => setConfirmClear(false)} className="dl-btn-ghost px-2 py-0.5">Nee</button>
              </span>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="dl-btn-ghost text-xs px-2 py-0.5 opacity-60 hover:opacity-100">
                Dag wissen
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {stats.sessions.map((s) => (
              <div key={s.id} className="dl-ag-item p-2.5 flex items-center gap-3">
                <span className="dl-mono text-xs opacity-60 shrink-0">
                  {formatClock(s.start)}–{s.end ? formatClock(s.end) : "…"}
                </span>
                <span className="text-sm flex-1 truncate">{s.label}</span>
                <span className="dl-mono text-xs shrink-0">{formatDuration(sessionMs(s, now))}</span>
                <button
                  onClick={() => deleteSession(s.id)}
                  className="opacity-30 hover:opacity-80 transition-opacity shrink-0"
                  aria-label="Verwijder sessie"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
