import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  ClipboardPaste,
  SprayCan,
  Sparkles,
  MessageSquare,
  Lightbulb,
  Plus,
  Trash2,
  Pencil,
  Search,
  Bot,
  Send,
  Download,
  Upload,
  CheckCircle2,
} from "lucide-react";
import {
  laadData,
  bewaarData,
  getApiKey,
  setApiKey,
  clearApiKey,
  analyseerTekstLokaal,
  analyseerTekstMetAI,
  genereerInzicht,
  stuurChat,
  dagenGeledenTekst,
  laatsteWasbeurt,
} from "./poets.js";

const SUBTABS = [
  { id: "log", label: "Log", Icon: ClipboardList },
  { id: "plak", label: "Plakken", Icon: ClipboardPaste },
  { id: "voorraad", label: "Voorraad", Icon: SprayCan },
  { id: "inzicht", label: "Inzicht", Icon: Sparkles },
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "tips", label: "Tips", Icon: Lightbulb },
];

const AUTO_LABEL = { spider: "Spider 916", mito: "Mito" };
const vandaagISO = () => new Date().toISOString().slice(0, 10);

export default function Poets() {
  const [data, setData] = useState(laadData);
  const [sub, setSub] = useState("log");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  // Elke wijziging aan `data` meteen lokaal bewaren, net als de andere tabs.
  useEffect(() => {
    bewaarData(data);
  }, [data]);

  const melding = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };

  return (
    <div className="max-w-xl mx-auto px-5 pb-20">
      <div className="mb-4">
        <h1 className="dl-serif text-2xl font-semibold flex items-center gap-2">
          <SprayCan size={22} /> Poets-App
        </h1>
        <p className="text-xs opacity-70 mt-0.5">Spider 916 &amp; Mito — log, voorraad, tips</p>
      </div>

      <div className="dl-tabs mb-4" role="tablist" aria-label="Poets-onderdeel">
        {SUBTABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={sub === id}
            className={`dl-tab ${sub === id ? "dl-tab-active" : ""}`}
            onClick={() => setSub(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {sub === "log" && <LogTab data={data} setData={setData} melding={melding} />}
      {sub === "plak" && <PlakTab data={data} setData={setData} melding={melding} />}
      {sub === "voorraad" && <VoorraadTab data={data} setData={setData} melding={melding} />}
      {sub === "inzicht" && <InzichtTab data={data} melding={melding} />}
      {sub === "chat" && <ChatTab data={data} setData={setData} melding={melding} />}
      {sub === "tips" && <TipsTab data={data} setData={setData} melding={melding} />}

      {toast && <div className="pt-toast">{toast}</div>}
    </div>
  );
}

// ---------------- LOG ----------------
function LogTab({ data, setData, melding }) {
  const [datum, setDatum] = useState(vandaagISO);
  const [auto, setAuto] = useState("spider");
  const [gekozen, setGekozen] = useState(() => new Set());
  const [notitie, setNotitie] = useState("");
  const [filter, setFilter] = useState("alle");

  const beschikbaar = data.voorraad.filter((p) => p.op !== false);

  const toggleProduct = (naam) => {
    setGekozen((prev) => {
      const next = new Set(prev);
      next.has(naam) ? next.delete(naam) : next.add(naam);
      return next;
    });
  };

  const opslaan = () => {
    const notitieClean = notitie.trim();
    if (!notitieClean && gekozen.size === 0) {
      melding("Vul een notitie of kies producten");
      return;
    }
    const entry = {
      id: Date.now(),
      datum: datum || vandaagISO(),
      auto,
      producten: Array.from(gekozen),
      acties: [],
      notitie: notitieClean,
      bron: "handmatig",
    };
    setData((d) => ({ ...d, entries: [entry, ...d.entries] }));
    setGekozen(new Set());
    setNotitie("");
    melding("Toegevoegd aan log");
  };

  const markeerGewassen = (a) => {
    const entry = {
      id: Date.now(),
      datum: vandaagISO(),
      auto: a,
      producten: ["wassen"],
      acties: [],
      notitie: "",
      bron: "handmatig",
    };
    setData((d) => ({ ...d, entries: [entry, ...d.entries] }));
    melding("Wasbeurt genoteerd");
  };

  const verwijder = (id) =>
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));

  const lijst = filter === "alle" ? data.entries : data.entries.filter((e) => e.auto === filter);

  return (
    <>
      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Wasstatus</h2>
        {["spider", "mito"].map((a) => {
          const laatste = laatsteWasbeurt(data.entries, a);
          const info = laatste
            ? `${laatste} — ${dagenGeledenTekst(laatste)}`
            : "nog niet geregistreerd";
          return (
            <div key={a} className="pt-row">
              <div>
                <div className="text-sm font-medium">{AUTO_LABEL[a]}</div>
                <div className="text-xs opacity-60">{info}</div>
              </div>
              <button className="dl-btn-primary text-xs px-3 py-1.5" onClick={() => markeerGewassen(a)}>
                Vandaag
              </button>
            </div>
          );
        })}
      </div>

      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Nieuwe poetsbeurt</h2>
        <label className="pt-label">Datum</label>
        <input
          type="date"
          className="dl-input w-full px-3 py-2 text-sm"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
        />
        <label className="pt-label">Auto</label>
        <select
          className="dl-input w-full px-3 py-2 text-sm"
          value={auto}
          onChange={(e) => setAuto(e.target.value)}
        >
          <option value="spider">Spider 916 (zwart)</option>
          <option value="mito">Mito (rood)</option>
        </select>
        <label className="pt-label">Gebruikte producten / acties</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {beschikbaar.length === 0 && (
            <span className="text-xs opacity-60">Alles staat op "op" — zet iets aan in Voorraad.</span>
          )}
          {beschikbaar.map((p) => (
            <button
              key={p.naam}
              className={`pt-chip ${gekozen.has(p.naam) ? "pt-chip-on" : ""}`}
              onClick={() => toggleProduct(p.naam)}
            >
              {p.naam}
            </button>
          ))}
        </div>
        <label className="pt-label">Notitie</label>
        <textarea
          className="dl-input w-full px-3 py-2 text-sm"
          rows={3}
          placeholder="Wat is er gedaan, resultaat, aandachtspunten..."
          value={notitie}
          onChange={(e) => setNotitie(e.target.value)}
        />
        <button className="dl-btn-primary w-full py-2.5 text-sm mt-3 flex items-center justify-center gap-1.5" onClick={opslaan}>
          <Plus size={15} /> Toevoegen aan log
        </button>
      </div>

      <div className="dl-card p-4">
        <h2 className="dl-card-h">Geschiedenis</h2>
        <select
          className="dl-input w-full px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="alle">Alle auto's</option>
          <option value="spider">Spider 916</option>
          <option value="mito">Mito</option>
        </select>
        <div className="mt-3">
          {lijst.length === 0 && <div className="pt-empty">Nog geen entries</div>}
          {lijst.map((e) => {
            const tags = [...(e.producten || []), ...(e.acties || [])];
            return (
              <div key={e.id} className="pt-entry">
                <div className="text-xs opacity-60 mb-1">
                  {e.datum} · {AUTO_LABEL[e.auto] || "Spider 916"}
                  {e.bron === "plakken" ? " · uit tekst" : ""}
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {tags.map((t, i) => (
                      <span key={i} className="pt-chip pt-chip-on">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {e.notitie && <div className="text-sm whitespace-pre-wrap">{e.notitie}</div>}
                <button
                  className="dl-btn-ghost text-xs px-2.5 py-1 mt-2 flex items-center gap-1"
                  onClick={() => verwijder(e.id)}
                >
                  <Trash2 size={12} /> Verwijderen
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------- PLAKKEN ----------------
function PlakTab({ data, setData, melding }) {
  const [tekst, setTekst] = useState("");
  const [fragmenten, setFragmenten] = useState([]);
  const [status, setStatus] = useState("");
  const [toonKaart, setToonKaart] = useState(false);
  const [bezig, setBezig] = useState(false);
  const idRef = useRef(0);

  const zetFragmenten = (rauwe) => {
    setFragmenten(rauwe.map((f) => ({ ...f, fid: ++idRef.current })));
    setToonKaart(true);
  };

  const analyseerLokaal = () => {
    if (!tekst.trim()) {
      melding("Plak eerst tekst");
      return;
    }
    setStatus("");
    zetFragmenten(analyseerTekstLokaal(tekst, data.voorraad));
  };

  const analyseerAI = async () => {
    if (!tekst.trim()) {
      melding("Plak eerst tekst");
      return;
    }
    if (!getApiKey()) {
      setStatus("Geen API-key ingesteld — ga naar tab Inzicht om er een toe te voegen.");
      return;
    }
    setBezig(true);
    setStatus("AI analyseert de tekst...");
    try {
      const gevonden = await analyseerTekstMetAI(tekst, data.voorraad);
      zetFragmenten(gevonden);
      setStatus(
        gevonden.length
          ? `${gevonden.length} fragment(en) gevonden door AI.`
          : "AI vond geen relevante poets-informatie in deze tekst."
      );
    } catch (e) {
      setStatus("Fout: " + e.message);
      melding("AI-analyse mislukt");
    } finally {
      setBezig(false);
    }
  };

  const wijzigFragment = (fid, veld, waarde) =>
    setFragmenten((fs) => fs.map((f) => (f.fid === fid ? { ...f, [veld]: waarde } : f)));

  const voegToe = (fid) => {
    const f = fragmenten.find((x) => x.fid === fid);
    if (!f) return;
    const entry = {
      id: Date.now() + fid,
      datum: f.datum,
      auto: f.auto,
      producten: f.tags,
      acties: [],
      notitie: f.bron,
      bron: "plakken",
    };
    setData((d) => ({ ...d, entries: [entry, ...d.entries] }));
    setFragmenten((fs) => fs.filter((x) => x.fid !== fid));
    melding("Fragment toegevoegd aan log");
  };

  const negeer = (fid) => setFragmenten((fs) => fs.filter((x) => x.fid !== fid));

  return (
    <>
      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Tekst plakken &amp; analyseren</h2>
        <p className="text-xs opacity-70 mb-2">
          Plak hier je bestaande poets-overzicht of een stuk chatgeschiedenis. De app zoekt naar
          data, producten en acties en maakt daar voorstellen van — jij kiest per fragment of het
          in je log komt.
        </p>
        <textarea
          className="dl-input w-full px-3 py-2 text-sm"
          rows={6}
          placeholder="Plak hier tekst of chatgeschiedenis..."
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="dl-btn-ghost text-sm px-3 py-2 flex items-center gap-1.5" onClick={analyseerLokaal}>
            <Search size={14} /> Analyseer (trefwoorden)
          </button>
          <button
            className="dl-btn-primary text-sm px-3 py-2 flex items-center gap-1.5"
            onClick={analyseerAI}
            disabled={bezig}
          >
            <Bot size={14} /> Analyseer met AI
          </button>
          <button
            className="dl-btn-ghost text-sm px-3 py-2"
            onClick={() => {
              setTekst("");
              setFragmenten([]);
              setToonKaart(false);
              setStatus("");
            }}
          >
            Leegmaken
          </button>
        </div>
        {status && <p className="text-xs opacity-70 mt-2">{status}</p>}
      </div>

      {toonKaart && (
        <div className="dl-card p-4">
          <h2 className="dl-card-h">Gevonden fragmenten</h2>
          {fragmenten.length === 0 && (
            <div className="pt-empty">
              Niets herkend — pas evt. je voorraadlijst aan of vul de log handmatig aan.
            </div>
          )}
          {fragmenten.map((f) => (
            <div key={f.fid} className="pt-frag">
              <div className="pt-frag-src">{f.bron.slice(0, 400)}</div>
              <label className="pt-label">Datum</label>
              <input
                type="date"
                className="dl-input w-full px-3 py-2 text-sm"
                value={f.datum}
                onChange={(e) => wijzigFragment(f.fid, "datum", e.target.value)}
              />
              <label className="pt-label">Auto</label>
              <select
                className="dl-input w-full px-3 py-2 text-sm"
                value={f.auto}
                onChange={(e) => wijzigFragment(f.fid, "auto", e.target.value)}
              >
                <option value="spider">Spider 916</option>
                <option value="mito">Mito</option>
              </select>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {f.tags.length > 0 ? (
                  f.tags.map((t, i) => (
                    <span key={i} className="pt-chip pt-chip-on">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="pt-chip">geen tags</span>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="dl-btn-primary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => voegToe(f.fid)}>
                  <CheckCircle2 size={13} /> Toevoegen aan log
                </button>
                <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => negeer(f.fid)}>
                  Negeren
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------- VOORRAAD ----------------
function VoorraadTab({ data, setData, melding }) {
  const [bewerkIdx, setBewerkIdx] = useState(null);
  const [nieuw, setNieuw] = useState("");
  const [editNaam, setEditNaam] = useState("");
  const [editSlecht, setEditSlecht] = useState(false);
  const [editReden, setEditReden] = useState("");

  const startBewerk = (i) => {
    const p = data.voorraad[i];
    setBewerkIdx(i);
    setEditNaam(p.naam);
    setEditSlecht(!!p.slechteErvaring);
    setEditReden(p.notitie || "");
  };

  const bewaarBewerk = (i) => {
    if (!editNaam.trim()) {
      melding("Naam mag niet leeg zijn");
      return;
    }
    setData((d) => {
      const voorraad = d.voorraad.slice();
      voorraad[i] = {
        ...voorraad[i],
        naam: editNaam.trim(),
        slechteErvaring: editSlecht,
        notitie: editReden.trim(),
      };
      return { ...d, voorraad };
    });
    setBewerkIdx(null);
    melding("Product bijgewerkt");
  };

  const toggle = (i) =>
    setData((d) => {
      const voorraad = d.voorraad.slice();
      voorraad[i] = { ...voorraad[i], op: voorraad[i].op === false ? true : false };
      return { ...d, voorraad };
    });

  const voegToe = () => {
    const naam = nieuw.trim();
    if (!naam) return;
    setData((d) => ({ ...d, voorraad: [...d.voorraad, { naam, op: true }] }));
    setNieuw("");
    melding("Product toegevoegd");
  };

  return (
    <>
      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Voorraad</h2>
        <p className="text-xs opacity-70 mb-2">
          Zet uit wat op is — dan verschijnt het niet meer als snelle keuze bij een nieuwe
          log-entry.
        </p>
        {data.voorraad.map((p, i) =>
          i === bewerkIdx ? (
            <div key={i} className="pt-frag">
              <label className="pt-label">Product</label>
              <input
                className="dl-input w-full px-3 py-2 text-sm"
                value={editNaam}
                onChange={(e) => setEditNaam(e.target.value)}
              />
              <label className="pt-label flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={editSlecht}
                  onChange={(e) => setEditSlecht(e.target.checked)}
                />
                ⚠️ Slechte ervaring met dit product
              </label>
              <label className="pt-label">Reden / notitie</label>
              <textarea
                className="dl-input w-full px-3 py-2 text-sm"
                rows={2}
                placeholder="Wat ging er mis, of andere opmerking..."
                value={editReden}
                onChange={(e) => setEditReden(e.target.value)}
              />
              <div className="flex gap-2 mt-3">
                <button className="dl-btn-primary text-xs px-3 py-1.5" onClick={() => bewaarBewerk(i)}>
                  Opslaan
                </button>
                <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => setBewerkIdx(null)}>
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div key={i} className="pt-row">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {p.naam}
                  {p.slechteErvaring && <span className="pt-warn"> ⚠️</span>}
                </div>
                {p.notitie && (
                  <div className={`text-xs ${p.slechteErvaring ? "pt-warn" : "opacity-60"}`}>
                    {p.slechteErvaring ? "⚠️ " : ""}
                    {p.notitie}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="dl-btn-ghost text-xs px-2 py-1" onClick={() => startBewerk(i)}>
                  <Pencil size={13} />
                </button>
                <button
                  className={`pt-toggle ${p.op !== false ? "pt-toggle-on" : ""}`}
                  aria-label={p.op !== false ? "op voorraad" : "op"}
                  onClick={() => toggle(i)}
                >
                  <span className="pt-toggle-dot" />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="dl-card p-4">
        <h2 className="dl-card-h">Product toevoegen</h2>
        <div className="flex gap-2">
          <input
            className="dl-input flex-1 px-3 py-2 text-sm"
            placeholder="Productnaam"
            value={nieuw}
            onChange={(e) => setNieuw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && voegToe()}
          />
          <button className="dl-btn-primary px-3 py-2" onClick={voegToe}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------- INZICHT ----------------
function InzichtTab({ data, melding }) {
  const [key, setKey] = useState(getApiKey);
  const [keyStatus, setKeyStatus] = useState(getApiKey() ? "API-key ingesteld." : "");
  const [autoFilter, setAutoFilter] = useState("alle");
  const [status, setStatus] = useState("");
  const [resultaat, setResultaat] = useState("");
  const [bezig, setBezig] = useState(false);

  const bewaarKey = () => {
    const k = key.trim();
    if (!k) {
      melding("Vul eerst een key in");
      return;
    }
    setApiKey(k);
    setKeyStatus("API-key opgeslagen op dit toestel.");
    melding("API-key opgeslagen");
  };

  const wisKey = () => {
    clearApiKey();
    setKey("");
    setKeyStatus("API-key verwijderd.");
    melding("API-key verwijderd");
  };

  const genereer = async () => {
    if (!getApiKey()) {
      setStatus("Geen API-key ingesteld — vul die hierboven in.");
      return;
    }
    const bron =
      autoFilter === "alle" ? data.entries : data.entries.filter((e) => e.auto === autoFilter);
    if (bron.length === 0) {
      setStatus("Nog geen log-entries voor deze selectie.");
      return;
    }
    setBezig(true);
    setStatus("AI analyseert je log...");
    setResultaat("");
    try {
      const tekst = await genereerInzicht(bron, autoFilter);
      setResultaat(tekst);
      setStatus("Klaar.");
    } catch (e) {
      setStatus("Fout: " + e.message);
      melding("Inzicht genereren mislukt");
    } finally {
      setBezig(false);
    }
  };

  return (
    <>
      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">AI-instellingen</h2>
        <p className="text-xs opacity-70 mb-2">
          Nodig voor AI-tekstanalyse, trendinzicht en de chat. Je Claude API-key wordt alleen
          lokaal op dit toestel opgeslagen (nooit in de export/back-up).
        </p>
        <label className="pt-label">Claude API-key</label>
        <input
          className="dl-input w-full px-3 py-2 text-sm"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <div className="flex gap-2 mt-3">
          <button className="dl-btn-primary text-sm px-3 py-2" onClick={bewaarKey}>
            Opslaan
          </button>
          <button className="dl-btn-ghost text-sm px-3 py-2" onClick={wisKey}>
            Verwijderen
          </button>
        </div>
        {keyStatus && <p className="text-xs opacity-70 mt-2">{keyStatus}</p>}
        <details className="pt-details mt-3">
          <summary>Hoe kom ik aan een API-key?</summary>
          <div className="pt-details-body">
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Ga naar <b>console.anthropic.com</b> en log in of maak een account
              </li>
              <li>
                Ga naar <b>Settings → API Keys</b> en klik "Create Key"
              </li>
              <li>Kopieer de key direct (wordt maar één keer getoond) en plak 'm hierboven</li>
              <li>
                Onder <b>Settings → Billing</b> moet je eerst wat credit opladen. Voor deze korte
                tekstanalyses (Haiku-model) kost een aanvraag maar een fractie van een cent
              </li>
            </ol>
            <div className="pt-note">Behandel je API-key als een wachtwoord — deel 'm met niemand.</div>
          </div>
        </details>
      </div>

      <div className="dl-card p-4">
        <h2 className="dl-card-h">Trend- en effectanalyse</h2>
        <p className="text-xs opacity-70 mb-2">
          Laat AI je log analyseren: welke aanpak/producten het beste effect lijken te hebben,
          patronen in je routine, en concrete aanbevelingen.
        </p>
        <label className="pt-label">Auto</label>
        <select
          className="dl-input w-full px-3 py-2 text-sm"
          value={autoFilter}
          onChange={(e) => setAutoFilter(e.target.value)}
        >
          <option value="alle">Alle auto's</option>
          <option value="spider">Spider 916</option>
          <option value="mito">Mito</option>
        </select>
        <button
          className="dl-btn-primary w-full py-2.5 text-sm mt-3 flex items-center justify-center gap-1.5"
          onClick={genereer}
          disabled={bezig}
        >
          <Sparkles size={15} /> Genereer inzicht
        </button>
        {status && <p className="text-xs opacity-70 mt-2">{status}</p>}
        {resultaat && <div className="text-sm whitespace-pre-wrap mt-3 leading-relaxed">{resultaat}</div>}
      </div>
    </>
  );
}

// ---------------- CHAT ----------------
function ChatTab({ data, setData, melding }) {
  const [invoer, setInvoer] = useState("");
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  const bodemRef = useRef(null);

  useEffect(() => {
    bodemRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.chat]);

  const stuur = async () => {
    const tekst = invoer.trim();
    if (!tekst) return;
    if (!getApiKey()) {
      setStatus("Geen API-key ingesteld — ga naar tab Inzicht om er een toe te voegen.");
      melding("Stel eerst je Claude API-key in (tab Inzicht)");
      return;
    }
    const nieuweChat = [...data.chat, { role: "user", content: tekst }];
    setData((d) => ({ ...d, chat: nieuweChat }));
    setInvoer("");
    setBezig(true);
    setStatus("AI denkt na...");
    try {
      const antwoord = await stuurChat(nieuweChat.slice(-20), data.voorraad);
      setData((d) => ({ ...d, chat: [...d.chat, { role: "assistant", content: antwoord }] }));
      setStatus("");
    } catch (e) {
      setStatus("Fout: " + e.message);
      melding("Bericht versturen mislukt");
    } finally {
      setBezig(false);
    }
  };

  const wis = () => setData((d) => ({ ...d, chat: [] }));

  const heeftKey = !!getApiKey();

  return (
    <div className="dl-card p-4">
      <h2 className="dl-card-h">Vraag het de AI</h2>
      <p className="text-xs opacity-70 mb-2">
        Leg een probleem of vraag voor over je Spider 916 of Mito — de AI kent je producten,
        workflow en bekende aandachtspunten.
      </p>
      {!heeftKey && (
        <div className="pt-note mb-2">
          Nog geen Claude API-key ingesteld op dit toestel. Ga naar het tabblad <b>Inzicht</b>,
          plak je key en klik op <b>Opslaan</b> — anders kan de AI niet antwoorden.
        </div>
      )}
      <div className="pt-chat">
        {data.chat.length === 0 && <div className="pt-empty">Stel hieronder je vraag</div>}
        {data.chat.map((m, i) => (
          <div key={i} className={`pt-msg ${m.role === "user" ? "pt-msg-user" : "pt-msg-ai"}`}>
            {m.content}
          </div>
        ))}
        <div ref={bodemRef} />
      </div>
      <div className="flex gap-2 mt-3">
        <textarea
          className="dl-input flex-1 px-3 py-2 text-sm"
          rows={1}
          placeholder="Bv. mijn raamrubber trekt naar binnen, wat kan ik doen?"
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              stuur();
            }
          }}
        />
        <button className="dl-btn-primary px-3 py-2 self-end" onClick={stuur} disabled={bezig}>
          <Send size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={wis}>
          Chat wissen
        </button>
        {status && <p className="text-xs opacity-70">{status}</p>}
      </div>
    </div>
  );
}

// ---------------- TIPS ----------------
function TipsTab({ data, setData, melding }) {
  const bestandRef = useRef(null);

  const exporteer = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "poets-app-data-" + vandaagISO() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importeer = (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const nieuw = JSON.parse(reader.result);
        if (!nieuw.entries || !nieuw.voorraad) throw new Error("ongeldig bestand");
        if (!nieuw.chat) nieuw.chat = [];
        setData(nieuw);
        melding("Data geïmporteerd");
      } catch {
        melding("Kon bestand niet lezen");
      }
    };
    reader.readAsText(file);
    evt.target.value = "";
  };

  return (
    <>
      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Vaste volgorde — Exterieur</h2>
        <details className="pt-details" open>
          <summary>Wasbeurt t/m afwerklaag (6 stappen)</summary>
          <div className="pt-details-body">
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                <b>Wasbox-run</b> (bv. Baran Carwash, Almere Buiten) — voordroog, liefst vroeg op de dag
              </li>
              <li>
                <b>Turtle Wax Insect Remover</b> — insecten verwijderen
              </li>
              <li>
                <b>Bilt Hamber Korrosol</b> — ijzer-fallout verwijderen
              </li>
              <li>
                <b>Klei-behandeling</b> — kleischijf op Makita DPO600 (snelheid 1–4), met Auto Finesse
                Glide als kleismeermiddel
              </li>
              <li>
                <b>Meguiar's Ultimate Polish</b> — handmatig aanbrengen
              </li>
              <li>
                <b>Turtle Wax Seal N Shine</b> — afwerklaag
              </li>
            </ol>
          </div>
        </details>
      </div>

      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Vaste volgorde — Leerverzorging</h2>
        <details className="pt-details">
          <summary>Kleurloze aanpak Spider 916 (géén verven)</summary>
          <div className="pt-details-body">
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                <b>Colourlock Mild Cleaner</b> — reinigen
              </li>
              <li>
                <b>Colourlock Leather Shield</b> aanbrengen
              </li>
              <li>15 minuten laten intrekken</li>
              <li>
                <b>Colourlock Leather Care</b> aanbrengen
              </li>
              <li>1 uur laten drogen</li>
              <li>
                <b>Valma Rubber Stick</b> voor detailwerk
              </li>
            </ol>
            <div className="pt-note">
              Stuurwiel: Shield en Care zeer spaarzaam aanbrengen — altijd grip-check voor het rijden.
            </div>
            <div className="pt-note">
              Bewuste keuze voor kleurloos herstel i.p.v. herverven. TRG Renovating Balm zwart (300ml)
              bewust niet gebruikt vanwege kleurverschil-risico. Colourlock Leder Verzegeling vervangen
              door Leather Shield.
            </div>
          </div>
        </details>
      </div>

      <div className="dl-card p-4 mb-3">
        <h2 className="dl-card-h">Bekende aandachtspunten</h2>
        <details className="pt-details">
          <summary>Spider 916 — technisch</summary>
          <div className="pt-details-body">
            <ul className="list-disc pl-4 space-y-1">
              <li>Raamrubber bestuurderskant trekt naar binnen bij het laten zakken in koud weer</li>
              <li>
                Softtop-vervanging onderzocht: richtprijs €1.300–2.200 (Cabrio Care Naarden als
                specialist genoteerd)
              </li>
            </ul>
          </div>
        </details>
      </div>

      <div className="dl-card p-4">
        <h2 className="dl-card-h">Back-up</h2>
        <div className="flex flex-wrap gap-2">
          <button className="dl-btn-ghost text-sm px-3 py-2 flex items-center gap-1.5" onClick={exporteer}>
            <Download size={14} /> Exporteer data
          </button>
          <button
            className="dl-btn-ghost text-sm px-3 py-2 flex items-center gap-1.5"
            onClick={() => bestandRef.current?.click()}
          >
            <Upload size={14} /> Importeer
          </button>
          <input
            ref={bestandRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={importeer}
          />
        </div>
      </div>
    </>
  );
}
