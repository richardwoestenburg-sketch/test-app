import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Anchor, MapPin, Trash2, Plus, Compass, RotateCcw, Mic,
  Settings, RefreshCw, Cloud, CloudOff,
} from "lucide-react";
import { storage } from "./storage.js";
import * as sync from "./sync.js";

// Visual styling lives in src/theme.js and is injected once by App.

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dateStr) {
  const today = todayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = todayKey(y);
  if (dateStr === today) return "Vandaag";
  if (dateStr === yesterday) return "Gisteren";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

function nowHHMM() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export default function DagLog() {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [time, setTime] = useState(nowHHMM());
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef(null);
  const baseTextRef = useRef("");

  // Sync (Cloudflare Worker backend) — optional; app stays local without it.
  const [synced, setSynced] = useState(sync.isSyncConfigured());
  const [showSettings, setShowSettings] = useState(false);
  const [syncUrl, setSyncUrl] = useState(() => sync.getSyncConfig()?.baseUrl || "");
  const [syncKey, setSyncKey] = useState(() => sync.getSyncConfig()?.key || "");
  const [syncStatus, setSyncStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSpeechSupported(true);
    const rec = new SR();
    rec.lang = "nl-NL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setText((baseTextRef.current + transcript).slice(0, 500));
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSpeechError("Geen toegang tot de microfoon. Check je toestemming.");
      } else if (e.error === "no-speech") {
        setSpeechError("Niets gehoord. Probeer het nog eens.");
      } else if (e.error !== "aborted") {
        setSpeechError("Inspreken lukte niet. Probeer het nog eens.");
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch (_) {}
    };
  }, []);

  const toggleListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      return;
    }
    setSpeechError("");
    baseTextRef.current = text.trim() ? text.trim() + " " : "";
    try {
      rec.start();
      setListening(true);
    } catch (_) {
      // start() throws if already running; ignore.
    }
  };

  // Local cache (offline copy). Always written so the app works offline and
  // without a backend.
  const persist = useCallback(async (next) => {
    try {
      const result = await storage.set("daglog-entries", JSON.stringify(next), false);
      if (!result) setLoadError(true);
    } catch (e) {
      setLoadError(true);
    }
  }, []);

  const loadLocal = useCallback(async () => {
    try {
      const res = await storage.get("daglog-entries", false);
      const parsed = res ? JSON.parse(res.value) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }, []);

  // Pull the latest entries from the backend (used on load, on refresh, and
  // when the window regains focus so watch-added entries show up).
  const pullFromServer = useCallback(async () => {
    const cfg = sync.getSyncConfig();
    if (!cfg) return false;
    const remote = await sync.fetchEntries(cfg);
    setEntries(remote);
    await persist(remote);
    return true;
  }, [persist]);

  useEffect(() => {
    (async () => {
      const cfg = sync.getSyncConfig();
      if (cfg) {
        try {
          await pullFromServer();
        } catch (e) {
          setEntries(await loadLocal());
          setSyncStatus("Offline — lokale kopie getoond.");
        }
      } else {
        setEntries(await loadLocal());
      }
      setLoaded(true);
    })();
  }, [pullFromServer, loadLocal]);

  // Refresh from the server when the app regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (sync.isSyncConfigured()) {
        pullFromServer().catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pullFromServer]);

  const addEntry = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const today = todayKey();
    const [hh, mm] = time.split(":").map(Number);
    const iso = new Date();
    iso.setHours(hh, mm, 0, 0);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: today,
      timeLabel: time,
      timestamp: iso.toISOString(),
      text: text.trim(),
      lat: coords ? coords.lat : null,
      lon: coords ? coords.lon : null,
    };
    const next = [...entries, entry].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    setEntries(next);
    await persist(next);
    setText("");
    setTime(nowHHMM());
    setCoords(null);

    const cfg = sync.getSyncConfig();
    if (cfg) {
      try {
        const remote = await sync.addEntry(cfg, entry);
        setEntries(remote);
        await persist(remote);
        setSyncStatus("");
      } catch (e) {
        setSyncStatus("Offline — lokaal opgeslagen, nog niet gesynct.");
      }
    }
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    await persist(next);
    const cfg = sync.getSyncConfig();
    if (cfg) {
      try {
        const remote = await sync.deleteEntry(cfg, id);
        setEntries(remote);
        await persist(remote);
      } catch (e) {
        setSyncStatus("Offline — verwijderen nog niet gesynct.");
      }
    }
  };

  const useLocation = () => {
    if (!navigator.geolocation) {
      setLocError("Locatie niet beschikbaar op dit apparaat.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocError("Kon locatie niet ophalen. Check je toestemming.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const resetAll = async () => {
    setEntries([]);
    await persist([]);
    setConfirmReset(false);
    const cfg = sync.getSyncConfig();
    if (cfg) {
      try {
        await sync.clearAll(cfg);
        setSyncStatus("");
      } catch (e) {
        setSyncStatus("Offline — wissen nog niet gesynct.");
      }
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setSyncStatus("");
    try {
      await pullFromServer();
    } catch (e) {
      setSyncStatus("Verversen lukte niet. Ben je online?");
    }
    setRefreshing(false);
  };

  const saveSyncSettings = async () => {
    const url = syncUrl.trim();
    const key = syncKey.trim();
    if (!url || !key) {
      sync.setSyncConfig(null);
      setSynced(false);
      setSyncStatus("Sync uitgeschakeld — app werkt lokaal.");
      return;
    }
    const cfg = { baseUrl: url.replace(/\/+$/, ""), key };
    setSyncStatus("Verbinden…");
    try {
      await sync.testConnection(cfg);
      sync.setSyncConfig(cfg);
      setSynced(true);
      const remote = await sync.fetchEntries(cfg);
      setEntries(remote);
      await persist(remote);
      setSyncStatus("Verbonden ✓");
      setShowSettings(false);
    } catch (e) {
      const msg = e.status === 401 ? "Onjuiste sleutel." : "Verbinden lukte niet. Check de URL.";
      setSyncStatus(msg);
    }
  };

  const groups = entries.reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const orderedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-8">
          <div className="dl-hero-icon"><Anchor size={22} strokeWidth={1.8} /></div>
          <div className="flex-1">
            <h1 className="dl-serif text-2xl">Daglog</h1>
            <p className="text-xs opacity-60 dl-mono">een journaal van hoe je je uren besteedt</p>
          </div>
          {synced && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="dl-btn-ghost p-2"
              aria-label="Ververs vanaf server"
              title="Ververs vanaf server"
            >
              <RefreshCw size={15} className={refreshing ? "dl-spin" : ""} />
            </button>
          )}
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="dl-btn-ghost p-2"
            aria-label="Sync-instellingen"
            title={synced ? "Sync aan" : "Sync-instellingen"}
          >
            {synced ? <Cloud size={15} className="dl-ico-accent" /> : <Settings size={15} />}
          </button>
        </header>

        {/* Sync settings panel */}
        {showSettings && (
          <div className="dl-card p-4 mb-8">
            <div className="flex items-center gap-3 mb-3">
              {synced ? <Cloud size={16} className="dl-ico-accent" /> : <CloudOff size={16} className="dl-ico-accent" />}
              <span className="text-xs uppercase dl-day-label opacity-70">Synchronisatie (Cloudflare)</span>
            </div>
            <p className="text-xs opacity-70 mb-3">
              Vul het adres van je Daglog-Worker en je sleutel in om aantekeningen te delen
              tussen je telefoon, horloge en browser. Laat leeg om alleen lokaal te werken.
            </p>
            <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Worker-URL</label>
            <input
              type="url"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              placeholder="https://daglog-api.jouwnaam.workers.dev"
              className="dl-input dl-mono px-3 py-2 text-sm w-full mb-3"
              aria-label="Worker-URL"
            />
            <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Sleutel</label>
            <input
              type="password"
              value={syncKey}
              onChange={(e) => setSyncKey(e.target.value)}
              placeholder="je geheime sleutel"
              className="dl-input dl-mono px-3 py-2 text-sm w-full mb-3"
              aria-label="Sleutel"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={saveSyncSettings} className="dl-btn-primary text-sm px-4 py-2">
                Opslaan &amp; verbinden
              </button>
              {synced && (
                <button
                  onClick={() => { setSyncUrl(""); setSyncKey(""); sync.setSyncConfig(null); setSynced(false); setSyncStatus("Sync uitgeschakeld."); }}
                  className="dl-btn-ghost text-xs px-3 py-2"
                 
                >
                  Sync uitschakelen
                </button>
              )}
            </div>
            {syncStatus && <p className="text-xs mt-2 opacity-80">{syncStatus}</p>}
          </div>
        )}
        {!showSettings && syncStatus && (
          <p className="text-xs mb-6 -mt-4 opacity-70">{syncStatus}</p>
        )}

        {/* New entry card */}
        <div className="dl-card p-4 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Compass size={16} className="dl-ico-accent" />
            <span className="text-xs uppercase dl-day-label opacity-70">Nieuwe aantekening</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="dl-input dl-mono px-3 py-2 text-sm w-28"
              aria-label="Tijdstip"
            />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
              placeholder="Wat deed je?"
              className="dl-input px-3 py-2 text-sm flex-1"
              aria-label="Activiteit"
            />
            {speechSupported && (
              <button
                onClick={toggleListening}
                className={`dl-mic px-3 flex items-center justify-center shrink-0 ${listening ? "dl-mic-live" : ""}`}
                aria-label={listening ? "Stop met inspreken" : "Inspreken"}
                aria-pressed={listening}
                title={listening ? "Stop met inspreken" : "Inspreken"}
              >
                <Mic size={16} />
              </button>
            )}
          </div>
          {speechError && (
            <p className="text-xs mb-3 -mt-1" style={{ color: "#b3362a" }}>{speechError}</p>
          )}
          {listening && (
            <p className="dl-mono text-[11px] mb-3 -mt-1 opacity-70">Aan het luisteren… spreek nu.</p>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={useLocation}
              disabled={locating}
              className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
             
            >
              <MapPin size={13} />
              {locating ? "Bezig…" : coords ? "Locatie toegevoegd ✓" : "Voeg locatie toe"}
            </button>
            <button
              onClick={addEntry}
              disabled={!text.trim() || saving}
              className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
            >
              <Plus size={15} /> Opslaan
            </button>
          </div>
          {locError && <p className="text-xs mt-2" style={{ color: "#b3362a" }}>{locError}</p>}
          {coords && (
            <p className="dl-mono text-[11px] mt-2 opacity-60">
              {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
            </p>
          )}
        </div>

        {/* Timeline */}
        {!loaded ? (
          <p className="text-sm opacity-50">Laden…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm opacity-50">Nog geen aantekeningen. Begin hierboven met je eerste log.</p>
        ) : (
          orderedDates.map((date) => (
            <div key={date} className="mb-7">
              <div className="dl-mono text-xs uppercase dl-day-label opacity-50 mb-3">
                {formatDayLabel(date)} · {groups[date].length} {groups[date].length === 1 ? "log" : "logs"}
              </div>
              <div>
                {groups[date].map((e) => (
                  <div key={e.id} className="dl-entry relative pl-6 pb-5">
                    <div className="dl-line" />
                    <div className="dl-dot absolute" style={{ left: "1.5px", top: "0.35rem" }} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="dl-mono text-xs opacity-60 mr-2">{e.timeLabel}</span>
                        <span className="text-sm">{e.text}</span>
                        {e.lat != null && (
                          <div className="flex items-center gap-1 mt-1 opacity-50">
                            <MapPin size={11} />
                            <span className="dl-mono text-[10px]">{e.lat.toFixed(4)}, {e.lon.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteEntry(e.id)}
                        className="opacity-30 hover:opacity-80 transition-opacity shrink-0"
                        aria-label="Verwijder aantekening"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {loadError && (
          <p className="text-xs mt-2" style={{ color: "#b3362a" }}>
            Opslaan lukte niet. Probeer het nog eens.
          </p>
        )}

        <div className="mt-10 flex justify-end">
          {confirmReset ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="opacity-60">Alles wissen?</span>
              <button onClick={resetAll} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
              <button onClick={() => setConfirmReset(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 opacity-50 hover:opacity-90"
            >
              <RotateCcw size={12} /> Alles wissen
            </button>
          )}
        </div>
      </div>
  );
}
