import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wrench, Gauge, Droplets, Sun, Wind, Thermometer, MapPin, RefreshCw, Plus,
  Trash2, Mic, Check, ImagePlus, X, CalendarClock, Sparkles, Search, AlertTriangle,
  Camera, FileText, Paperclip,
} from "lucide-react";
import { fetchWeather } from "./cabrio.js";
import {
  DATE_LABELS, LOG_TYPES, ensureSeeded, loadCars, saveCars, loadActiveCarId,
  saveActiveCarId, daysUntil, loadLog, addLogEntry, deleteLogEntry, stepsForCar,
  loadDetailing, markStepDone, clearStep, daysSince, computeWashAdvice, addPhoto,
  getAllPhotos, deletePhoto, addDocument, getAllDocuments,
} from "./garage.js";
import { permission, requestPermission, scheduleReminder, cancelReminder } from "./notify.js";
import KmScan from "./KmScan.jsx";
import GarageInvoice from "./GarageInvoice.jsx";

// ?scan=1 opent de km-scanner meteen (bv. vanuit een Bluetooth-automatisering
// die bij het instappen deze URL opent), zonder eerst door de app te hoeven.
function scanRequested() {
  try {
    return new URLSearchParams(window.location.search).get("scan") === "1";
  } catch {
    return false;
  }
}

const REFRESH_MS = 15 * 60 * 1000; // ververs weerdata elke 15 minuten
const REMIND_DAYS_BEFORE = 14; // herinnering: 2 weken voor een vervaldatum

const TYPE_LABELS = {
  onderhoud: "Onderhoud",
  reparatie: "Reparatie",
  apk: "APK",
  overig: "Overig",
};

// Eén tik = één regel in het logboek, met de huidige km-stand erbij. Dit zijn
// de dingen die vaak terugkomen; al het andere gaat via het gewone invoerveld.
const QUICK_ACTIONS = [
  { label: "Getankt", type: "overig", text: "Getankt" },
  { label: "Olie bijgevuld", type: "onderhoud", text: "Motorolie bijgevuld" },
  { label: "Bandenspanning", type: "onderhoud", text: "Bandenspanning gecontroleerd" },
  { label: "Gewassen", type: "overig", text: "Auto gewassen" },
  { label: "Ruitensproeier", type: "onderhoud", text: "Ruitensproeiervloeistof bijgevuld" },
];

const TABS = [
  { key: "overzicht", label: "Overzicht" },
  { key: "logboek", label: "Logboek" },
  { key: "detailing", label: "Detailing" },
  { key: "fotos", label: "Foto's" },
];

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function fmtIsoDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtSince(days) {
  if (days == null) return "nog niet gedaan";
  if (days === 0) return "vandaag gedaan";
  if (days === 1) return "gisteren gedaan";
  if (days < 60) return `${days} dagen geleden`;
  return `${Math.round(days / 30)} maanden geleden`;
}

/** Plant (of annuleert) de melding voor één vervaldatum van een auto. */
async function syncDateReminder(car, key) {
  const id = `garage-${car.id}-${key}`;
  const iso = car.dates[key];
  if (!iso) {
    await cancelReminder(id);
    return;
  }
  const due = new Date(`${iso}T09:00:00`).getTime();
  const remindAt = due - REMIND_DAYS_BEFORE * 86400000;
  if (isNaN(due) || remindAt <= Date.now()) return; // te dichtbij of verstreken — badge in de UI volstaat
  await scheduleReminder({
    id,
    heading: "Garage — herinnering",
    title: `${car.name}: ${DATE_LABELS[key]} op ${fmtIsoDate(iso)}`,
    remindAt: new Date(remindAt).toISOString(),
  });
}

function DueBadge({ iso }) {
  const days = daysUntil(iso);
  if (days == null) return <span className="text-xs opacity-50">geen datum</span>;
  if (days < 0) return <span className="dl-badge dl-badge-over">{-days} dagen verlopen</span>;
  if (days === 0) return <span className="dl-badge dl-badge-over">vandaag!</span>;
  if (days <= 30) return <span className="dl-badge dl-badge-over">over {days} dagen</span>;
  return <span className="dl-badge">over {days} dagen</span>;
}

