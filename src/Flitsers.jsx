import React, { useEffect, useRef, useState, useCallback } from "react";
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
  playAlertSound,
  vibrateAlert,
  KIND_LABEL,
} from "./flitsers.js";

const STALE_MS = 14 * 24 * 3600 * 1000; // ververs stilletjes als cache ouder is dan 14 dagen
const FORWARD_CONE = 70; // graden — "voor je" bij bekende rijrichting
const RESET_FACTOR = 1.4; // camera telt weer als "nieuw" als je dit keer de afstand verder weg bent

function fmtDist(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtAgo(ts) {
  if (!ts) return "nog nooit opgehaald";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "zojuist opgehaald";
  if (min < 60) return `${min} min geleden opgehaald`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} uur geleden opgehaald`;
  return `${Math.round(h / 24)} dagen geleden opgehaald`;
}

function markerColor(kind) {
  if (kind === "section") return "#b3362a";
  if (kind === "custom") return "#1e7a4f";
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
  const [pos, setPos] = useState(null); // { lat, lon, heading, speed, accuracy }
  const [geoError, setGeoError] = useState("");
  const [nearest, setNearest] = useState(null);

  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const meMarkerRef = useRef(null);
  const camLayerRef = useRef(null);
  const centeredRef = useRef(false);
  const alertedRef = useRef(new Map()); // camera id -> laatst gemelde afstand

  const cameras = [...osm.cameras, ...custom];

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
  }, [osm.cameras, custom]);

  // -- Ophalen van OSM-data -----------------------------------------------
  const refresh = useCallback(async () => {
    setFetching(true);
    setFetchError("");
    try {
      const data = await fetchOsmCameras();
      setOsm(data);
    } catch (e) {
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
          heading: typeof p.coords.heading === "number" && !isNaN(p.coords.heading) ? p.coords.heading : null,
          speed: typeof p.coords.speed === "number" && !isNaN(p.coords.speed) ? p.coords.speed : null,
          accuracy: p.coords.accuracy,
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

  // -- Kaart bijwerken + dichtstbijzijnde camera bepalen -------------------
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

    const knownHeading = settings.onlyAhead && pos.heading != null && (pos.speed == null || pos.speed > 2);
    let best = null;
    for (const c of cameras) {
      const dist = distanceMeters(pos.lat, pos.lon, c.lat, c.lon);
      if (knownHeading) {
        const brg = bearingDegrees(pos.lat, pos.lon, c.lat, c.lon);
        if (angleDiff(brg, pos.heading) > FORWARD_CONE) continue;
      }
      if (!best || dist < best.dist) best = { ...c, dist };
    }
    setNearest(best);

    if (best && !settings.muted && best.dist <= settings.warnDistance) {
      const lastAlertDist = alertedRef.current.get(best.id);
      const isNewApproach = lastAlertDist == null || best.dist < lastAlertDist - 40;
      const hasReset = lastAlertDist != null && lastAlertDist > settings.warnDistance * RESET_FACTOR;
      if (isNewApproach || hasReset) {
        alertedRef.current.set(best.id, best.dist);
        playAlertSound(best.dist <= settings.warnDistance / 3 ? 2 : 1);
        vibrateAlert(best.dist <= settings.warnDistance / 3 ? 2 : 1);
      }
    }
    // Cameras die weer ver weg zijn: laat ze los zodat een volgende nadering weer meldt.
    for (const [id, d] of alertedRef.current) {
      if (!best || id !== best.id) {
        if (d < settings.warnDistance * RESET_FACTOR) continue;
        alertedRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, osm.cameras, custom, settings.warnDistance, settings.muted, settings.onlyAhead]);

  const nearby = pos
    ? cameras
        .map((c) => ({ ...c, dist: distanceMeters(pos.lat, pos.lon, c.lat, c.lon) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6)
    : [];

  const addHere = () => {
    if (!pos) return;
    setCustom(addCustomCamera(pos.lat, pos.lon));
  };

  const removeHere = (id) => setCustom(removeCustomCamera(id));

  const toggleMuted = () => setSettings(saveSettings({ muted: !settings.muted }));
  const changeDistance = (e) => setSettings(saveSettings({ warnDistance: Number(e.target.value) }));

  const alerting = nearest && !settings.muted && nearest.dist <= settings.warnDistance;

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {alerting && (
        <div
          className={`fl-alert mb-3 ${nearest.dist <= settings.warnDistance / 3 ? "fl-alert-close" : ""}`}
        >
          <AlertTriangle size={18} />
          <div>
            <div className="font-semibold">{KIND_LABEL[nearest.kind] || "Camera"}</div>
            <div className="dl-mono text-sm opacity-80">
              over {fmtDist(nearest.dist)}
              {nearest.maxspeed ? ` · max ${nearest.maxspeed} km/u` : ""}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs opacity-70">
          {osm.cameras.length + custom.length} camera's geladen · {fmtAgo(osm.fetchedAt)}
        </div>
        <button
          className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
          onClick={refresh}
          disabled={fetching}
        >
          <RefreshCw size={13} className={fetching ? "dl-spin" : ""} />
          Ververs
        </button>
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

      <div className="flex items-center gap-2 mb-4">
        <button className="dl-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5" onClick={toggleMuted}>
          {settings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {settings.muted ? "Geluid uit" : "Geluid aan"}
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
          <Plus size={14} /> Camera hier toevoegen
        </button>
      </div>

      <div className="dl-card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
          <Navigation size={13} /> Dichtstbijzijnde camera's
        </div>
        {!pos && <div className="text-sm opacity-70">Wachten op je locatie…</div>}
        {pos && nearby.length === 0 && <div className="text-sm opacity-70">Geen camera's in de buurt.</div>}
        <div className="flex flex-col gap-2">
          {nearby.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: markerColor(c.kind),
                    display: "inline-block",
                  }}
                />
                {KIND_LABEL[c.kind] || "Camera"}
                {c.maxspeed ? ` · max ${c.maxspeed}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <span className="dl-mono opacity-70">{fmtDist(c.dist)}</span>
                {c.kind === "custom" && (
                  <button onClick={() => removeHere(c.id)} className="opacity-60 hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
        Camera-data komt van OpenStreetMap (gratis, community-onderhouden) en is niet
        gegarandeerd compleet of actueel. Houd je aan de maximumsnelheid ongeacht deze
        waarschuwingen.
      </div>
    </div>
  );
}
