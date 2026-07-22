import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wrench,
  Gauge,
  Droplets,
  Sun,
  Wind,
  Thermometer,
  MapPin,
  RefreshCw,
  Plus,
  Trash2,
  Mic,
  Check,
  ImagePlus,
  X,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { fetchWeather } from "./cabrio.js";
import {
  DATE_LABELS,
  LOG_TYPES,
  loadCars,
  saveCars,
  loadActiveCarId,
  saveActiveCarId,
  daysUntil,
  loadLog,
  addLogEntry,
  deleteLogEntry,
  stepsForCar,
  loadDetailing,
  markStepDone,
  clearStep,
  daysSince,
  computeWashAdvice,
  addPhoto,
  getAllPhotos,
  deletePhoto,
} from "./garage.js";
import { permission, requestPermission, scheduleReminder, cancelReminder } from "./notify.js";

const REFRESH_MS = 15 * 60 * 1000; // ververs weerdata elke 15 minuten
const REMIND_DAYS_BEFORE = 14; // herinnering: 2 weken voor een vervaldatum

const TYPE_LABELS = {
  onderhoud: "Onderhoud",
  reparatie: "Reparatie",
  apk: "APK",
  overig: "Overig",
};

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

// Plant (of annuleert) de melding voor één vervaldatum van een auto.
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
  const [cars, setCars] = useState(loadCars);
  const [activeCarId, setActiveCarId] = useState(() => loadActiveCarId(loadCars()));
  const [log, setLog] = useState(loadLog);
  const [detailing, setDetailing] = useState(loadDetailing);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null); // foto-entry of null
  const [kmDraft, setKmDraft] = useState("");

  // Nieuw logboek-item
  const [text, setText] = useState("");
  const [entryKm, setEntryKm] = useState("");
  const [entryType, setEntryType] = useState("onderhoud");

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
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
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

  const changeDate = (key) => async (e) => {
    const value = e.target.value || null;
    const nextCar = { ...activeCar, dates: { ...activeCar.dates, [key]: value } };
    setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? nextCar : c))));
    if (value && permission() === "default") await requestPermission();
    syncDateReminder(nextCar, key);
  };

  const submitEntry = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const km = entryKm.trim() === "" ? null : Math.max(0, parseInt(entryKm, 10) || 0);
    setLog(addLogEntry({ carId: activeCar.id, text: trimmed, km, type: entryType }));
    if (km != null && (activeCar.km == null || km > activeCar.km)) {
      setCars(saveCars(cars.map((c) => (c.id === activeCar.id ? { ...c, km } : c))));
      setKmDraft(String(km));
    }
    setText("");
    setEntryKm("");
  };

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
  const carLog = useMemo(() => log.filter((e) => e.carId === activeCar.id), [log, activeCar.id]);
  const carPhotos = useMemo(() => photos.filter((p) => p.carId === activeCar.id), [photos, activeCar.id]);
  const carDetailing = detailing[activeCar.id] || {};
  const advice = weather ? computeWashAdvice(weather.current, weather.hours) : null;

  const photoUrls = useMemo(() => {
    const map = new Map();
    for (const p of carPhotos) map.set(p.id, URL.createObjectURL(p.blob));
    return map;
  }, [carPhotos]);
  useEffect(() => () => photoUrls.forEach((url) => URL.revokeObjectURL(url)), [photoUrls]);

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {/* Auto-switcher */}
      <div className="grid grid-cols-2 gap-2 mb-4">
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

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="text-xs opacity-70">{activeCar.fullName}</div>
        <label className="flex items-center gap-1.5 text-xs opacity-80">
          <Gauge size={13} />
          <input
            className="dl-input px-2 py-1 text-xs w-24 text-right"
            style={{ background: "rgba(237,230,208,0.08)", color: "#ede6d0", borderColor: "rgba(237,230,208,0.25)" }}
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
      </div>

      {/* Wasdag-advies */}
      {advice && (
        <div className={`cb-advice mb-2 ${advice.ok ? "cb-advice-open" : "cb-advice-closed"}`}>
          <div className="cb-advice-icon">
            <Droplets size={26} />
          </div>
          <div className="flex-1">
            <div className="dl-serif text-lg font-semibold">
              {advice.ok ? "Prima dag om te wassen of waxen" : "Vandaag geen goede wasdag"}
            </div>
            <div className="text-sm opacity-80 mt-0.5">
              {advice.ok
                ? "Droog, niet te koud en geen regen op komst."
                : advice.blockers.join(", ")}
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
        <div className="text-xs mb-2" style={{ color: "#e0a27a" }}>{geoError || fetchError}</div>
      )}
      {weather && (
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="text-xs opacity-60 flex items-center gap-2.5">
            <span className="flex items-center gap-1"><Thermometer size={12} />{Math.round(weather.current.temp)}°C</span>
            <span className="flex items-center gap-1"><Wind size={12} />{Math.round(weather.current.windGusts ?? weather.current.windSpeed)} km/u</span>
            <span className="flex items-center gap-1"><Sun size={12} />UV {weather.current.uvIndex != null ? weather.current.uvIndex.toFixed(1) : "–"}</span>
          </div>
          <button
            className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            onClick={refreshWeather}
            disabled={fetching}
          >
            <RefreshCw size={13} className={fetching ? "dl-spin" : ""} />
            Ververs
          </button>
        </div>
      )}

      {/* Belangrijke datums */}
      <div className="dl-card p-4 mb-4">
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

      {/* Detailing */}
      <div className="dl-card p-4 mb-4">
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
                      {due && days != null && <span style={{ color: "#8a3b1f" }}>toe aan een nieuwe ronde</span>}
                    </div>
                  </div>
                  {(due || days == null) && <span className="dl-badge dl-badge-over">toe aan</span>}
                  <button
                    className="dl-btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                    onClick={() => doStep(step.id)}
                    title="Vandaag gedaan"
                  >
                    <Check size={13} /> Gedaan
                  </button>
                  {days != null && (
                    <button
                      className="dl-check"
                      onClick={() => undoStep(step.id)}
                      title="Datum wissen"
                      aria-label={`${step.label}: datum wissen`}
                    >
                      <X size={13} color="#241d10" />
                    </button>
                  )}
                </div>
                <div className="dl-bar mt-2">
                  <div
                    className={`dl-bar-fill ${due || days == null ? "dl-bar-fill-over" : ""}`}
                    style={{ width: `${Math.round(frac * 100)}%` }}
                  />
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

      {/* Onderhoudslogboek */}
      <div className="dl-card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3 flex items-center gap-1.5">
          <Wrench size={13} /> Onderhoudslogboek
        </div>
        <div className="flex gap-2 mb-2">
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
            className="dl-input px-2 py-2 text-xs w-24"
            inputMode="numeric"
            placeholder="km-stand"
            value={entryKm}
            onChange={(e) => setEntryKm(e.target.value.replace(/\D/g, ""))}
            aria-label="Kilometerstand bij dit onderhoud"
          />
        </div>
        <div className="flex gap-2">
          <input
            className="dl-input px-3 py-2 text-sm flex-1"
            placeholder="Wat is er gedaan? (bv. olie ververst, 10W-60)"
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
              title={listening ? "Stop met inspreken" : "Inspreken"}
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
        {speechError && <div className="text-xs mt-1.5" style={{ color: "#8a3b1f" }}>{speechError}</div>}

        {carLog.length === 0 ? (
          <div className="text-sm opacity-60 mt-3">
            Nog geen aantekeningen voor de {activeCar.name}. Alles wat je hier logt is straks
            de onderhoudshistorie van de auto.
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {carLog.map((e) => (
              <div key={e.id} className="dl-ag-item px-3 py-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{e.text}</div>
                  <div className="text-xs opacity-60 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{fmtDate(e.timestamp)}</span>
                    <span className="dl-badge">{TYPE_LABELS[e.type] || e.type}</span>
                    {e.km != null && <span>{e.km.toLocaleString("nl-NL")} km</span>}
                  </div>
                </div>
                <button
                  className="dl-check"
                  onClick={() => setLog(deleteLogEntry(e.id))}
                  title="Verwijderen"
                  aria-label="Aantekening verwijderen"
                >
                  <Trash2 size={12} color="#241d10" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Foto's */}
      <div className="dl-card p-4 mb-4">
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

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
        Alles wordt lokaal op dit apparaat bewaard. Het wasdag-advies gebruikt Open-Meteo
        (gratis, geen account) en kijkt naar regen, temperatuur, wind en UV op jouw locatie.
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="dl-photo-overlay" onClick={() => setLightbox(null)}>
          <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img className="dl-photo-modal-img" src={photoUrls.get(lightbox.id)} alt="Autofoto" />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs opacity-70">{fmtDate(lightbox.timestamp)} · {activeCar.name}</div>
              <div className="flex gap-2">
                <button
                  className="dl-btn-ghost text-xs px-3 py-1.5"
                  style={{ borderColor: "rgba(36,29,16,0.3)", color: "#241d10" }}
                  onClick={() => removePhoto(lightbox.id)}
                >
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
