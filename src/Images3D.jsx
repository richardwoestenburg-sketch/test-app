import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Wand2, Trash2, X, RotateCcw, Download } from "lucide-react";
import * as images3d from "./images3d.js";
import * as images3dApi from "./images3dApi.js";

// Visual styling lives in src/theme.js and is injected once by App.

const SIZE_OPTIONS = [
  { value: "1024x1024", width: 1024, height: 1024, label: "Vierkant · 1024×1024" },
  { value: "1536x1024", width: 1536, height: 1024, label: "Breed · 1536×1024" },
  { value: "1024x1536", width: 1024, height: 1536, label: "Staand · 1024×1536" },
];

const STYLE_SUFFIX = "3D render, octane render, hoge resolutie, gedetailleerd, studiolicht";

function formatShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export default function Images3D() {
  const [images, setImages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(SIZE_OPTIONS[0].value);
  const [style3d, setStyle3d] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [, setUrlVersion] = useState(0);
  const urlMapRef = useRef(new Map());

  const loadAll = useCallback(async () => {
    try {
      const all = await images3d.getAllImages();
      all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setImages(all);
    } catch {
      setError("Afbeeldingen laden lukte niet op dit apparaat/deze browser.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const map = urlMapRef.current;
    const currentIds = new Set(images.map((p) => p.id));
    let changed = false;
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
        changed = true;
      }
    }
    for (const p of images) {
      if (!map.has(p.id)) {
        map.set(p.id, URL.createObjectURL(p.blob));
        changed = true;
      }
    }
    if (changed) setUrlVersion((v) => v + 1);
  }, [images]);

  useEffect(() => {
    return () => {
      for (const url of urlMapRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setGenerating(true);
    setError("");
    try {
      const opt = SIZE_OPTIONS.find((o) => o.value === size) || SIZE_OPTIONS[0];
      const fullPrompt = style3d ? `${trimmed}, ${STYLE_SUFFIX}` : trimmed;
      const blob = await images3dApi.generateImage({
        prompt: fullPrompt,
        width: opt.width,
        height: opt.height,
      });
      const entry = await images3d.addImage({ prompt: trimmed, size, blob });
      setImages((prev) => [entry, ...prev]);
      setPrompt("");
    } catch {
      setError("Genereren lukte niet. Probeer het opnieuw of gebruik een andere omschrijving.");
    }
    setGenerating(false);
  };

  const removeImage = async (id) => {
    setImages((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await images3d.deleteImage(id);
    } catch {
      setError("Verwijderen lukte niet.");
    }
  };

  const resetAll = async () => {
    setImages([]);
    setConfirmReset(false);
    try {
      await images3d.clearAllImages();
    } catch {
      setError("Wissen lukte niet.");
    }
  };

  const open = images.find((p) => p.id === openId) || null;

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-8">
        <Box size={26} strokeWidth={1.6} color="#b8892b" />
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Afbeeldingen</h1>
          <p className="text-xs opacity-60 dl-mono">
            {images.length === 0
              ? "hoge-resolutie 3D-afbeeldingen op omschrijving"
              : `${images.length} afbeelding${images.length === 1 ? "" : "en"}`}
          </p>
        </div>
      </header>

      {/* Prompt card */}
      <div className="dl-card p-4 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Wand2 size={16} color="#b8892b" />
          <span className="text-xs uppercase dl-day-label opacity-70">Nieuwe afbeelding</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Omschrijf wat je wilt zien, bv. 'een rode sportauto op een marmeren plateau'"
          className="dl-input px-3 py-2 text-sm w-full"
          rows={3}
          maxLength={800}
          aria-label="Omschrijving"
        />
        <div className="flex items-center gap-3 gap-y-2 mt-3 flex-wrap">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="dl-input px-2 py-1.5 text-xs"
            aria-label="Resolutie"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "#241d10" }}>
            <input
              type="checkbox"
              checked={style3d}
              onChange={(e) => setStyle3d(e.target.checked)}
            />
            3D-render stijl toevoegen
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={generate}
            disabled={generating || !prompt.trim()}
            className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
          >
            <Wand2 size={15} className={generating ? "dl-spin" : ""} />
            {generating ? "Bezig…" : "Genereer"}
          </button>
        </div>
      </div>

      {/* Gallery */}
      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : images.length === 0 ? (
        <p className="text-sm opacity-50">Nog geen afbeeldingen. Typ hierboven een omschrijving en genereer je eerste 3D-afbeelding.</p>
      ) : (
        <div className="dl-photo-grid">
          {images.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className="dl-photo-thumb-wrap"
              aria-label={p.prompt}
            >
              {urlMapRef.current.get(p.id) && (
                <img src={urlMapRef.current.get(p.id)} alt={p.prompt} className="dl-photo-thumb" />
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs mt-3" style={{ color: "#c0654a" }}>{error}</p>
      )}

      <div className="mt-10 flex justify-end">
        {confirmReset ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-60">Alle afbeeldingen wissen?</span>
            <button onClick={resetAll} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
            <button onClick={() => setConfirmReset(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
          </div>
        ) : images.length > 0 ? (
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
            <img src={urlMapRef.current.get(open.id)} alt={open.prompt} className="dl-photo-modal-img" />
            <div className="flex items-start justify-between gap-3 mt-3">
              <div>
                <div className="dl-mono text-xs opacity-70">
                  {formatShort(open.timestamp)} · {open.size}
                </div>
                <div className="text-sm mt-1">{open.prompt}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={urlMapRef.current.get(open.id)}
                  download={`3d-${open.id}.png`}
                  className="dl-btn-ghost p-2"
                  aria-label="Download afbeelding"
                  title="Download afbeelding"
                >
                  <Download size={15} />
                </a>
                <button
                  onClick={() => removeImage(open.id)}
                  className="dl-btn-ghost p-2"
                  aria-label="Verwijder afbeelding"
                  title="Verwijder afbeelding"
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
