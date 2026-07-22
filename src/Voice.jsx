import React, { useState, useEffect, useCallback, useRef } from "react";
import { Mic, Square, KeyRound, Wand2, Loader2, Download, Trash2, RotateCcw, AudioLines } from "lucide-react";
import * as voice from "./voice.js";
import * as voiceApi from "./voiceApi.js";

function formatShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function friendlyError(e, fallback) {
  // e.status is alleen gezet wanneer voiceApi een HTTP-antwoord met een
  // duidelijke (Nederlandse of ElevenLabs-)foutmelding kon uitlezen; anders
  // (bv. een netwerkfout) tonen we liever de generieke Nederlandse tekst dan
  // de ruwe browserfout ("Failed to fetch").
  return e && e.status ? e.message : fallback;
}

function pickMimeType() {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export default function Voice() {
  const [apiKey, setApiKeyState] = useState(voice.getApiKey());
  const [apiKeyInput, setApiKeyInput] = useState(voice.getApiKey());
  const [clonedVoice, setClonedVoiceState] = useState(voice.getClonedVoice());

  const [samples, setSamples] = useState([]); // { id, blob, url }
  const [recording, setRecording] = useState(false);
  const [recError, setRecError] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState("");
  const [confirmResetVoice, setConfirmResetVoice] = useState(false);

  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const [clips, setClips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmResetClips, setConfirmResetClips] = useState(false);
  const [, setUrlVersion] = useState(0);
  const urlMapRef = useRef(new Map());

  const loadClips = useCallback(async () => {
    try {
      const all = await voice.getAllClips();
      all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setClips(all);
    } catch {
      setGenError("Geschiedenis laden lukte niet op dit apparaat/deze browser.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  useEffect(() => {
    const map = urlMapRef.current;
    const currentIds = new Set(clips.map((c) => c.id));
    let changed = false;
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
        changed = true;
      }
    }
    for (const c of clips) {
      if (!map.has(c.id)) {
        map.set(c.id, URL.createObjectURL(c.blob));
        changed = true;
      }
    }
    if (changed) setUrlVersion((v) => v + 1);
  }, [clips]);

  useEffect(() => {
    return () => {
      for (const url of urlMapRef.current.values()) URL.revokeObjectURL(url);
      for (const s of samples) URL.revokeObjectURL(s.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    voice.setApiKey(trimmed);
    setApiKeyState(trimmed);
  };

  const startRecording = async () => {
    setRecError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setSamples((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, blob, url }]);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecError("Kon niet bij de microfoon. Geef toestemming voor microfoontoegang en probeer opnieuw.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const removeSample = (id) => {
    setSamples((prev) => {
      const found = prev.find((s) => s.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((s) => s.id !== id);
    });
  };

  const cloneVoice = async () => {
    if (samples.length === 0 || cloning) return;
    setCloning(true);
    setCloneError("");
    try {
      const result = await voiceApi.addVoice({
        apiKey,
        name: "Mijn stem",
        samples: samples.map((s) => s.blob),
      });
      voice.setClonedVoice(result);
      setClonedVoiceState(result);
      for (const s of samples) URL.revokeObjectURL(s.url);
      setSamples([]);
    } catch (e) {
      setCloneError(friendlyError(e, "Stem klonen is mislukt. Controleer je API-key en internetverbinding."));
    }
    setCloning(false);
  };

  const resetVoice = async () => {
    setConfirmResetVoice(false);
    try {
      await voiceApi.deleteVoice({ apiKey, voiceId: clonedVoice.voiceId });
    } catch {
      /* best effort: lokaal toch loskoppelen */
    }
    voice.setClonedVoice(null);
    setClonedVoiceState(null);
  };

  const generate = async () => {
    const trimmed = text.trim();
    if (!trimmed || generating || !clonedVoice) return;
    setGenerating(true);
    setGenError("");
    try {
      const blob = await voiceApi.textToSpeech({ apiKey, voiceId: clonedVoice.voiceId, text: trimmed });
      const entry = await voice.addClip({ text: trimmed, blob });
      setClips((prev) => [entry, ...prev]);
      setText("");
    } catch (e) {
      setGenError(friendlyError(e, "Genereren lukte niet. Controleer je internetverbinding en probeer opnieuw."));
    }
    setGenerating(false);
  };

  const removeClip = async (id) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    try {
      await voice.deleteClip(id);
    } catch {
      setGenError("Verwijderen lukte niet.");
    }
  };

  const resetClips = async () => {
    setClips([]);
    setConfirmResetClips(false);
    try {
      await voice.clearAllClips();
    } catch {
      setGenError("Wissen lukte niet.");
    }
  };

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      <header className="flex items-center gap-3 mb-8">
        <AudioLines size={26} strokeWidth={1.6} color="#1f4e8c" />
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Stem</h1>
          <p className="text-xs opacity-60 dl-mono">
            {clonedVoice ? `gekloond: ${clonedVoice.voiceName || "mijn stem"}` : "kloon je eigen stem"}
          </p>
        </div>
      </header>

      {!apiKey ? (
        <div className="dl-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound size={15} color="#1f4e8c" />
            <span className="text-sm font-semibold">Fish Audio API-key</span>
          </div>
          <p className="text-sm opacity-70 mb-3">
            Stemklonen loopt via <span className="dl-mono">fish.audio</span> — maak daar een gratis
            account (Profiel → API Keys), kopieer je API-key en plak 'm hieronder. De gratis laag geeft
            elke maand een beperkt aantal minuten, voor persoonlijk gebruik. De key wordt alleen lokaal
            in je browser bewaard en rechtstreeks naar Fish Audio gestuurd, er is geen eigen server voor
            nodig. Kloon alleen je eigen stem, met je eigen toestemming.
          </p>
          <input
            type="password"
            className="dl-input w-full px-3 py-2 text-sm mb-2"
            placeholder="Fish Audio API-key"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <button
            className="dl-btn-primary text-sm px-4 py-2"
            onClick={saveApiKey}
            disabled={!apiKeyInput.trim()}
          >
            Opslaan
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <button
              className="dl-btn-ghost text-xs px-3 py-1.5 opacity-60 hover:opacity-90"
              onClick={() => {
                voice.setApiKey("");
                setApiKeyState("");
                setApiKeyInput("");
              }}
            >
              API-key loskoppelen
            </button>
          </div>

          {!clonedVoice ? (
            <div className="dl-card p-4 mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Mic size={15} color="#1f4e8c" />
                <span className="text-sm font-semibold">Stem opnemen</span>
              </div>
              <p className="text-sm opacity-70 mb-3">
                Neem een paar opnames van jezelf op (spreek rustig, in een stille ruimte). Meerdere korte
                opnames van samen zo'n 1–2 minuut geven het beste resultaat.
              </p>
              <div className="flex items-center gap-2 mb-3">
                {!recording ? (
                  <button className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5" onClick={startRecording}>
                    <Mic size={15} /> Opname starten
                  </button>
                ) : (
                  <button className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5" onClick={stopRecording} style={{ background: "#b3362a" }}>
                    <Square size={15} /> Stop
                  </button>
                )}
              </div>
              {recError && <p className="text-xs mb-3" style={{ color: "#b3362a" }}>{recError}</p>}
              {samples.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {samples.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="text-xs opacity-60 w-16">Opname {i + 1}</span>
                      <audio src={s.url} controls className="flex-1" style={{ height: 32 }} />
                      <button onClick={() => removeSample(s.id)} className="opacity-60 hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={cloneVoice}
                disabled={samples.length === 0 || cloning}
                className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                <Wand2 size={15} className={cloning ? "dl-spin" : ""} />
                {cloning ? "Bezig…" : "Stem klonen"}
              </button>
              {cloneError && <p className="text-xs mt-2" style={{ color: "#b3362a" }}>{cloneError}</p>}
            </div>
          ) : (
            <div className="dl-card p-4 mb-8">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  Gekloonde stem: <strong>{clonedVoice.voiceName || "Mijn stem"}</strong>
                </div>
                {confirmResetVoice ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="opacity-60">Zeker weten?</span>
                    <button onClick={resetVoice} className="dl-btn-ghost px-2 py-1">Ja, opnieuw</button>
                    <button onClick={() => setConfirmResetVoice(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
                  </div>
                ) : (
                  <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setConfirmResetVoice(true)}>
                    <RotateCcw size={12} /> Opnieuw instellen
                  </button>
                )}
              </div>
            </div>
          )}

          {clonedVoice && (
            <>
              <div className="dl-card p-4 mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <Wand2 size={16} color="#1f4e8c" />
                  <span className="text-xs uppercase dl-day-label opacity-70">Laat voorlezen</span>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Typ de tekst die je in je eigen stem wilt horen…"
                  className="dl-input px-3 py-2 text-sm w-full"
                  rows={3}
                  maxLength={2000}
                  aria-label="Tekst"
                />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button
                    onClick={generate}
                    disabled={generating || !text.trim()}
                    className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                  >
                    <Wand2 size={15} className={generating ? "dl-spin" : ""} />
                    {generating ? "Bezig…" : "Genereer"}
                  </button>
                </div>
                {genError && <p className="text-xs mt-2" style={{ color: "#b3362a" }}>{genError}</p>}
              </div>

              {!loaded ? (
                <p className="text-sm opacity-50">Laden…</p>
              ) : clips.length === 0 ? (
                <p className="text-sm opacity-50">Nog geen fragmenten. Typ hierboven tekst en genereer je eerste fragment.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {clips.map((c) => (
                    <div key={c.id} className="dl-card p-3">
                      <div className="text-sm mb-2">{c.text}</div>
                      <div className="flex items-center gap-2">
                        <audio src={urlMapRef.current.get(c.id)} controls className="flex-1" style={{ height: 32 }} />
                        <a
                          href={urlMapRef.current.get(c.id)}
                          download={`stem-${c.id}.mp3`}
                          className="dl-btn-ghost p-2"
                          aria-label="Download fragment"
                          title="Download fragment"
                        >
                          <Download size={15} />
                        </a>
                        <button
                          onClick={() => removeClip(c.id)}
                          className="dl-btn-ghost p-2"
                          aria-label="Verwijder fragment"
                          title="Verwijder fragment"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="dl-mono text-xs opacity-50 mt-1">{formatShort(c.timestamp)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                {confirmResetClips ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="opacity-60">Alle fragmenten wissen?</span>
                    <button onClick={resetClips} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
                    <button onClick={() => setConfirmResetClips(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
                  </div>
                ) : clips.length > 0 ? (
                  <button
                    onClick={() => setConfirmResetClips(true)}
                    className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 opacity-50 hover:opacity-90"
                  >
                    <RotateCcw size={12} /> Alles wissen
                  </button>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