export default function Garage() {
  // Eenmalig de bekende onderhoudshistorie van de Spider inladen (uit de
  // eerdere Auto Onderhoud Tracker) vóór de state wordt geïnitialiseerd.
  const [cars, setCars] = useState(() => {
    ensureSeeded();
    return loadCars();
  });
  const [activeCarId, setActiveCarId] = useState(() => loadActiveCarId(loadCars()));
  const [tab, setTab] = useState("overzicht");
  const [log, setLog] = useState(loadLog);
  const [detailing, setDetailing] = useState(loadDetailing);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [kmDraft, setKmDraft] = useState("");
  const [scanOpen, setScanOpen] = useState(scanRequested);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scanForEntryOpen, setScanForEntryOpen] = useState(false);
  const [docs, setDocs] = useState([]);

  // Nieuw logboek-item
  const [text, setText] = useState("");
  const [entryKm, setEntryKm] = useState("");
  const [entryType, setEntryType] = useState("onderhoud");
  const [query, setQuery] = useState("");

  // Spraakinvoer (zelfde patroon als Daglog)
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef(null);
  const baseTextRef = useRef("");

  // Weer voor het wasdag-advies
  const [pos, setPos] = useState(null);
  const [weather, setWeather] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [geoError, setGeoError] = useState("");

  const fileRef = useRef(null);
  const activeCar = cars.find((c) => c.id === activeCarId) || cars[0];

  useEffect(() => {
    setKmDraft(activeCar.km != null ? String(activeCar.km) : "");
  }, [activeCarId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Spraakherkenning ----------------------------------------------------
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
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setText((baseTextRef.current + transcript).slice(0, 300));
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
    if (listening) { rec.stop(); return; }
    setSpeechError("");
    baseTextRef.current = text.trim() ? text.trim() + " " : "";
    try {
      rec.start();
      setListening(true);
    } catch (_) {
      // start() gooit als hij al draait; negeren.
    }
  };

  // -- Weer ----------------------------------------------------------------
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Locatie wordt niet ondersteund door deze browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Geef locatietoestemming voor een wasdag-advies op jouw plek."
            : "Kon je locatie niet bepalen."
        );
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 }
    );
  }, []);

  const refreshWeather = useCallback(async () => {
    if (!pos) return;
    setFetching(true);
    setFetchError("");
    try {
      setWeather(await fetchWeather(pos.lat, pos.lon));
    } catch {
      setFetchError("Kon geen weerdata ophalen voor het wasdag-advies.");
    } finally {
      setFetching(false);
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    refreshWeather();
    const t = setInterval(refreshWeather, REFRESH_MS);
    return () => clearInterval(t);
  }, [pos, refreshWeather]);

  // -- Herinneringen + foto's laden ---------------------------------------
  useEffect(() => {
    if (permission() === "granted") {
      for (const car of cars) {
        for (const key of Object.keys(DATE_LABELS)) syncDateReminder(car, key);
      }
    }
    getAllPhotos()
      .then((all) => setPhotos(all.sort((a, b) => b.timestamp - a.timestamp)))
      .catch(() => {});
    getAllDocuments()
      .then(setDocs)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Acties --------------------------------------------------------------
  const chooseCar = (id) => {
    setActiveCarId(id);
    saveActiveCarId(id);
  };

  const saveKm = () => {
    const km = kmDraft.trim() === "" ? null : Math.max(0, parseInt(kmDraft, 10) || 0);
    setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? { ...c, km } : c))));
  };

  // Een gescande km-stand is een directe aflezing (niet "hoger dan"-logica
  // zoals bij commitEntry), en komt ook als aantekening in het logboek.
  const saveScannedKm = (km) => {
    setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? { ...c, km } : c))));
    setKmDraft(String(km));
    setLog(addLogEntry({ carId: activeCar.id, text: "Km-stand gescand", km, type: "overig" }));
    setScanOpen(false);
  };

  // Vult alleen het km-veld van de aantekening die je aan het invullen bent —
  // in tegenstelling tot saveScannedKm slaat dit niets meteen op, want de
  // omschrijving en het soort moeten er nog bij vóór je op Toevoegen drukt.
  const fillEntryKmFromScan = (km) => {
    setEntryKm(String(km));
    setScanForEntryOpen(false);
  };

  // Rekening komt op haar eigen (vaak eerdere) datum in het logboek, en de
  // PDF zelf wordt gekoppeld aan die aantekening zodat 'm terug te vinden is.
  const saveInvoice = async ({ file, text, km, type, date }) => {
    const timestamp = date ? new Date(`${date}T12:00:00`).getTime() : Date.now();
    const updated = addLogEntry({ carId: activeCar.id, text, km, type, timestamp });
    setLog(updated);
    const entry = updated[0];
    if (km != null && (activeCar.km == null || km > activeCar.km)) {
      setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? { ...c, km } : c))));
      setKmDraft(String(km));
    }
    try {
      const doc = await addDocument({ file, carId: activeCar.id, entryId: entry.id, filename: file.name });
      setDocs((d) => [doc, ...d]);
    } catch {
      /* opslag vol of geblokkeerd — de logboekregel blijft wel staan */
    }
    setInvoiceOpen(false);
  };

  const openDoc = (doc) => {
    const url = URL.createObjectURL(doc.blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const changeDate = (key) => async (e) => {
    const value = e.target.value || null;
    const nextCar = { ...activeCar, dates: { ...activeCar.dates, [key]: value } };
    setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? nextCar : c))));
    if (value && permission() === "default") await requestPermission();
    syncDateReminder(nextCar, key);
  };

  /** Schrijft één regel weg en houdt de km-stand van de auto bij als die hoger is. */
  const commitEntry = ({ entryText, type, km }) => {
    setLog(addLogEntry({ carId: activeCar.id, text: entryText, km, type }));
    if (km != null && (activeCar.km == null || km > activeCar.km)) {
      setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? { ...c, km } : c))));
      setKmDraft(String(km));
    }
  };

  const submitEntry = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const km = entryKm.trim() === "" ? null : Math.max(0, parseInt(entryKm, 10) || 0);
    commitEntry({ entryText: trimmed, type: entryType, km });
    setText("");
    setEntryKm("");
  };

  // Snelknop: neemt de laatst bekende km-stand over, zodat één tik genoeg is.
  const quickAdd = (action) => commitEntry({
    entryText: action.text,
    type: action.type,
    km: activeCar.km ?? null,
  });

  const doStep = (stepId) => setDetailing(markStepDone(activeCar.id, stepId));
  const undoStep = (stepId) => setDetailing(clearStep(activeCar.id, stepId));

  const pickPhoto = () => fileRef.current?.click();

  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await addPhoto({ file, carId: activeCar.id });
      setPhotos((await getAllPhotos()).sort((a, b) => b.timestamp - a.timestamp));
    } catch {
      /* opslag vol of geblokkeerd */
    }
  };

  const removePhoto = async (id) => {
    await deletePhoto(id).catch(() => {});
    setLightbox(null);
    setPhotos((p) => p.filter((x) => x.id !== id));
  };

  // -- Afgeleide data ------------------------------------------------------
  // Op timestamp sorteren (niet op invoegvolgorde): een nagedateerde rekening
  // (factuurdatum in het verleden) moet tussen de andere aantekeningen van
  // die periode staan, niet vooraan omdat hij als laatste is toegevoegd.
  const carLog = useMemo(
    () => log.filter((e) => e.carId === activeCar.id).sort((a, b) => b.timestamp - a.timestamp),
    [log, activeCar.id]
  );
  const carPhotos = useMemo(() => photos.filter((p) => p.carId === activeCar.id), [photos, activeCar.id]);
  const docByEntry = useMemo(() => new Map(docs.map((d) => [d.entryId, d])), [docs]);
  const carDetailing = detailing[activeCar.id] || {};
  const advice = weather ? computeWashAdvice(weather.current, weather.hours) : null;

  const filteredLog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return carLog;
    return carLog.filter((e) =>
      e.text.toLowerCase().includes(q) ||
      (TYPE_LABELS[e.type] || "").toLowerCase().includes(q) ||
      String(e.km ?? "").includes(q)
    );
  }, [carLog, query]);

  // Alles wat aandacht vraagt, op één plek: verlopen/naderende datums en
  // detailing-stappen die over hun interval zijn.
  const attention = useMemo(() => {
    const items = [];
    for (const [key, label] of Object.entries(DATE_LABELS)) {
      const days = daysUntil(activeCar.dates[key]);
      if (days != null && days <= 30) {
        items.push({
          id: `date-${key}`,
          text: days < 0 ? `${label} is ${-days} dagen verlopen` : `${label} over ${days} dagen`,
          urgent: days <= 7,
        });
      }
    }
    for (const step of stepsForCar(activeCar.id)) {
      const days = daysSince(carDetailing[step.id]);
      if (days != null && days >= step.intervalDays) {
        items.push({ id: `step-${step.id}`, text: `${step.label} — toe aan een ronde`, urgent: false });
      }
    }
    return items;
  }, [activeCar, carDetailing]);

  const photoUrls = useMemo(() => {
    const map = new Map();
    for (const p of carPhotos) map.set(p.id, URL.createObjectURL(p.blob));
    return map;
  }, [carPhotos]);
  useEffect(() => () => photoUrls.forEach((url) => URL.revokeObjectURL(url)), [photoUrls]);

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {/* Auto + km-stand: altijd zichtbaar, ongeacht het tabblad */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {cars.map((c) => (
          <button
            key={c.id}
            className={`dl-qbtn ${c.id === activeCar.id ? "dl-qbtn-active" : ""}`}
            onClick={() => chooseCar(c.id)}
            aria-pressed={c.id === activeCar.id}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs opacity-70 truncate">{activeCar.fullName}</div>
        <label className="flex items-center gap-1.5 text-xs opacity-80 shrink-0">
          <Gauge size={13} />
          <input
            className="dl-input px-2 py-1 text-xs w-24 text-right"
            inputMode="numeric"
            placeholder="km-stand"
            value={kmDraft}
            onChange={(e) => setKmDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={saveKm}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Kilometerstand"
          />
          km
        </label>
        <button
          className="dl-check shrink-0"
          onClick={() => setScanOpen(true)}
          title="Km-stand scannen met de camera"
          aria-label="Km-stand scannen met de camera"
        >
          <Camera size={14} color="#52606e" />
        </button>
      </div>

      {/* Snel toevoegen — bovenaan en op elk tabblad, want dit is wat je het
          vaakst doet. Eén tik logt de regel met de huidige km-stand. */}
      <div className="dl-card p-3 mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">
          Snel toevoegen
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              className="dl-btn-ghost text-xs px-2.5 py-1.5"
              onClick={() => quickAdd(a)}
              title={`Log "${a.text}"${activeCar.km != null ? ` bij ${activeCar.km.toLocaleString("nl-NL")} km` : ""}`}
            >
              + {a.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-2.5">
          <select
            className="dl-input text-xs px-2 py-2"
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
            aria-label="Soort"
          >
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <input
            className="dl-input px-2 py-2 text-xs w-20"
            inputMode="numeric"
            placeholder="km"
            value={entryKm}
            onChange={(e) => setEntryKm(e.target.value.replace(/\D/g, ""))}
            aria-label="Kilometerstand bij dit onderhoud"
          />
          <button
            className="dl-check shrink-0"
            onClick={() => setScanForEntryOpen(true)}
            title="Km-stand fotograferen voor deze aantekening"
            aria-label="Km-stand fotograferen voor deze aantekening"
          >
            <Camera size={14} color="#52606e" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <input
            className="dl-input px-3 py-2 text-sm flex-1 min-w-0"
            placeholder="Wat is er gedaan?"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            onKeyDown={(e) => e.key === "Enter" && submitEntry()}
            aria-label="Omschrijving"
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              className={`dl-mic px-3 flex items-center justify-center shrink-0 ${listening ? "dl-mic-live" : ""}`}
              aria-label={listening ? "Stop met inspreken" : "Inspreken"}
              aria-pressed={listening}
            >
              <Mic size={16} />
            </button>
          )}
          <button
            className="dl-btn-primary px-3 py-2 flex items-center justify-center shrink-0"
            onClick={submitEntry}
            disabled={!text.trim()}
            aria-label="Toevoegen"
          >
            <Plus size={16} />
          </button>
        </div>
        {speechError && <div className="text-xs mt-1.5" style={{ color: "#b3362a" }}>{speechError}</div>}
      </div>

      {/* Tabbladen houden elk scherm kort genoeg om in één blik te overzien */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dl-qbtn text-xs ${t.key === tab ? "dl-qbtn-active" : ""}`}
            onClick={() => setTab(t.key)}
            aria-pressed={t.key === tab}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overzicht" && (
        <>
          {attention.length > 0 && (
            <div className="dl-card p-4 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Vraagt aandacht
              </div>
              <div className="flex flex-col gap-1.5">
                {attention.map((a) => (
                  <div key={a.id} className="text-sm flex items-center gap-2">
                    <span style={a.urgent ? { color: "#b3362a" } : undefined}>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {advice && (
            <div className={`cb-advice mb-2 ${advice.ok ? "cb-advice-open" : "cb-advice-closed"}`}>
              <div className="cb-advice-icon"><Droplets size={26} /></div>
              <div className="flex-1">
                <div className="dl-serif text-lg font-semibold">
                  {advice.ok ? "Prima dag om te wassen of waxen" : "Vandaag geen goede wasdag"}
                </div>
                <div className="text-sm opacity-80 mt-0.5">
                  {advice.ok ? "Droog, niet te koud en geen regen op komst." : advice.blockers.join(", ")}
                </div>
              </div>
            </div>
          )}
          {advice?.cautions.length > 0 && (
            <div className="text-xs opacity-70 mb-2 flex items-start gap-1.5">
              <Sun size={13} className="mt-0.5 flex-shrink-0" />
              <span>Let op: {advice.cautions.join("; ")}.</span>
            </div>
          )}
          {!advice && !fetchError && !geoError && (
            <div className="dl-card p-4 mb-2 text-sm opacity-70">Weer ophalen voor het wasdag-advies…</div>
          )}
          {(geoError || fetchError) && (
            <div className="text-xs mb-2" style={{ color: "#b3362a" }}>{geoError || fetchError}</div>
          )}
          {weather && (
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs opacity-60 flex items-center gap-2.5">
                <span className="flex items-center gap-1"><Thermometer size={12} />{Math.round(weather.current.temp)}°C</span>
                <span className="flex items-center gap-1"><Wind size={12} />{Math.round(weather.current.windGusts ?? weather.current.windSpeed)} km/u</span>
                <span className="flex items-center gap-1"><Sun size={12} />UV {weather.current.uvIndex != null ? weather.current.uvIndex.toFixed(1) : "–"}</span>
              </div>
              <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={refreshWeather} disabled={fetching}>
                <RefreshCw size={13} className={fetching ? "dl-spin" : ""} /> Ververs
              </button>
            </div>
          )}

          <div className="dl-card p-4 mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3 flex items-center gap-1.5">
              <CalendarClock size={13} /> Belangrijke datums
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(DATE_LABELS).map(([key, label]) => (
                <div key={key} className="dl-ag-item px-3 py-2 flex items-center gap-2">
                  <div className="text-sm font-medium flex-1">{label}</div>
                  <DueBadge iso={activeCar.dates[key]} />
                  <input
                    type="date"
                    className="dl-input px-2 py-1 text-xs"
                    value={activeCar.dates[key] || ""}
                    onChange={changeDate(key)}
                    aria-label={`Datum ${label}`}
                  />
                </div>
              ))}
            </div>
            <div className="text-xs opacity-60 mt-2">
              Je krijgt {REMIND_DAYS_BEFORE} dagen van tevoren een melding, net als bij de Agenda.
            </div>
          </div>

          {carLog.length > 0 && (
            <div className="dl-card p-4 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">Laatste aantekeningen</div>
              <div className="flex flex-col gap-2">
                {carLog.slice(0, 3).map((e) => (
                  <div key={e.id} className="text-sm">
                    <div className="truncate">{e.text}</div>
                    <div className="text-xs opacity-60">{fmtDate(e.timestamp)}</div>
                  </div>
                ))}
              </div>
              <button className="dl-btn-ghost text-xs px-3 py-1.5 mt-2" onClick={() => setTab("logboek")}>
                Hele logboek ({carLog.length})
              </button>
            </div>
          )}
        </>
      )}

      {tab === "logboek" && (
        <div className="dl-card p-4 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
            <Wrench size={13} /> Onderhoudslogboek ({carLog.length})
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex items-center gap-2 dl-input px-2 py-1.5 flex-1 min-w-0">
              <Search size={13} className="opacity-50 shrink-0" />
              <input
                className="bg-transparent border-0 outline-none text-sm flex-1 min-w-0"
                placeholder="Zoek in het logboek…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Zoeken"
              />
              {query && (
                <button className="dl-check shrink-0" onClick={() => setQuery("")} aria-label="Zoekterm wissen">
                  <X size={12} color="#52606e" />
                </button>
              )}
            </div>
            <button
              className="dl-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5 shrink-0"
              onClick={() => setInvoiceOpen(true)}
              title="Rekening (PDF) inlezen en toevoegen"
            >
              <FileText size={13} /> Rekening
            </button>
          </div>

          {filteredLog.length === 0 ? (
            <div className="text-sm opacity-60">
              {query ? `Niets gevonden voor "${query}".` : `Nog geen aantekeningen voor de ${activeCar.name}.`}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredLog.map((e) => (
                <div key={e.id} className="dl-ag-item px-3 py-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{e.text}</div>
                    <div className="text-xs opacity-60 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtDate(e.timestamp)}</span>
                      <span className="dl-badge">{TYPE_LABELS[e.type] || e.type}</span>
                      {e.km != null && <span>{e.km.toLocaleString("nl-NL")} km</span>}
                      {docByEntry.has(e.id) && (
                        <button
                          className="flex items-center gap-1 underline"
                          style={{ color: "var(--dl-accent)" }}
                          onClick={() => openDoc(docByEntry.get(e.id))}
                        >
                          <Paperclip size={11} /> Rekening
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    className="dl-check"
                    onClick={() => setLog(deleteLogEntry(e.id))}
                    title="Verwijderen"
                    aria-label="Aantekening verwijderen"
                  >
                    <Trash2 size={12} color="#52606e" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "detailing" && (
        <div className="dl-card p-4 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3 flex items-center gap-1.5">
            <Sparkles size={13} /> Detailing — jouw vaste workflow
          </div>
          <div className="flex flex-col gap-2">
            {stepsForCar(activeCar.id).map((step) => {
              const days = daysSince(carDetailing[step.id]);
              const due = days != null && days >= step.intervalDays;
              const frac = days == null ? 1 : Math.min(1, days / step.intervalDays);
              return (
                <div key={step.id} className="dl-ag-item px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{step.label}</div>
                      <div className="text-xs opacity-60">
                        {fmtSince(days)}
                        {due && days != null && " · "}
                        {due && days != null && <span style={{ color: "#b3362a" }}>toe aan een nieuwe ronde</span>}
                      </div>
                    </div>
                    {(due || days == null) && <span className="dl-badge dl-badge-over">toe aan</span>}
                    <button className="dl-btn-primary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => doStep(step.id)} title="Vandaag gedaan">
                      <Check size={13} /> Gedaan
                    </button>
                    {days != null && (
                      <button className="dl-check" onClick={() => undoStep(step.id)} title="Datum wissen" aria-label={`${step.label}: datum wissen`}>
                        <X size={13} color="#52606e" />
                      </button>
                    )}
                  </div>
                  <div className="dl-bar mt-2">
                    <div className={`dl-bar-fill ${due || days == null ? "dl-bar-fill-over" : ""}`} style={{ width: `${Math.round(frac * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs opacity-60 mt-2">
            Volgorde: insectenverwijderaar → Korrosol → klei → polijsten → wax. De balk loopt vol
            richting het advies-interval van de stap.
          </div>
        </div>
      )}

      {tab === "fotos" && (
        <div className="dl-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60 flex items-center gap-1.5">
              <ImagePlus size={13} /> Foto's — {activeCar.name}
            </div>
            <button className="dl-btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={pickPhoto}>
              <Plus size={13} /> Foto
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChosen} />
          </div>
          {carPhotos.length === 0 ? (
            <div className="text-sm opacity-60">
              Nog geen foto's. Leg poets- en restauratieresultaten vast, dan zie je de auto door
              de tijd heen opknappen.
            </div>
          ) : (
            <div className="dl-photo-grid">
              {carPhotos.map((p) => (
                <button key={p.id} className="dl-photo-thumb-wrap" onClick={() => setLightbox(p)}>
                  <img className="dl-photo-thumb" src={photoUrls.get(p.id)} alt="Autofoto" loading="lazy" />
                  <span className="dl-photo-time">{fmtDate(p.timestamp)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
        Alles wordt lokaal op dit apparaat bewaard. Het wasdag-advies gebruikt Open-Meteo
        (gratis, geen account) en kijkt naar regen, temperatuur, wind en UV op jouw locatie.
      </div>

      {scanOpen && (
        <KmScan
          carName={activeCar.name}
          onSave={saveScannedKm}
          onClose={() => setScanOpen(false)}
        />
      )}

      {invoiceOpen && (
        <GarageInvoice
          carName={activeCar.name}
          defaultKm={activeCar.km}
          onSave={saveInvoice}
          onClose={() => setInvoiceOpen(false)}
        />
      )}

      {scanForEntryOpen && (
        <KmScan
          carName={activeCar.name}
          onSave={fillEntryKmFromScan}
          onClose={() => setScanForEntryOpen(false)}
        />
      )}

      {lightbox && (
        <div className="dl-photo-overlay" onClick={() => setLightbox(null)}>
          <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img className="dl-photo-modal-img" src={photoUrls.get(lightbox.id)} alt="Autofoto" />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs opacity-70">{fmtDate(lightbox.timestamp)} · {activeCar.name}</div>
              <div className="flex gap-2">
                <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => removePhoto(lightbox.id)}>
                  Verwijderen
                </button>
                <button className="dl-btn-primary text-xs px-3 py-1.5" onClick={() => setLightbox(null)}>
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
