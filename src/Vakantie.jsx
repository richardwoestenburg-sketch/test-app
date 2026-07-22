import React, { useState, useEffect, useCallback, useRef } from "react";
import { Images, Camera, Plus, Trash2, MapPin, X, RotateCcw } from "lucide-react";
import * as vakantie from "./vakantie.js";

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

function formatShortDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

export default function Vakantie() {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [caption, setCaption] = useState("");
  const [time, setTime] = useState(nowHHMM());
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [urlVersion, setUrlVersion] = useState(0);
  const fileInputRef = useRef(null);
  const urlMapRef = useRef(new Map());

  const loadAll = useCallback(async () => {
    try {
      const all = await vakantie.getAllPhotos();
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setPhotos(all);
    } catch (e) {
      setError("Foto's laden lukte niet op dit apparaat/deze browser.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Keep one object URL per photo alive for as long as it's in the list;
  // revoke it as soon as the photo is removed or the component unmounts.
  useEffect(() => {
    const map = urlMapRef.current;
    const currentIds = new Set(photos.map((p) => p.id));
    let changed = false;
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
        changed = true;
      }
    }
    for (const p of photos) {
      if (!map.has(p.id)) {
        map.set(p.id, URL.createObjectURL(p.blob));
        changed = true;
      }
    }
    if (changed) setUrlVersion((v) => v + 1);
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const url of urlMapRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const useLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const pickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    setError("");
    const today = todayKey();
    const [hh, mm] = time.split(":").map(Number);
    const iso = new Date();
    iso.setHours(hh, mm, 0, 0);
    try {
      const entry = await vakantie.addPhoto({
        file,
        date: today,
        timeLabel: time,
        timestamp: iso.toISOString(),
        caption: caption.trim(),
        lat: coords ? coords.lat : null,
        lon: coords ? coords.lon : null,
      });
      setPhotos((prev) => [...prev, entry].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
      setCaption("");
      setTime(nowHHMM());
      setCoords(null);
    } catch (err) {
      setError("Foto opslaan lukte niet. Probeer een andere/kleinere foto.");
    }
    setSaving(false);
  };

  const removePhoto = async (id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await vakantie.deletePhoto(id);
    } catch (e) {
      setError("Verwijderen lukte niet.");
    }
  };

  const resetAll = async () => {
    setPhotos([]);
    setConfirmReset(false);
    try {
      await vakantie.clearAllPhotos();
    } catch (e) {
      setError("Wissen lukte niet.");
    }
  };

  const groups = photos.reduce((acc, p) => {
    (acc[p.date] = acc[p.date] || []).push(p);
    return acc;
  }, {});
  const orderedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const dayCount = orderedDates.length;
  const open = photos.find((p) => p.id === openId) || null;

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-8">
        <Images size={26} strokeWidth={1.6} color="#1f4e8c" />
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Vakantie</h1>
          <p className="text-xs opacity-60 dl-mono">
            {photos.length === 0
              ? "een fototijdlijn van je vakantie"
              : `${photos.length} foto${photos.length === 1 ? "" : "'s"} · ${dayCount} ${dayCount === 1 ? "dag" : "dagen"}`}
          </p>
        </div>
      </header>

      {/* New photo card */}
      <div className="dl-card p-4 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Camera size={16} color="#1f4e8c" />
          <span className="text-xs uppercase dl-day-label opacity-70">Nieuwe foto</span>
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
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Bijschrift (optioneel)"
            className="dl-input px-3 py-2 text-sm flex-1"
            aria-label="Bijschrift"
            maxLength={200}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChosen}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
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
            onClick={pickFile}
            disabled={saving}
            className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
          >
            <Plus size={15} /> {saving ? "Bezig…" : "Voeg foto toe"}
          </button>
        </div>
        {coords && (
          <p className="dl-mono text-[11px] mt-2 opacity-60">
            {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
          </p>
        )}
      </div>

      {/* Timeline */}
      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm opacity-50">Nog geen foto's. Voeg hierboven je eerste vakantiefoto toe.</p>
      ) : (
        orderedDates.map((date) => (
          <div key={date} className="mb-7">
            <div className="dl-mono text-xs uppercase dl-day-label opacity-50 mb-3">
              {formatDayLabel(date)} · {groups[date].length} {groups[date].length === 1 ? "foto" : "foto's"}
            </div>
            <div className="dl-photo-grid">
              {groups[date].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className="dl-photo-thumb-wrap"
                  aria-label={p.caption || `Foto om ${p.timeLabel}`}
                >
                  {urlMapRef.current.get(p.id) && (
                    <img src={urlMapRef.current.get(p.id)} alt={p.caption || ""} className="dl-photo-thumb" />
                  )}
                  <span className="dl-photo-time dl-mono">{p.timeLabel}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: "#b3362a" }}>{error}</p>
      )}

      <div className="mt-10 flex justify-end">
        {confirmReset ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-60">Alle foto's wissen?</span>
            <button onClick={resetAll} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
            <button onClick={() => setConfirmReset(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
          </div>
        ) : photos.length > 0 ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 opacity-50 hover:opacity-90"
          >
            <RotateCcw size={12} /> Alles wissen
          </button>
        ) : null}
      </div>

      {/* Lightbox */}
      {open && (
        <div className="dl-photo-overlay" onClick={() => setOpenId(null)}>
          <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img src={urlMapRef.current.get(open.id)} alt={open.caption || ""} className="dl-photo-modal-img" />
            <div className="flex items-start justify-between gap-3 mt-3">
              <div>
                <div className="dl-mono text-xs opacity-70">
                  {formatShortDate(open.date)} · {open.timeLabel}
                </div>
                {open.caption && <div className="text-sm mt-1">{open.caption}</div>}
                {open.lat != null && (
                  <div className="flex items-center gap-1 mt-1 opacity-60">
                    <MapPin size={11} />
                    <span className="dl-mono text-[10px]">{open.lat.toFixed(4)}, {open.lon.toFixed(4)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => removePhoto(open.id)}
                  className="dl-btn-ghost p-2"
                  aria-label="Verwijder foto"
                  title="Verwijder foto"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={() => setOpenId(null)}
                  className="dl-btn-ghost p-2"
                  aria-label="Sluiten"
                  title="Sluiten"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
