import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle, Camera, Send, Trash2, X, RotateCcw, Check,
  Settings, ChevronDown, ChevronRight, Mail, FileDown,
} from "lucide-react";
import * as meldingen from "./meldingen.js";
import { INCIDENT_TYPES, typeLabel } from "./meldingen.js";
import { fillTemplate, downloadFilename } from "./meldingenDocx.js";

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

const emptyBetrokkene = {
  betrokkeneNaam: "",
  betrokkeneAdres: "",
  betrokkenePostcode: "",
  betrokkeneGeboortedatum: "",
  betrokkeneIndiensttreding: "",
  betrokkeneAfdeling: "",
  betrokkeneEigenOfAnders: "",
};

export default function Meldingen() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(meldingen.loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  const [locatie, setLocatie] = useState("");
  const [soorten, setSoorten] = useState([]);
  const [omschrijving, setOmschrijving] = useState("");
  const [betrokkene, setBetrokkene] = useState(emptyBetrokkene);
  const [showBetrokkene, setShowBetrokkene] = useState(false);
  const [maatregelen, setMaatregelen] = useState("");
  const [actieLeidinggevende, setActieLeidinggevende] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [saving, setSaving] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const fileInputRef = useRef(null);
  const omschrijvingRef = useRef(null);
  const urlMapRef = useRef(new Map());

  const loadAll = useCallback(async () => {
    try {
      const all = await meldingen.getAllMeldingen();
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setItems(all);
    } catch (e) {
      setError("Meldingen laden lukte niet op dit apparaat/deze browser.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadAll();
    omschrijvingRef.current?.focus();
  }, [loadAll]);

  useEffect(() => {
    const map = urlMapRef.current;
    const currentIds = new Set(items.map((p) => p.id));
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
    for (const p of items) {
      if (p.blob && !map.has(p.id)) {
        map.set(p.id, URL.createObjectURL(p.blob));
      }
    }
  }, [items]);

  useEffect(() => {
    return () => {
      for (const url of urlMapRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const toggleSoort = (key) => {
    setSoorten((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const pickPhoto = () => fileInputRef.current?.click();

  const onPhotoChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const resetForm = () => {
    setLocatie("");
    setSoorten([]);
    setOmschrijving("");
    setBetrokkene(emptyBetrokkene);
    setShowBetrokkene(false);
    setMaatregelen("");
    setActieLeidinggevende("");
    clearPhoto();
  };

  const saveSetting = (key) => (e) => setSettings(meldingen.saveSettings({ [key]: e.target.value }));

  const submit = async () => {
    if (!omschrijving.trim() || saving) return;
    setSaving(true);
    setError("");
    const today = todayKey();
    const time = nowHHMM();
    const [hh, mm] = time.split(":").map(Number);
    const iso = new Date();
    iso.setHours(hh, mm, 0, 0);
    try {
      const entry = await meldingen.addMelding({
        melderNaam: settings.melderNaam,
        melderFunctie: settings.melderFunctie,
        date: today,
        timeLabel: time,
        timestamp: iso.toISOString(),
        locatie: locatie.trim(),
        soorten,
        omschrijving: omschrijving.trim(),
        ...betrokkene,
        maatregelen: maatregelen.trim(),
        actieLeidinggevende: actieLeidinggevende.trim(),
        photo: photoFile,
      });
      setItems((prev) => [...prev, entry].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
      resetForm();
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2200);
      omschrijvingRef.current?.focus();
      // Downloadt het echte formulier (1-op-1 kopie, ingevuld) en opent
      // meteen de mail-app naar quality; het gedownloade bestand voeg je
      // zelf toe als bijlage (een mailto-link kan dat niet automatisch).
      await downloadDocx(entry);
      if (settings.qualityEmail) {
        window.location.href = meldingen.buildMailtoUrl(entry, settings.qualityEmail);
        await meldingen.markVerstuurd(entry.id);
        setItems((prev) => prev.map((p) => (p.id === entry.id ? { ...p, verstuurd: true } : p)));
      } else {
        setShowSettings(true);
        setError("Nog geen e-mailadres voor quality ingesteld — vul die hieronder in om direct te kunnen versturen.");
      }
    } catch (err) {
      setError("Melding opslaan lukte niet. Probeer het nog eens.");
    }
    setSaving(false);
  };

  const downloadDocx = async (entry) => {
    setDownloadingId(entry.id);
    setError("");
    try {
      const blob = await fillTemplate(entry);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename(entry);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError("Het formulier (.docx) downloaden lukte niet.");
    }
    setDownloadingId(null);
  };

  const sendExisting = async (entry) => {
    if (!settings.qualityEmail) {
      setShowSettings(true);
      setError("Vul eerst het e-mailadres van quality in bij instellingen.");
      return;
    }
    window.location.href = meldingen.buildMailtoUrl(entry, settings.qualityEmail);
    await meldingen.markVerstuurd(entry.id);
    setItems((prev) => prev.map((p) => (p.id === entry.id ? { ...p, verstuurd: true } : p)));
  };

  const removeItem = async (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await meldingen.deleteMelding(id);
    } catch (e) {
      setError("Verwijderen lukte niet.");
    }
  };

  const resetAll = async () => {
    setItems([]);
    setConfirmReset(false);
    try {
      await meldingen.clearAllMeldingen();
    } catch (e) {
      setError("Wissen lukte niet.");
    }
  };

  const groups = items.reduce((acc, p) => {
    (acc[p.date] = acc[p.date] || []).push(p);
    return acc;
  }, {});
  const orderedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const open = items.find((p) => p.id === openId) || null;

  return (
    <div className="max-w-xl mx-auto px-5 pb-10">
      <header className="flex items-center gap-3 mb-8">
        <div className="dl-hero-icon"><AlertTriangle size={22} strokeWidth={1.8} /></div>
        <div className="flex-1">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Meldingen</h1>
          <p className="text-xs opacity-60 dl-mono">
            {items.length === 0
              ? "ongevallenmeldingsformulier — direct naar quality"
              : `${items.length} melding${items.length === 1 ? "" : "en"}`}
          </p>
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="dl-btn-ghost p-2"
          aria-label="Instellingen"
          title="Instellingen"
        >
          <Settings size={15} />
        </button>
      </header>

      {showSettings && (
        <div className="dl-card p-4 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Mail size={16} className="dl-ico-accent" />
            <span className="text-xs uppercase dl-day-label opacity-70">Instellingen</span>
          </div>
          <p className="text-xs opacity-70 mb-3">
            Het e-mailadres van quality wordt gebruikt om een melding direct na het versturen
            te openen in je mail-app, al ingevuld. Naam en functie worden standaard ingevuld
            bij een nieuwe melding.
          </p>
          <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">E-mailadres quality</label>
          <input
            type="email"
            value={settings.qualityEmail}
            onChange={saveSetting("qualityEmail")}
            placeholder="quality@eurosort.com"
            className="dl-input dl-mono px-3 py-2 text-sm w-full mb-3"
            aria-label="E-mailadres quality"
          />
          <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Naam melder</label>
          <input
            type="text"
            value={settings.melderNaam}
            onChange={saveSetting("melderNaam")}
            placeholder="Richard Woestenburg"
            className="dl-input px-3 py-2 text-sm w-full mb-3"
            aria-label="Naam melder"
          />
          <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Functie</label>
          <input
            type="text"
            value={settings.melderFunctie}
            onChange={saveSetting("melderFunctie")}
            placeholder="Supervisor assembly"
            className="dl-input px-3 py-2 text-sm w-full"
            aria-label="Functie"
          />
        </div>
      )}

      {/* Nieuwe melding: velden van het echte formulier, zo min mogelijk tikken */}
      <div className="dl-card p-4 mb-8">
        <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Locatie</label>
        <input
          type="text"
          value={locatie}
          onChange={(e) => setLocatie(e.target.value)}
          placeholder="Waar is het? (bv. Werkplaats nieuwe hal)"
          className="dl-input px-3 py-2 text-sm w-full mb-3"
          aria-label="Locatie"
          maxLength={200}
        />

        <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">Soort incident</label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {INCIDENT_TYPES.map((t) => {
            const active = soorten.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleSoort(t.key)}
                className="mg-sev-btn"
                style={active ? { background: "#dc2626", borderColor: "#dc2626", color: "#ffffff" } : {}}
                aria-pressed={active}
              >
                {active ? <Check size={13} /> : <span className="mg-sev-dot" style={{ background: "#dc2626" }} />}
                {t.label}
              </button>
            );
          })}
        </div>

        <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">
          Omschrijf zo concreet mogelijk de gebeurtenis, de werkzaamheden direct voorafgaand
          en het eventuele letsel
        </label>
        <textarea
          ref={omschrijvingRef}
          value={omschrijving}
          onChange={(e) => setOmschrijving(e.target.value)}
          placeholder="Wat is er gebeurd?"
          rows={3}
          className="dl-input px-3 py-2 text-sm w-full mb-3 resize-none"
          aria-label="Omschrijving"
          maxLength={1000}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoChosen}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        {photoPreview && (
          <div className="relative inline-block mb-3">
            <img src={photoPreview} alt="" className="rounded-lg" style={{ height: 72, width: 72, objectFit: "cover" }} />
            <button
              onClick={clearPhoto}
              className="dl-btn-ghost absolute -top-2 -right-2 p-1"
              style={{ minHeight: "auto", width: 22, height: 22 }}
              aria-label="Verwijder foto"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="mb-3">
          <button onClick={pickPhoto} className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Camera size={13} /> {photoPreview ? "Andere foto" : "Foto toevoegen (optioneel)"}
          </button>
        </div>

        <button
          onClick={() => setShowBetrokkene((s) => !s)}
          className="flex items-center gap-1.5 text-xs uppercase dl-day-label opacity-70 mb-2"
        >
          {showBetrokkene ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Gegevens betrokkene (optioneel)
        </button>
        {showBetrokkene && (
          <div className="mb-3 flex flex-col gap-2">
            <input type="text" value={betrokkene.betrokkeneNaam} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneNaam: e.target.value }))} placeholder="Naam" className="dl-input px-3 py-2 text-sm w-full" aria-label="Naam betrokkene" />
            <input type="text" value={betrokkene.betrokkeneAdres} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneAdres: e.target.value }))} placeholder="Adres" className="dl-input px-3 py-2 text-sm w-full" aria-label="Adres" />
            <input type="text" value={betrokkene.betrokkenePostcode} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkenePostcode: e.target.value }))} placeholder="Postcode en woonplaats" className="dl-input px-3 py-2 text-sm w-full" aria-label="Postcode en woonplaats" />
            <input type="text" value={betrokkene.betrokkeneGeboortedatum} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneGeboortedatum: e.target.value }))} placeholder="Geboortedatum" className="dl-input px-3 py-2 text-sm w-full" aria-label="Geboortedatum" />
            <input type="text" value={betrokkene.betrokkeneIndiensttreding} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneIndiensttreding: e.target.value }))} placeholder="Datum indiensttreding" className="dl-input px-3 py-2 text-sm w-full" aria-label="Datum indiensttreding" />
            <input type="text" value={betrokkene.betrokkeneAfdeling} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneAfdeling: e.target.value }))} placeholder="Afdeling" className="dl-input px-3 py-2 text-sm w-full" aria-label="Afdeling" />
            <input type="text" value={betrokkene.betrokkeneEigenOfAnders} onChange={(e) => setBetrokkene((b) => ({ ...b, betrokkeneEigenOfAnders: e.target.value }))} placeholder="Eigen medewerker/anders" className="dl-input px-3 py-2 text-sm w-full" aria-label="Eigen medewerker/anders" />
          </div>
        )}

        <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">
          Genomen of te nemen maatregelen om herhaling te voorkomen (optioneel)
        </label>
        <textarea
          value={maatregelen}
          onChange={(e) => setMaatregelen(e.target.value)}
          rows={2}
          className="dl-input px-3 py-2 text-sm w-full mb-3 resize-none"
          aria-label="Maatregelen"
          maxLength={500}
        />

        <label className="block text-[11px] uppercase dl-day-label opacity-60 mb-1">
          Actie leidinggevende (optioneel)
        </label>
        <textarea
          value={actieLeidinggevende}
          onChange={(e) => setActieLeidinggevende(e.target.value)}
          rows={2}
          className="dl-input px-3 py-2 text-sm w-full mb-4 resize-none"
          aria-label="Actie leidinggevende"
          maxLength={500}
        />

        <button
          onClick={submit}
          disabled={!omschrijving.trim() || saving}
          className="dl-btn-primary mg-btn-report flex items-center gap-2"
          style={{ background: "#dc2626" }}
        >
          {justSent ? <Check size={17} /> : <Send size={16} />}
          {justSent ? "Verstuurd naar quality" : saving ? "Bezig…" : "Opslaan & versturen naar quality"}
        </button>
        <p className="text-[11px] mt-2 opacity-60">
          {settings.qualityEmail
            ? "Het ingevulde formulier (1-op-1, .docx) wordt gedownload en je mail-app opent naar quality — voeg het gedownloade bestand zelf toe als bijlage voordat je verstuurt."
            : "Er is nog geen e-mailadres voor quality ingesteld (tandwiel rechtsboven) — het formulier wordt dan wel gedownload, maar niet automatisch klaargezet in een e-mail."}
        </p>
      </div>

      {/* Overzicht */}
      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : items.length === 0 ? (
        <p className="text-sm opacity-50">Nog geen meldingen. Vul hierboven in wat er is gebeurd.</p>
      ) : (
        orderedDates.map((date) => (
          <div key={date} className="mb-7">
            <div className="dl-mono text-xs uppercase dl-day-label opacity-50 mb-3">
              {formatDayLabel(date)} · {groups[date].length} {groups[date].length === 1 ? "melding" : "meldingen"}
            </div>
            <div className="flex flex-col gap-2">
              {groups[date]
                .slice()
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                .map((m) => {
                  const thumb = m.blob && urlMapRef.current.get(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => setOpenId(m.id)}
                      className="mg-item p-3 flex items-start gap-3 text-left"
                      style={{ borderLeftColor: "#dc2626" }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="rounded-lg shrink-0" style={{ width: 44, height: 44, objectFit: "cover" }} />
                      ) : (
                        <span className="mg-sev-dot shrink-0 mt-1.5" style={{ background: "#dc2626", width: 10, height: 10 }} />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="dl-mono text-xs opacity-60">{m.timeLabel}</span>
                          {m.soorten.map((k) => (
                            <span key={k} className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#dc2626" }}>
                              {typeLabel(k)}
                            </span>
                          ))}
                          {m.verstuurd && (
                            <span className="dl-badge" style={{ background: "#e2f0e8", color: "#1e7a4f" }}>
                              <Check size={10} /> verstuurd
                            </span>
                          )}
                        </span>
                        <span className="text-sm block truncate">{m.omschrijving || "(geen omschrijving)"}</span>
                        {m.locatie && <span className="text-xs opacity-55 block truncate">{m.locatie}</span>}
                      </span>
                    </button>
                  );
                })}
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
            <span className="opacity-60">Alle meldingen wissen?</span>
            <button onClick={resetAll} className="dl-btn-ghost px-2 py-1">Ja, wis alles</button>
            <button onClick={() => setConfirmReset(false)} className="dl-btn-ghost px-2 py-1">Annuleer</button>
          </div>
        ) : items.length > 0 ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 opacity-50 hover:opacity-90"
          >
            <RotateCcw size={12} /> Alles wissen
          </button>
        ) : null}
      </div>

      {/* Detail */}
      {open && (
        <div className="dl-photo-overlay" onClick={() => setOpenId(null)}>
          <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
            {open.blob && urlMapRef.current.get(open.id) && (
              <img src={urlMapRef.current.get(open.id)} alt="" className="dl-photo-modal-img mb-3" />
            )}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {open.soorten.map((k) => (
                <span key={k} className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#dc2626" }}>
                  {typeLabel(k)}
                </span>
              ))}
              <span className="dl-mono text-xs opacity-60">
                {formatShortDate(open.date)} · {open.timeLabel}
              </span>
              {open.verstuurd && (
                <span className="dl-badge" style={{ background: "#e2f0e8", color: "#1e7a4f" }}>
                  <Check size={10} /> verstuurd naar quality
                </span>
              )}
            </div>
            {open.locatie && <p className="text-xs opacity-70 mb-2">{open.locatie}</p>}
            <p className="text-sm mb-3 whitespace-pre-wrap">{open.omschrijving || "(geen omschrijving)"}</p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => downloadDocx(open)}
                  disabled={downloadingId === open.id}
                  className="dl-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5"
                >
                  <FileDown size={13} /> {downloadingId === open.id ? "Bezig…" : "Formulier (.docx)"}
                </button>
                <button
                  onClick={() => sendExisting(open)}
                  className="dl-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5"
                >
                  <Mail size={13} /> {open.verstuurd ? "Opnieuw versturen" : "Versturen naar quality"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => removeItem(open.id)}
                  className="dl-btn-ghost p-2"
                  aria-label="Verwijder melding"
                  title="Verwijder melding"
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
