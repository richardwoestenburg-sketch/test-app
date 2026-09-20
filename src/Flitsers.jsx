import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  RefreshCw,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Navigation,
  MapPin,
  AlertTriangle,
  Bell,
  BellOff,
  Search,
  Gauge,
  Route,
} from "lucide-react";
import {
  loadSettings,
  saveSettings,
  loadOsmCameras,
  loadCustomCameras,
  addCustomCamera,
  removeCustomCamera,
  fetchOsmCameras,
  distanceMeters,
  bearingDegrees,
  angleDiff,
  projectOnSection,
  playAlertSound,
  vibrateAlert,
  showAlertNotification,
  KIND_LABEL,
} from "./flitsers.js";
import { permission as notifyPermission, requestPermission } from "./notify.js";

const STALE_MS = 7 * 24 * 3600 * 1000; // ververs stilletjes als cache ouder is dan een week
const FORWARD_CONE = 70; // graden — "voor je" bij bekende rijrichting
const RESET_FACTOR = 1.4; // camera telt weer als "nieuw" als je dit keer de afstand verder weg bent
const NEAR_BOX = 0.12; // graden (~13 km) — voorfilter voor trajecten rond je positie
const ON_PATH_M = 60; // hoe ver je van de route mag zitten en er nog op "rijdt"
const LOST_TICKS = 4; // zoveel GPS-updates naast de route = traject verlaten
const DONE_SHOW_MS = 90 * 1000; // hoe lang het eindresultaat van een traject blijft staan

