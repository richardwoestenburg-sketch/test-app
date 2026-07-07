import React, { useState, useEffect, useCallback } from "react";
import { Anchor, MapPin, Trash2, Plus, Compass, RotateCcw } from "lucide-react";
import { storage } from "./storage.js";

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.dl-root {
  font-family: 'Inter', sans-serif;
  background: #10151c;
  background-image:
    radial-gradient(circle at 20% 0%, rgba(184,137,43,0.08), transparent 40%),
    radial-gradient(circle at 80% 100%, rgba(184,137,43,0.05), transparent 40%);
  min-height: 100vh;
  color: #ede6d0;
}
.dl-serif { font-family: 'Fraunces', serif; }
.dl-mono { font-family: 'JetBrains Mono', monospace; }

.dl-card {
  background: #efe3c0;
  color: #241d10;
  border-radius: 10px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.15), 0 8px 20px -10px rgba(0,0,0,0.5);
}

.dl-input {
  background: rgba(16,21,28,0.04);
  border: 1px solid rgba(36,29,16,0.18);
  border-radius: 8px;
  color: #241d10;
}
.dl-input:focus {
  outline: none;
  border-color: #b8892b;
  box-shadow: 0 0 0 3px rgba(184,137,43,0.18);
}

.dl-btn-primary {
  background: #1f2a36;
  color: #efe3c0;
  border-radius: 8px;
  transition: transform 0.12s ease, background 0.12s ease;
}
.dl-btn-primary:hover { background: #2a3949; }
.dl-btn-primary:active { transform: scale(0.97); }
.dl-btn-primary:disabled { opacity: 0.45; }

.dl-btn-ghost {
  border: 1px solid rgba(237,230,208,0.25);
  color: #ede6d0;
  border-radius: 8px;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-btn-ghost:hover { background: rgba(237,230,208,0.06); border-color: rgba(237,230,208,0.4); }

.dl-line {
  position: absolute;
  left: 6px;
  top: 0.65rem;
  bottom: -1.1rem;
  width: 1px;
  background: linear-gradient(to bottom, rgba(184,137,43,0.6), rgba(184,137,43,0.15));
}
.dl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #b8892b;
  box-shadow: 0 0 0 3px rgba(184,137,43,0.18);
}
.dl-entry:last-child .dl-line { display: none; }

.dl-day-label {
  letter-spacing: 0.14em;
}

@media (prefers-reduced-motion: reduce) {
  .dl-btn-primary, .dl-btn-ghost { transition: none; }
}
`;

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

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("daglog-entries", false);
        const parsed = res ? JSON.parse(res.value) : [];
        setEntries(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        setEntries([]);
        setLoadError(false);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    try {
      const result = await storage.set("daglog-entries", JSON.stringify(next), false);
      if (!result) setLoadError(true);
    } catch (e) {
      setLoadError(true);
    }
  }, []);

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
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    await persist(next);
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
  };

  const groups = entries.reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const orderedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="dl-root">
      <style>{FONT_STYLE}</style>
      <div className="max-w-xl mx-auto px-5 py-8">
        <header className="flex items-center gap-3 mb-8">
          <Anchor size={26} strokeWidth={1.6} color="#b8892b" />
          <div>
            <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Daglog</h1>
            <p className="text-xs opacity-60 dl-mono">een journaal van hoe je je uren besteedt</p>
          </div>
        </header>

        {/* New entry card */}
        <div className="dl-card p-4 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Compass size={16} color="#b8892b" />
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
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={useLocation}
              disabled={locating}
              className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={{ color: "#241d10", borderColor: "rgba(36,29,16,0.25)" }}
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
          {locError && <p className="text-xs mt-2" style={{ color: "#8a3b1f" }}>{locError}</p>}
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
          <p className="text-xs mt-2" style={{ color: "#c0654a" }}>
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
    </div>
  );
}
