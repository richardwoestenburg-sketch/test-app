import React, { useState, useEffect } from "react";
import { BookOpen, CalendarDays, Timer, Camera, Images, UserRound } from "lucide-react";
import { APP_STYLE } from "./theme.js";
import DagLog from "./DagLog.jsx";
import Agenda from "./Agenda.jsx";
import TimeLog from "./TimeLog.jsx";
import Vakantie from "./Vakantie.jsx";
import Flitsers from "./Flitsers.jsx";
import Secretary from "./Secretary.jsx";

const TAB_KEY = "daglog-tab";
const TABS = ["log", "agenda", "tijd", "vakantie", "flitsers", "secretaresse"];

export default function App() {
  const [tab, setTab] = useState(() => {
    // Een melding-tik opent de app als ?tab=… (zie service worker); die wint van
    // de laatst gekozen tab.
    try {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q && TABS.includes(q)) return q;
    } catch {}
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.includes(saved) ? saved : "log";
  });

  const choose = (t) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
  };

  // Ruim alleen de ?tab=-parameter op na het laden (laat ?code=/&state= van de
  // Microsoft-redirect intact — die verwerkt de Secretaresse-tab zelf).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("tab")) {
        url.searchParams.delete("tab");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {}
  }, []);

  // Een al geopende app die een melding-tik krijgt, wisselt van tab via een
  // bericht van de service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMsg = (e) => {
      if (e.data && e.data.type === "open-tab" && TABS.includes(e.data.tab)) {
        setTab(e.data.tab);
        try { localStorage.setItem(TAB_KEY, e.data.tab); } catch {}
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  return (
    <div className="dl-root">
      <style>{APP_STYLE}</style>
      <div className="max-w-xl mx-auto px-5 pt-7">
        <div className="dl-tabs" role="tablist" aria-label="Weergave">
          <button
            role="tab"
            aria-selected={tab === "log"}
            className={`dl-tab ${tab === "log" ? "dl-tab-active" : ""}`}
            onClick={() => choose("log")}
          >
            <BookOpen size={15} /> Daglog
          </button>
          <button
            role="tab"
            aria-selected={tab === "agenda"}
            className={`dl-tab ${tab === "agenda" ? "dl-tab-active" : ""}`}
            onClick={() => choose("agenda")}
          >
            <CalendarDays size={15} /> Agenda
          </button>
          <button
            role="tab"
            aria-selected={tab === "tijd"}
            className={`dl-tab ${tab === "tijd" ? "dl-tab-active" : ""}`}
            onClick={() => choose("tijd")}
          >
            <Timer size={15} /> Tijd
          </button>
          <button
            role="tab"
            aria-selected={tab === "vakantie"}
            className={`dl-tab ${tab === "vakantie" ? "dl-tab-active" : ""}`}
            onClick={() => choose("vakantie")}
          >
            <Images size={15} /> Vakantie
          </button>
          <button
            role="tab"
            aria-selected={tab === "flitsers"}
            className={`dl-tab ${tab === "flitsers" ? "dl-tab-active" : ""}`}
            onClick={() => choose("flitsers")}
          >
            <Camera size={15} /> Flitsers
          </button>
          <button
            role="tab"
            aria-selected={tab === "secretaresse"}
            className={`dl-tab ${tab === "secretaresse" ? "dl-tab-active" : ""}`}
            onClick={() => choose("secretaresse")}
          >
            <UserRound size={15} /> Secretaresse
          </button>
        </div>
      </div>
      <div className="pt-7">
        {tab === "log" ? (
          <DagLog />
        ) : tab === "agenda" ? (
          <Agenda />
        ) : tab === "tijd" ? (
          <TimeLog />
        ) : tab === "vakantie" ? (
          <Vakantie />
        ) : tab === "flitsers" ? (
          <Flitsers />
        ) : (
          <Secretary />
        )}
      </div>
    </div>
  );
}