function fmtDist(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtAgo(ts) {
  if (!ts) return "nog nooit opgehaald";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "zojuist bijgewerkt";
  if (min < 60) return `${min} min geleden bijgewerkt`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} uur geleden bijgewerkt`;
  return `${Math.round(h / 24)} dagen geleden bijgewerkt`;
}

function markerColor(kind) {
  if (kind === "section") return "#b3362a";
  if (kind === "custom") return "#1e7a4f";
  if (kind === "redlight") return "#7c3aed";
  return "#1f4e8c";
}

function camIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${markerColor(
      kind
    )};border:2px solid #ffffff;box-shadow:0 0 0 2px rgba(0,0,0,0.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1e7a4f;border:3px solid #ffffff;box-shadow:0 0 0 5px rgba(47,125,91,0.28)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function Flitsers() {
  const [settings, setSettings] = useState(loadSettings);
  const [osm, setOsm] = useState(loadOsmCameras);
  const [custom, setCustom] = useState(loadCustomCameras);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [pos, setPos] = useState(null); // { lat, lon, heading, speed, accuracy, at }
  const [geoError, setGeoError] = useState("");
  const [nearest, setNearest] = useState(null);
  const [trip, setTrip] = useState(null); // live trajectcontrole
  const [doneTrip, setDoneTrip] = useState(null); // net afgerond traject
  const [view, setView] = useState("dichtbij"); // dichtbij | trajecten
  const [query, setQuery] = useState("");

  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const meMarkerRef = useRef(null);
  const camLayerRef = useRef(null);
  const secLayerRef = useRef(null);
  const secLinesRef = useRef(new Map()); // section id -> polyline
  const centeredRef = useRef(false);
  const alertedRef = useRef(new Map()); // doel-id -> laatst gemelde afstand
  const tripRef = useRef(null);
  const lostRef = useRef(0);
  const wakeRef = useRef(null);

  const cameras = useMemo(() => [...osm.cameras, ...custom], [osm.cameras, custom]);

  // Grove omhullende per traject, zodat we bij elke GPS-update alleen de
  // trajecten in de buurt doorrekenen in plaats van alle ~honderd.
  const sectionBoxes = useMemo(
    () =>
      osm.sections.map((s) => {
        const lats = s.path.map((p) => p[0]);
        const lons = s.path.map((p) => p[1]);
        return {
          section: s,
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLon: Math.min(...lons),
          maxLon: Math.max(...lons),
        };
      }),
    [osm.sections]
  );

  // -- Kaart opzetten (eenmalig) -----------------------------------------
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: true }).setView(
      [52.1, 5.3],
      8
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap-bijdragers",
    }).addTo(map);
    secLayerRef.current = L.layerGroup().addTo(map);
    camLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // -- Camera-markers tekenen bij wijziging van de lijst ------------------
  useEffect(() => {
    const layer = camLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    cameras.forEach((c) => {
      L.marker([c.lat, c.lon], { icon: camIcon(c.kind) })
        .bindPopup(
          `${KIND_LABEL[c.kind] || "Camera"}${c.maxspeed ? ` · max ${c.maxspeed} km/u` : ""}`
        )
        .addTo(layer);
    });
  }, [cameras]);

  // -- Trajectcontroles als lijn op de kaart ------------------------------
  useEffect(() => {
    const layer = secLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    secLinesRef.current.clear();
    osm.sections.forEach((s) => {
      const line = L.polyline(s.path, {
        color: markerColor("section"),
        weight: 5,
        opacity: 0.75,
      })
        .bindPopup(
          `${s.name}<br>${(s.length / 1000).toFixed(1)} km${
            s.maxspeed ? ` · max ${s.maxspeed} km/u` : ""
          }`
        )
        .addTo(layer);
      secLinesRef.current.set(s.id, line);
    });
  }, [osm.sections]);

  // Het traject waar je nu op rijdt springt eruit. Alleen hertekenen als er
  // echt een ander traject actief wordt — niet bij elke GPS-update.
  const activeSectionId = trip ? trip.id : null;
  useEffect(() => {
    secLinesRef.current.forEach((line, id) => {
      const active = activeSectionId === id;
      line.setStyle({
        color: active ? "#ea580c" : markerColor("section"),
        weight: active ? 8 : 5,
        opacity: active ? 0.95 : 0.75,
      });
    });
  }, [activeSectionId, osm.sections]);

  // -- Ophalen van OSM-data -----------------------------------------------
  const refresh = useCallback(async () => {
    setFetching(true);
    setFetchError("");
    try {
      const data = await fetchOsmCameras();
      setOsm(data);
    } catch {
      setFetchError("Kon geen verse data ophalen — check je internetverbinding.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!osm.fetchedAt || Date.now() - osm.fetchedAt > STALE_MS) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- GPS volgen ----------------------------------------------------------
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Locatie wordt niet ondersteund door deze browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError("");
        setPos({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          heading:
            typeof p.coords.heading === "number" && !isNaN(p.coords.heading)
              ? p.coords.heading
              : null,
          speed:
            typeof p.coords.speed === "number" && !isNaN(p.coords.speed) ? p.coords.speed : null,
          accuracy: p.coords.accuracy,
          at: Date.now(),
        });
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Geef locatietoestemming om waarschuwingen te krijgen."
            : "Kon je locatie niet bepalen."
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // -- Scherm aan houden tijdens het rijden --------------------------------
  useEffect(() => {
    let released = false;
    const request = async () => {
      if (!settings.keepAwake || !("wakeLock" in navigator)) return;
      if (document.visibilityState !== "visible" || wakeRef.current) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (released) {
          lock.release().catch(() => {});
          return;
        }
        lock.addEventListener("release", () => {
          if (wakeRef.current === lock) wakeRef.current = null;
        });
        wakeRef.current = lock;
      } catch {
        /* geweigerd of niet ondersteund — dan gaat het scherm gewoon uit */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeRef.current) {
        wakeRef.current.release().catch(() => {});
        wakeRef.current = null;
      }
    };
  }, [settings.keepAwake]);

  // -- Live: positie op kaart, trajectcontrole meten, waarschuwen ----------
  useEffect(() => {
    if (!pos) return;
    const map = mapRef.current;
    if (map) {
      if (!meMarkerRef.current) {
        meMarkerRef.current = L.marker([pos.lat, pos.lon], { icon: meIcon }).addTo(map);
      } else {
        meMarkerRef.current.setLatLng([pos.lat, pos.lon]);
      }
      if (!centeredRef.current) {
        map.setView([pos.lat, pos.lon], 14);
        centeredRef.current = true;
      }
    }

    // Trajecten in de buurt — grof voorfilter op de omhullende.
    const nearSections = sectionBoxes
      .filter(
        (b) =>
          pos.lat > b.minLat - NEAR_BOX &&
          pos.lat < b.maxLat + NEAR_BOX &&
          pos.lon > b.minLon - NEAR_BOX &&
          pos.lon < b.maxLon + NEAR_BOX
      )
      .map((b) => b.section);

    // Rijd je op een traject? Neem het traject waar je het dichtst bij de
    // route zit en niet al voorbij het eind bent.
    let on = null;
    for (const s of nearSections) {
      const proj = projectOnSection(s, pos.lat, pos.lon);
      if (!proj || proj.offset > ON_PATH_M) continue;
      if (proj.along < 10 || proj.along > s.length - 10) continue;
      if (!on || proj.offset < on.proj.offset) on = { section: s, proj };
    }

    const now = pos.at || Date.now();
    let live = null;

    if (on) {
      lostRef.current = 0;
      const prev = tripRef.current;
      if (!prev || prev.id !== on.section.id) {
        // Rijrichting: uit je koers als die bekend is, anders volgen we de
        // richting van de route en corrigeren we bij de volgende update.
        const dir =
          pos.heading != null && angleDiff(pos.heading, on.section.bearing) > 90 ? -1 : 1;
        tripRef.current = {
          id: on.section.id,
          section: on.section,
          dir,
          startedAt: now,
          startAlong: on.proj.along,
          along: on.proj.along,
          // Ben je er middenin ingestapt (invoegen, of de app pas daar geopend),
          // dan klopt het gemeten gemiddelde niet over het hele traject.
          partial: dir === 1 ? on.proj.along > 250 : on.section.length - on.proj.along > 250,
        };
      } else {
        const delta = on.proj.along - prev.along;
        // Rijrichting bijstellen zodra er echt verplaatsing is gemeten.
        if (Math.abs(delta) > 60) prev.dir = delta > 0 ? 1 : -1;
        prev.along = on.proj.along;
      }

      const t = tripRef.current;
      const traveled = Math.abs(t.along - t.startAlong);
      const elapsed = Math.max(1, (now - t.startedAt) / 1000);
      const remaining = t.dir === 1 ? t.section.length - t.along : t.along;
      const limit = t.section.maxspeed;
      const avg = traveled >= 50 && elapsed >= 8 ? (traveled / elapsed) * 3.6 : null;
      // Hoe hard mag je de rest nog, om gemiddeld onder de limiet te blijven?
      let advise = null;
      if (limit) {
        const allowedTotal = ((traveled + remaining) / (limit / 3.6)) * 1.0;
        const left = allowedTotal - elapsed;
        advise = left > 5 ? Math.min(limit, (remaining / left) * 3.6) : 0;
      }
      live = {
        id: t.id,
        name: t.section.name,
        limit,
        length: t.section.length,
        traveled,
        remaining,
        elapsed,
        avg,
        advise,
        partial: t.partial,
        progress:
          t.dir === 1 ? t.along / t.section.length : 1 - t.along / t.section.length,
        over: avg != null && limit != null && avg > limit + 1,
      };
    } else if (tripRef.current) {
      // Even geen match: pas na een paar updates beschouwen we het traject als
      // verlaten (GPS-ruis, tunnel, afrit).
      lostRef.current += 1;
      if (lostRef.current >= LOST_TICKS) {
        const t = tripRef.current;
        const traveled = Math.abs(t.along - t.startAlong);
        const elapsed = Math.max(1, (now - t.startedAt) / 1000);
        if (traveled > 500) {
          setDoneTrip({
            at: now,
            name: t.section.name,
            limit: t.section.maxspeed,
            traveled,
            avg: (traveled / elapsed) * 3.6,
            partial: t.partial,
          });
        }
        tripRef.current = null;
        lostRef.current = 0;
      } else {
        live = trip; // korte onderbreking: laat het paneel staan
      }
    }
    setTrip(live);

    // -- Doelen waarvoor we waarschuwen: losse camera's + begin van trajecten
    const targets = cameras.map((c) => ({
      id: c.id,
      kind: c.kind,
      lat: c.lat,
      lon: c.lon,
      maxspeed: c.maxspeed,
      label: KIND_LABEL[c.kind] || "Camera",
    }));
    for (const s of nearSections) {
      if (live && live.id === s.id) continue; // rijd je er al op: geen naderingsmelding
      const entry = s.path[0];
      const exit = s.path[s.path.length - 1];
      const dStart = distanceMeters(pos.lat, pos.lon, entry[0], entry[1]);
      const dEnd = distanceMeters(pos.lat, pos.lon, exit[0], exit[1]);
      const p = dStart <= dEnd ? entry : exit;
      targets.push({
        id: `${s.id}:entry`,
        kind: "section",
        lat: p[0],
        lon: p[1],
        maxspeed: s.maxspeed,
        label: "Trajectcontrole",
        name: s.name,
        length: s.length,
      });
    }

    const knownHeading =
      settings.onlyAhead && pos.heading != null && (pos.speed == null || pos.speed > 2);
    let best = null;
    for (const t of targets) {
      const dist = distanceMeters(pos.lat, pos.lon, t.lat, t.lon);
      if (knownHeading) {
        const brg = bearingDegrees(pos.lat, pos.lon, t.lat, t.lon);
        if (angleDiff(brg, pos.heading) > FORWARD_CONE) continue;
      }
      if (!best || dist < best.dist) best = { ...t, dist };
    }
    setNearest(best);

    if (best && !settings.muted && best.dist <= settings.warnDistance) {
      const lastAlertDist = alertedRef.current.get(best.id);
      const isNewApproach = lastAlertDist == null || best.dist < lastAlertDist - 40;
      const hasReset = lastAlertDist != null && lastAlertDist > settings.warnDistance * RESET_FACTOR;
      if (isNewApproach || hasReset) {
        alertedRef.current.set(best.id, best.dist);
        const close = best.dist <= settings.warnDistance / 3;
        playAlertSound(close ? 2 : 1);
        vibrateAlert(close ? 2 : 1);
        if (settings.notify && document.visibilityState !== "visible") {
          showAlertNotification(
            `${best.label} over ${fmtDist(best.dist)}`,
            best.maxspeed ? `Max ${best.maxspeed} km/u` : "Let op je snelheid"
          );
        }
      }
    }
    // Camera's die weer ver weg zijn: laat ze los zodat een volgende nadering weer meldt.
    for (const [id, d] of alertedRef.current) {
      if (!best || id !== best.id) {
        if (d < settings.warnDistance * RESET_FACTOR) continue;
        alertedRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, cameras, sectionBoxes, settings.warnDistance, settings.muted, settings.onlyAhead, settings.notify]);

  // Te hard gemiddeld op een traject: één keer per traject een duidelijk signaal.
  const overWarnedRef = useRef(null);
  useEffect(() => {
    if (!trip || !trip.over || settings.muted) return;
    if (overWarnedRef.current === trip.id) return;
    overWarnedRef.current = trip.id;
    playAlertSound(3);
    vibrateAlert(3);
    if (settings.notify && document.visibilityState !== "visible") {
      showAlertNotification(
        "Te hard op de trajectcontrole",
        `Gemiddeld ${Math.round(trip.avg)} km/u — max ${trip.limit} km/u`
      );
    }
  }, [trip, settings.muted, settings.notify]);

  // Het eindresultaat van een traject verdwijnt vanzelf weer.
  useEffect(() => {
    if (!doneTrip) return;
    const timer = setTimeout(() => setDoneTrip(null), DONE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [doneTrip]);

  const nearby = useMemo(() => {
    if (!pos) return [];
    const list = cameras.map((c) => ({
      key: c.id,
      id: c.id,
      kind: c.kind,
      label: KIND_LABEL[c.kind] || "Camera",
      maxspeed: c.maxspeed,
      dist: distanceMeters(pos.lat, pos.lon, c.lat, c.lon),
      removable: c.kind === "custom",
    }));
    for (const s of osm.sections) {
      const entry = s.path[0];
      const exit = s.path[s.path.length - 1];
      const dist = Math.min(
        distanceMeters(pos.lat, pos.lon, entry[0], entry[1]),
        distanceMeters(pos.lat, pos.lon, exit[0], exit[1])
      );
      list.push({
        key: s.id,
        id: s.id,
        kind: "section",
        label: "Trajectcontrole",
        name: s.name,
        length: s.length,
        maxspeed: s.maxspeed,
        dist,
      });
    }
    return list.sort((a, b) => a.dist - b.dist).slice(0, 8);
  }, [pos, cameras, osm.sections]);

  const allSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return osm.sections
      .map((s) => ({
        ...s,
        dist: pos ? distanceMeters(pos.lat, pos.lon, s.path[0][0], s.path[0][1]) : null,
      }))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.maxspeed || "").includes(q))
      .sort((a, b) => (a.dist != null && b.dist != null ? a.dist - b.dist : a.name.localeCompare(b.name)));
  }, [osm.sections, query, pos]);

  const showOnMap = (section) => {
    const map = mapRef.current;
    if (!map) return;
    centeredRef.current = true; // niet meer automatisch terugspringen naar je positie
    map.fitBounds(L.latLngBounds(section.path), { padding: [30, 30] });
    setView("dichtbij");
    mapDivRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const addHere = () => {
    if (!pos) return;
    setCustom(addCustomCamera(pos.lat, pos.lon));
  };

  const removeHere = (id) => setCustom(removeCustomCamera(id));

  const toggleMuted = () => setSettings(saveSettings({ muted: !settings.muted }));
  const changeDistance = (e) => setSettings(saveSettings({ warnDistance: Number(e.target.value) }));

  const toggleNotify = async () => {
    if (settings.notify) {
      setSettings(saveSettings({ notify: false }));
      return;
    }
    let state = notifyPermission();
    if (state !== "granted") state = await requestPermission();
    setSettings(saveSettings({ notify: state === "granted" }));
  };

  const speedKmh = pos && pos.speed != null ? Math.max(0, pos.speed * 3.6) : null;
  const alerting = nearest && !settings.muted && nearest.dist <= settings.warnDistance;

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {alerting && (
        <div
          className={`fl-alert mb-3 ${nearest.dist <= settings.warnDistance / 3 ? "fl-alert-close" : ""}`}
        >
          <AlertTriangle size={18} />
          <div>
            <div className="font-semibold">
              {nearest.kind === "section" ? nearest.name || "Trajectcontrole" : nearest.label}
            </div>
            <div className="dl-mono text-sm opacity-80">
              over {fmtDist(nearest.dist)}
              {nearest.maxspeed ? ` · max ${nearest.maxspeed} km/u` : ""}
              {nearest.kind === "section" && nearest.length
                ? ` · ${(nearest.length / 1000).toFixed(1)} km lang`
                : ""}
            </div>
          </div>
        </div>
      )}

      {/* Live trajectcontrole: gemiddelde snelheid over het stuk dat je rijdt. */}
      {trip && (
        <div className={`fl-live mb-3 ${trip.over ? "fl-live-over" : ""}`}>
          <div className="fl-live-head">
            <Route size={15} />
            <span className="font-semibold">{trip.name}</span>
            {trip.limit ? <span className="fl-live-limit">max {trip.limit}</span> : null}
          </div>
          <div className="fl-live-row">
            <div>
              <div className="fl-live-big dl-mono">
                {trip.avg != null ? Math.round(trip.avg) : "–"}
                <span className="fl-live-unit">km/u gem.</span>
              </div>
              <div className="text-xs opacity-80">
                {trip.avg == null
                  ? "meten…"
                  : trip.over
                  ? "te hard — laat het gemiddelde zakken"
                  : "binnen de limiet"}
              </div>
            </div>
            <div className="fl-live-side text-xs opacity-90 dl-mono">
              <div>nog {fmtDist(trip.remaining)}</div>
              {trip.advise != null && (
                <div>rest max {Math.round(trip.advise)} km/u</div>
              )}
            </div>
          </div>
          <div className="fl-live-bar">
            <span style={{ width: `${Math.round(Math.max(0, Math.min(1, trip.progress)) * 100)}%` }} />
          </div>
          {trip.partial && (
            <div className="text-xs opacity-75 mt-1">
              Je bent halverwege ingestapt — het gemiddelde telt vanaf daar, niet over het hele traject.
            </div>
          )}
        </div>
      )}

      {doneTrip && !trip && (
        <div className="fl-done mb-3">
          <Route size={14} />
          <span>
            {doneTrip.name} afgerond — gemiddeld{" "}
            <b className="dl-mono">{Math.round(doneTrip.avg)} km/u</b>
            {doneTrip.limit ? ` (max ${doneTrip.limit})` : ""}
            {doneTrip.partial ? ", gemeten vanaf je instappunt" : ""}
          </span>
        </div>
      )}

      {/* Live snelheid + status van de GPS-stroom. */}
      <div className="fl-status mb-3">
        <span className={`fl-dot ${pos ? "fl-dot-live" : ""}`} />
        <span className="text-xs opacity-70">
          {pos ? "live" : geoError ? "geen locatie" : "locatie zoeken…"}
        </span>
        {speedKmh != null && (
          <span className="fl-speed dl-mono">
            <Gauge size={13} /> {Math.round(speedKmh)} km/u
          </span>
        )}
        <button
          className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 ml-auto"
          onClick={refresh}
          disabled={fetching}
        >
          <RefreshCw size={13} className={fetching ? "dl-spin" : ""} />
          Ververs
        </button>
      </div>

      <div className="text-xs opacity-70 mb-2">
        {osm.cameras.length + custom.length} camera's · {osm.sections.length} trajectcontroles ·{" "}
        {fmtAgo(osm.fetchedAt)}
      </div>
      {fetchError && <div className="text-xs mb-2" style={{ color: "#b3362a" }}>{fetchError}</div>}
      {geoError && (
        <div className="text-xs mb-2" style={{ color: "#b3362a" }}>
          {geoError}
        </div>
      )}

      <div className="fl-map-wrap mb-3">
        <div ref={mapDivRef} className="fl-map" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="dl-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5" onClick={toggleMuted}>
          {settings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {settings.muted ? "Geluid uit" : "Geluid aan"}
        </button>
        <button className="dl-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5" onClick={toggleNotify}>
          {settings.notify ? <Bell size={14} /> : <BellOff size={14} />}
          {settings.notify ? "Meldingen aan" : "Meldingen uit"}
        </button>
        <select
          className="dl-input text-xs px-2 py-2"
          value={settings.warnDistance}
          onChange={changeDistance}
        >
          <option value={300}>Waarschuw op 300 m</option>
          <option value={600}>Waarschuw op 600 m</option>
          <option value={1000}>Waarschuw op 1 km</option>
          <option value={1500}>Waarschuw op 1,5 km</option>
        </select>
        <button
          className="dl-btn-primary text-xs px-3 py-2 flex items-center gap-1.5 ml-auto"
          onClick={addHere}
          disabled={!pos}
        >
          <Plus size={14} /> Camera hier
        </button>
      </div>

      <div className="fl-tabs mb-3">
        <button
          className={`fl-tab ${view === "dichtbij" ? "fl-tab-on" : ""}`}
          onClick={() => setView("dichtbij")}
        >
          Dichtbij
        </button>
        <button
          className={`fl-tab ${view === "trajecten" ? "fl-tab-on" : ""}`}
          onClick={() => setView("trajecten")}
        >
          Alle trajectcontroles
        </button>
      </div>

      {view === "dichtbij" ? (
        <div className="dl-card p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
            <Navigation size={13} /> In de buurt
          </div>
          {!pos && <div className="text-sm opacity-70">Wachten op je locatie…</div>}
          {pos && nearby.length === 0 && (
            <div className="text-sm opacity-70">Geen camera's of trajecten in de buurt.</div>
          )}
          <div className="flex flex-col gap-2">
            {nearby.map((c) => (
              <div key={c.key} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: markerColor(c.kind),
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span className="truncate">
                    {c.kind === "section" ? c.name || "Trajectcontrole" : c.label}
                    {c.maxspeed ? ` · max ${c.maxspeed}` : ""}
                    {c.kind === "section" && c.length ? ` · ${(c.length / 1000).toFixed(1)} km` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="dl-mono opacity-70">{fmtDist(c.dist)}</span>
                  {c.removable && (
                    <button onClick={() => removeHere(c.id)} className="opacity-60 hover:opacity-100">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="dl-card p-4 mb-4">
          <div className="fl-search mb-3">
            <Search size={14} className="opacity-50" />
            <input
              className="dl-input text-sm flex-1 px-2 py-1.5"
              placeholder="Zoek op weg of snelheid…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {allSections.length === 0 && (
            <div className="text-sm opacity-70">
              {osm.sections.length === 0
                ? "Nog geen trajectcontroles geladen — tik op Ververs."
                : "Geen traject gevonden."}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {allSections.map((s) => (
              <button key={s.id} className="fl-sec-row" onClick={() => showOnMap(s)}>
                <div className="min-w-0">
                  <div className="text-sm truncate">{s.name}</div>
                  <div className="text-xs opacity-60 dl-mono">
                    {(s.length / 1000).toFixed(1)} km · richting {s.direction}
                    {s.maxspeed ? ` · max ${s.maxspeed} km/u` : ""}
                  </div>
                </div>
                {s.dist != null && (
                  <span className="dl-mono text-xs opacity-70 flex-shrink-0">{fmtDist(s.dist)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
        Flitspalen en trajectcontroles komen van OpenStreetMap (gratis, community-onderhouden);
        mobiele controles staan er niet in. De gemeten gemiddelde snelheid is je eigen GPS-meting
        en niet die van de handhaving. Houd je aan de maximumsnelheid, ongeacht wat deze app zegt.
      </div>
    </div>
  );
}
