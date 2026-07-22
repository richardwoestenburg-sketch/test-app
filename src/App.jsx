import React, { useEffect, useState } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { APP_STYLE } from "./theme.js";
import { APPS, findApp } from "./apps.js";
import DagLog from "./DagLog.jsx";
import Agenda from "./Agenda.jsx";
import TimeLog from "./TimeLog.jsx";
import Vakantie from "./Vakantie.jsx";
import Flitsers from "./Flitsers.jsx";
import Secretary from "./Secretary.jsx";
import Images3D from "./Images3D.jsx";
import Voice from "./Voice.jsx";
import Cabrio from "./Cabrio.jsx";
import Garage from "./Garage.jsx";

const COMPONENTS = {
  log: DagLog,
  agenda: Agenda,
  tijd: TimeLog,
  vakantie: Vakantie,
  flitsers: Flitsers,
  cabrio: Cabrio,
  garage: Garage,
  afbeeldingen: Images3D,
  stem: Voice,
  secretaresse: Secretary,
};

const TAB_KEY = "daglog-tab";

// ?app=<key> opent één module als losstaande app: geen startscherm of
// navigatie eromheen, eigen titel en eigen manifest zodat elke module apart
// (met eigen naam, kleur en icoon) op het startscherm te installeren is.
function standaloneKey() {
  try {
    const k = new URLSearchParams(window.location.search).get("app");
    return findApp(k) ? k : null;
  } catch {
    return null;
  }
}

function accentVars(app) {
  return app ? { "--dl-accent": app.accent, "--dl-accent-bright": app.bright } : {};
}

export default function App() {
  const [solo] = useState(standaloneKey);
  const [tab, setTab] = useState(() => {
    if (solo) return solo;
    const saved = localStorage.getItem(TAB_KEY);
    return COMPONENTS[saved] ? saved : "home";
  });
  const app = findApp(tab);

  // In standalone-modus: eigen titel, manifest en themakleur, zodat de
  // browser deze module als losse app ziet (en zo installeert).
  useEffect(() => {
    if (!solo) return;
    const a = findApp(solo);
    document.title = a.name;
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.href = `manifest-${a.key}.webmanifest`;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = a.accent;
  }, [solo]);

  const choose = (t) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
  };

  // Startscherm: een raster van app-tegels in plaats van een rij tabbladen.
  if (!app) {
    return (
      <div className="dl-root">
        <style>{APP_STYLE}</style>
        <div className="max-w-xl mx-auto px-5 pt-10 pb-12">
          <header className="mb-8">
            <h1 className="dl-serif text-3xl">Mijn apps</h1>
            <p className="text-sm opacity-60 mt-1">
              Kies een app — elke app is ook los op je startscherm te installeren.
            </p>
          </header>
          <div className="dl-home-grid">
            {APPS.map((a) => (
              <button
                key={a.key}
                className="dl-tile"
                onClick={() => choose(a.key)}
                style={accentVars(a)}
              >
                <span className="dl-tile-icon"><a.icon size={22} strokeWidth={1.8} /></span>
                <span className="dl-tile-name">{a.name}</span>
                <span className="dl-tile-tag">{a.tagline}</span>
              </button>
            ))}
          </div>
          <p className="text-xs opacity-50 mt-9 leading-relaxed">
            Tip: open een app en tik rechtsboven op ⧉ — installeer 'm daarna via
            je browsermenu ("App installeren" / "Zet op beginscherm"). Zo krijgt
            elke app een eigen naam, kleur en icoon op je telefoon.
          </p>
        </div>
      </div>
    );
  }

  const Component = COMPONENTS[app.key];

  // Standalone (?app=…): alleen de module zelf, zonder navigatie.
  if (solo) {
    return (
      <div className="dl-root" style={accentVars(app)}>
        <style>{APP_STYLE}</style>
        <div className="pt-6">
          <Component />
        </div>
      </div>
    );
  }

  // In het "verzamel"-scherm: slanke balk met terug-knop + standalone-link.
  return (
    <div className="dl-root" style={accentVars(app)}>
      <style>{APP_STYLE}</style>
      <div className="max-w-xl mx-auto px-5 pt-5">
        <div className="dl-appbar">
          <button className="dl-back" onClick={() => choose("home")} aria-label="Terug naar mijn apps">
            <ChevronLeft size={18} />
          </button>
          <span className="dl-appbar-title">
            <app.icon size={15} className="dl-ico-accent" /> {app.name}
          </span>
          <a
            className="dl-back"
            href={`?app=${app.key}`}
            title="Open als losse app (daarna te installeren)"
            aria-label="Open als losse app"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
      <div className="pt-5">
        <Component />
      </div>
    </div>
  );
}
