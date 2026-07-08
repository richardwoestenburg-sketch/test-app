import React, { useState } from "react";
import { BookOpen, CalendarDays } from "lucide-react";
import { APP_STYLE } from "./theme.js";
import DagLog from "./DagLog.jsx";
import Agenda from "./Agenda.jsx";

const TAB_KEY = "daglog-tab";

export default function App() {
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem(TAB_KEY);
    return saved === "agenda" ? "agenda" : "log";
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
        </div>
      </div>
      <div className="pt-7">
        {tab === "log" ? <DagLog /> : <Agenda />}
      </div>
    </div>
  );
}
