import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  MapPin,
  Thermometer,
  Wind,
  Droplets,
  Sun,
  CloudSun,
  Cloudy,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
} from "lucide-react";
import {
  loadSettings,
  saveSettings,
  fetchWeather,
  reverseGeocode,
  weatherCodeInfo,
  computeAdvice,
} from "./cabrio.js";

const REFRESH_MS = 15 * 60 * 1000; // ververs weerdata elke 15 minuten

const WEATHER_ICONS = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloudy: Cloudy,
  cloud: Cloud,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  "cloud-rain-wind": CloudRainWind,
  "cloud-snow": CloudSnow,
  "cloud-lightning": CloudLightning,
};

function WeatherIcon({ code, size = 18 }) {
  const [, iconKey] = weatherCodeInfo(code);
  const Icon = WEATHER_ICONS[iconKey] || Cloud;
  return <Icon size={size} />;
}

function fmtHour(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function fmtAgo(ts) {
  if (!ts) return "nog niet opgehaald";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "zojuist opgehaald";
  if (min < 60) return `${min} min geleden opgehaald`;
  const h = Math.round(min / 60);
  return `${h} uur geleden opgehaald`;
}

export default function Cabrio() {
  const [settings, setSettings] = useState(loadSettings);
  const [pos, setPos] = useState(null);
  const [place, setPlace] = useState("");
  const [geoError, setGeoError] = useState("");
  const [weather, setWeather] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const intervalRef = useRef(null);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Locatie wordt niet ondersteund door deze browser.");
      return;
    }
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Geef locatietoestemming voor een weeradvies op jouw plek."
            : "Kon je locatie niet bepalen."
        );
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  useEffect(() => {
    if (!pos) return;
    const controller = new AbortController();
    reverseGeocode(pos.lat, pos.lon, { signal: controller.signal })
      .then((city) => city && setPlace(city))
      .catch(() => {});
    return () => controller.abort();
  }, [pos]);

  const refresh = useCallback(async () => {
    if (!pos) return;
    setFetching(true);
    setFetchError("");
    try {
      const data = await fetchWeather(pos.lat, pos.lon);
      setWeather(data);
    } catch (e) {
      setFetchError("Kon geen actuele weerdata ophalen — check je internetverbinding.");
    } finally {
      setFetching(false);
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!pos) return;
    intervalRef.current = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [pos, refresh]);

  const changeSetting = (key) => (e) => setSettings(saveSettings({ [key]: Number(e.target.value) }));

  const current = weather?.current;
  const advice = current ? computeAdvice(current, settings) : null;
  const [weatherLabel] = current ? weatherCodeInfo(current.weatherCode) : [""];

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs opacity-70 flex items-center gap-1.5">
          <MapPin size={12} />
          {place || (pos ? `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` : "locatie onbekend")}
          {weather && <> · {fmtAgo(weather.fetchedAt)}</>}
        </div>
        <button
          className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
          onClick={() => {
            locate();
            refresh();
          }}
          disabled={fetching}
        >
          <RefreshCw size={13} className={fetching ? "dl-spin" : ""} />
          Ververs
        </button>
      </div>
      {geoError && (
        <div className="text-xs mb-2" style={{ color: "#b3362a" }}>
          {geoError}
        </div>
      )}
      {fetchError && <div className="text-xs mb-2" style={{ color: "#b3362a" }}>{fetchError}</div>}

      {advice && (
        <div className={`cb-advice mb-4 ${advice.ok ? "cb-advice-open" : "cb-advice-closed"}`}>
          <div className="cb-advice-icon">
            <WeatherIcon code={current.weatherCode} size={30} />
          </div>
          <div className="flex-1">
            <div className="dl-serif text-lg font-semibold">
              {advice.ok ? "Kap open kan prima!" : "Beter de kap dicht laten"}
            </div>
            <div className="text-sm opacity-80 mt-0.5">
              {weatherLabel} · {Math.round(current.temp)}°C
              {advice.ok
                ? " · temperatuur, wind en regenkans zitten binnen jouw grenzen"
                : ` · ${advice.reasons.join(", ")}`}
            </div>
          </div>
        </div>
      )}
      {!advice && !fetchError && (
        <div className="dl-card p-4 mb-4 text-sm opacity-70">Weergegevens ophalen…</div>
      )}

      {current && (
        <div className="cb-stats mb-4">
          <div className="cb-stat">
            <Thermometer size={15} />
            <div>
              <div className="cb-stat-value">{Math.round(current.temp)}°C</div>
              <div className="cb-stat-label">temperatuur</div>
            </div>
          </div>
          <div className="cb-stat">
            <Wind size={15} />
            <div>
              <div className="cb-stat-value">{Math.round(current.windGusts ?? current.windSpeed)} km/u</div>
              <div className="cb-stat-label">windstoten</div>
            </div>
          </div>
          <div className="cb-stat">
            <Droplets size={15} />
            <div>
              <div className="cb-stat-value">
                {current.precipChance != null ? `${Math.round(current.precipChance)}%` : "–"}
              </div>
              <div className="cb-stat-label">regenkans</div>
            </div>
          </div>
          <div className="cb-stat">
            <Sun size={15} />
            <div>
              <div className="cb-stat-value">{current.uvIndex != null ? current.uvIndex.toFixed(1) : "–"}</div>
              <div className="cb-stat-label">UV-index</div>
            </div>
          </div>
        </div>
      )}

      {weather?.hours?.length > 0 && (
        <div className="dl-card p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3">
            Vandaag, uur voor uur
          </div>
          <div className="cb-hours">
            {weather.hours.map((h) => {
              const hAdvice = computeAdvice(h, settings);
              return (
                <div key={h.time} className={`cb-hour ${hAdvice.ok ? "cb-hour-open" : ""}`}>
                  <div className="cb-hour-time">{fmtHour(h.time)}</div>
                  <WeatherIcon code={h.weatherCode} size={17} />
                  <div className="cb-hour-temp">{Math.round(h.temp)}°</div>
                  <div className="cb-hour-dot" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dl-card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3">Jouw grenzen</div>
        <div className="flex flex-wrap gap-2">
          <select className="dl-input text-xs px-2 py-2" value={settings.minTemp} onChange={changeSetting("minTemp")}>
            {[14, 16, 18, 20, 22, 24].map((v) => (
              <option key={v} value={v}>
                min. {v}°C
              </option>
            ))}
          </select>
          <select className="dl-input text-xs px-2 py-2" value={settings.maxWind} onChange={changeSetting("maxWind")}>
            {[20, 25, 30, 40, 50].map((v) => (
              <option key={v} value={v}>
                max. {v} km/u wind
              </option>
            ))}
          </select>
          <select
            className="dl-input text-xs px-2 py-2"
            value={settings.maxRainChance}
            onChange={changeSetting("maxRainChance")}
          >
            {[10, 20, 30, 50].map((v) => (
              <option key={v} value={v}>
                max. {v}% regenkans
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
        Weerdata komt van Open-Meteo (gratis, geen account) en ververst automatisch
        elke 15 minuten. Een voorspelling blijft een inschatting — vertrouw bij twijfel
        op wat je buiten ziet.
      </div>
    </div>
  );
}
