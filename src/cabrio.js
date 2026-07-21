// Cabrio: weeradvies voor kap open/dicht.
//
// Live data van Open-Meteo (gratis, geen API-key, geen account) — actuele
// waarden plus een uurverwachting voor vandaag. Er wordt niets bewaard
// behalve je eigen drempelwaarden (lokaal, localStorage).

const KEY_SETTINGS = "cabrio-settings-v1";

const DEFAULT_SETTINGS = {
  minTemp: 18, // °C — vanaf hier is het warm genoeg voor open dak
  maxWind: 30, // km/u windstoten — hierboven wordt het te winderig
  maxRainChance: 20, // % regenkans die je nog accepteert
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* opslag vol of geblokkeerd — negeren, blijft in-memory werken */
  }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(KEY_SETTINGS, {}) };
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  writeJson(KEY_SETTINGS, next);
  return next;
}

// -- Weerdata (Open-Meteo) -----------------------------------------------

const WEATHER_CODES = {
  0: ["Helder", "sun"],
  1: ["Vrijwel onbewolkt", "cloud-sun"],
  2: ["Half bewolkt", "cloud-sun"],
  3: ["Bewolkt", "cloudy"],
  45: ["Mist", "cloud-fog"],
  48: ["Mist met rijp", "cloud-fog"],
  51: ["Lichte motregen", "cloud-drizzle"],
  53: ["Motregen", "cloud-drizzle"],
  55: ["Zware motregen", "cloud-drizzle"],
  56: ["IJzel (licht)", "cloud-drizzle"],
  57: ["IJzel", "cloud-drizzle"],
  61: ["Lichte regen", "cloud-rain"],
  63: ["Regen", "cloud-rain"],
  65: ["Zware regen", "cloud-rain"],
  66: ["IJzel met regen", "cloud-rain"],
  67: ["IJzel met zware regen", "cloud-rain"],
  71: ["Lichte sneeuw", "cloud-snow"],
  73: ["Sneeuw", "cloud-snow"],
  75: ["Zware sneeuw", "cloud-snow"],
  77: ["Sneeuwkorrels", "cloud-snow"],
  80: ["Lichte buien", "cloud-rain-wind"],
  81: ["Buien", "cloud-rain-wind"],
  82: ["Zware buien", "cloud-rain-wind"],
  85: ["Sneeuwbuien", "cloud-snow"],
  86: ["Zware sneeuwbuien", "cloud-snow"],
  95: ["Onweer", "cloud-lightning"],
  96: ["Onweer met hagel", "cloud-lightning"],
  99: ["Zwaar onweer met hagel", "cloud-lightning"],
};

export function weatherCodeInfo(code) {
  return WEATHER_CODES[code] || ["Onbekend", "cloud"];
}

function findNearestIndex(times, targetIso) {
  if (!targetIso || !times.length) return 0;
  const exact = times.indexOf(targetIso);
  if (exact !== -1) return exact;
  const targetMs = new Date(targetIso).getTime();
  let best = 0;
  let bestDiff = Infinity;
  times.forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

export function normalizeWeather(json) {
  const cur = json.current || {};
  const hourly = json.hourly || {};
  const times = hourly.time || [];
  const nowIdx = findNearestIndex(times, cur.time);

  const current = {
    time: cur.time,
    temp: cur.temperature_2m,
    precipitation: cur.precipitation,
    windSpeed: cur.wind_speed_10m,
    windGusts: cur.wind_gusts_10m,
    isDay: cur.is_day === 1,
    weatherCode: cur.weather_code,
    uvIndex: hourly.uv_index ? hourly.uv_index[nowIdx] : null,
    precipChance: hourly.precipitation_probability ? hourly.precipitation_probability[nowIdx] : null,
  };

  const nowMs = new Date(cur.time || Date.now()).getTime();
  const hours = times
    .map((t, i) => ({
      time: t,
      temp: hourly.temperature_2m?.[i],
      precipChance: hourly.precipitation_probability?.[i],
      windGusts: hourly.wind_gusts_10m?.[i],
      weatherCode: hourly.weather_code?.[i],
      uvIndex: hourly.uv_index?.[i],
    }))
    .filter((h) => {
      const ms = new Date(h.time).getTime();
      return ms >= nowMs - 3300000 && ms <= nowMs + 12 * 3600000; // nu t/m 12 uur vooruit
    });

  return { current, hours, fetchedAt: Date.now() };
}

// Haalt actuele waarden + uurverwachting op voor een positie. Gratis publieke
// API, geen sleutel of account nodig.
export async function fetchWeather(lat, lon, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index",
    forecast_days: "2",
    timezone: "auto",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo gaf status ${res.status}`);
  const json = await res.json();
  return normalizeWeather(json);
}

// Best-effort plaatsnaam bij coördinaten — puur cosmetisch, faalt stilletjes.
export async function reverseGeocode(lat, lon, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    localityLanguage: "nl",
  });
  const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, { signal });
  if (!res.ok) throw new Error(`Reverse geocode gaf status ${res.status}`);
  const json = await res.json();
  return json.city || json.locality || json.principalSubdivision || null;
}

// -- Advies ----------------------------------------------------------------

// sample: { temp, windGusts, precipChance, precipitation? }
export function computeAdvice(sample, settings) {
  const reasons = [];
  if (sample.precipitation != null && sample.precipitation > 0) {
    reasons.push("het regent nu");
  }
  if (sample.temp != null && sample.temp < settings.minTemp) {
    reasons.push(`maar ${Math.round(sample.temp)}°C (< ${settings.minTemp}°C)`);
  }
  if (sample.windGusts != null && sample.windGusts > settings.maxWind) {
    reasons.push(`windstoten tot ${Math.round(sample.windGusts)} km/u (> ${settings.maxWind})`);
  }
  if (sample.precipChance != null && sample.precipChance > settings.maxRainChance) {
    reasons.push(`${Math.round(sample.precipChance)}% regenkans (> ${settings.maxRainChance}%)`);
  }
  return { ok: reasons.length === 0, reasons };
}
