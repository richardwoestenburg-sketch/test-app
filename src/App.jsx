import React, { useState } from "react";
import { BookOpen, CalendarDays, Timer, Camera, Images, UserRound, Box, AudioLines, Car, Wrench } from "lucide-react";
import { APP_STYLE } from "./theme.js";
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

const TAB_KEY = "daglog-tab";
const TABS = ["log", "agenda", "tijd", "vakantie", "flitsers", "cabrio", "garage", "afbeeldingen", "stem", "secretaresse"];

export default function App() {
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.includes(saved) ? saved : "log";
  });

  const choose = (t) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
  };

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
            aria-selected={tab === "cabrio"}
            className={`dl-tab ${tab === "cabrio" ? "dl-tab-active" : ""}`}
            onClick={() => choose("cabrio")}
          >
            <Car size={15} /> Cabrio
          </button>
          <button
            role="tab"
            aria-selected={tab === "garage"}
            className={`dl-tab ${tab === "garage" ? "dl-tab-active" : ""}`}
            onClick={() => choose("garage")}
          >
            <Wrench size={15} /> Garage
          </button>
          <button
            role="tab"
            aria-selected={tab === "afbeeldingen"}
            className={`dl-tab ${tab === "afbeeldingen" ? "dl-tab-active" : ""}`}
            onClick={() => choose("afbeeldingen")}
          >
            <Box size={15} /> Afbeeldingen
          </button>
          <button
            role="tab"
            aria-selected={tab === "stem"}
            className={`dl-tab ${tab === "stem" ? "dl-tab-active" : ""}`}
            onClick={() => choose("stem")}
          >
            <AudioLines size={15} /> Stem
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
        ) : tab === "cabrio" ? (
          <Cabrio />
        ) : tab === "garage" ? (
          <Garage />
        ) : tab === "afbeeldingen" ? (
          <Images3D />
        ) : tab === "stem" ? (
          <Voice />
        ) : (
          <Secretary />
        )}
      </div>
    </div>
  );
}
