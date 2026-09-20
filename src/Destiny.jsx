import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Gamepad2, Plus, Trash2, Pencil, X, Check, Search, Sparkles, Mic, Settings,
  Download, Upload, Boxes, Users, Trophy, StickyNote, MessageSquare, Clock,
  ExternalLink, Camera, Images, LogIn, LogOut, RefreshCw, Link2,
} from "lucide-react";
import * as d from "./destiny.js";
import * as b from "./bungie.js";

const KEY_VIEW = "destiny-view-tab";
const KEY_VIEW_PLATFORM = "destiny-view-platform";

const TABS = [
  { id: "vragen", name: "Vragen", icon: MessageSquare },
  { id: "kluis", name: "Kluis", icon: Boxes },
  { id: "karakters", name: "Karakters", icon: Users },
  { id: "voortgang", name: "Voortgang", icon: Trophy },
  { id: "notities", name: "Notities", icon: StickyNote },
];

const STATUS_STYLE = { todo: "dt-row-muted", bezig: "dt-row-busy", klaar: "dt-row-done" };

function Segment({ options, value, onChange, label }) {
  return (
    <div className="dt-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          className={`dt-seg-btn ${value === o.id ? "dt-seg-on" : ""}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase dl-day-label opacity-60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Select({ value, onChange, options, empty }) {
  return (
    <select className="dt-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// Een nieuw ding krijgt meteen een id: dan kun je er tijdens het invullen al
// een foto bij maken. Klik je het formulier weg zonder opslaan, dan worden
// die foto's weer verwijderd (en anders bij de volgende start opgeruimd).
function emptyItem(platform) {
  return {
    id: null, isNew: true, platform: platform || "ps5", kind: "wapen", name: "", type: "",
    element: "", rarity: "Legendary", charClass: "", power: "", location: "kluis",
    perks: "", notes: "", tags: [],
  };
}

function emptyChar(platform) {
  return { id: null, platform: platform || "ps5", cls: "Titan", name: "", subclass: "", power: "", notes: "" };
}

function emptyActivity(platform) {
  return { id: null, platform: platform || "ps5", kind: "raid", name: "", status: "todo", notes: "" };
}

// Legt uit waaróm er niets gevonden is. De app weet van Bungie of de
// inventaris meekwam, hoeveel dingen er waren en of de namen ophalen lukte.
function legeUitleg(diag) {
  if (!diag) return "Er kwam niets terug van Bungie.";
  if (diag.ruw === 0) {
    if (!diag.karakters) {
      return (
        "Dit profiel gaf geen karakters én geen spullen terug. Waarschijnlijk hoort dit " +
        "platform-account niet bij het account waarop je Destiny speelt — koppel hierboven een " +
        "ander gevonden profiel aan dit platform."
      );
    }
    if (!diag.kluisAanwezig && !diag.karakterInventarisAanwezig) {
      return (
        "Bungie gaf wel je profiel terug, maar geen inventaris. Dat betekent bijna altijd dat " +
        "je Bungie-app niet het recht heeft om je kluis te lezen. Zet op bungie.net bij je app " +
        "de leesrechten voor je Destiny-gegevens aan, en log daarna hier opnieuw in " +
        "(⚙️ → Uitloggen → Inloggen bij Bungie)."
      );
    }
    return (
      `Je hebt ${diag.karakters} karakters, maar Bungie gaf geen wapens of armor terug. ` +
      "Speel je op dit platform met een ander account, of staat je kluis leeg?"
    );
  }
  if (diag.zonderNaam >= diag.ruw) {
    return (
      `Bungie gaf ${diag.ruw} dingen terug, maar de namen erbij ophalen lukte niet` +
      (diag.naamFout ? ` (${diag.naamFout})` : "") +
      ". Probeer het zo nog eens. Blijft het misgaan, dan klopt de API-key of de Origin Header " +
      "van je Bungie-app niet."
    );
  }
  return `Van de ${diag.ruw} dingen bleven er na filtering geen wapens of armor over.`;
}

function dateLabel(ts) {
  return new Date(ts).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function Destiny() {
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem(KEY_VIEW);
    return TABS.some((t) => t.id === saved) ? saved : "vragen";
  });
  // "" = beide platforms samen.
  const [platform, setPlatform] = useState(() => {
    const saved = localStorage.getItem(KEY_VIEW_PLATFORM);
    return saved === "ps5" || saved === "xbox" ? saved : "";
  });

  const [items, setItems] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState([]);
  const [profile, setProfile] = useState({ ps5: "", xbox: "" });
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const all = d.loadAll();
    setItems(all.items);
    setCharacters(all.characters);
    setActivities(all.activities);
    setNotes(all.notes);
    setProfile(all.profile);
    setHistory(d.loadHistory());
    setLoaded(true);
    // Foto's komen uit IndexedDB; eerst opruimen wat nergens meer bij hoort.
    (async () => {
      try {
        await d.cleanupOrphanPhotos(all.items, all.notes);
        setPhotos(await d.getAllPhotos());
      } catch {
        /* geen IndexedDB (privémodus) — de app werkt verder gewoon */
      }
    })();
  }, []);

  const choose = (t) => {
    setTab(t);
    try { localStorage.setItem(KEY_VIEW, t); } catch {}
  };
  const choosePlatform = (p) => {
    setPlatform(p);
    try { localStorage.setItem(KEY_VIEW_PLATFORM, p); } catch {}
  };

  const commitItems = (next) => { setItems(next); d.saveItems(next); };
  const commitChars = (next) => { setCharacters(next); d.saveCharacters(next); };
  const commitActs = (next) => { setActivities(next); d.saveActivities(next); };
  const commitNotes = (next) => { setNotes(next); d.saveNotes(next); };

  // ---- Foto's ------------------------------------------------------------
  const [lightbox, setLightbox] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const photoTarget = useRef(null);
  const camRef = useRef(null);
  const galRef = useRef(null);

  // Object-URL's per foto, opgeruimd zodra de lijst verandert.
  const photoUrls = useMemo(() => {
    const map = new Map();
    for (const p of photos) {
      try { map.set(p.id, URL.createObjectURL(p.blob)); } catch {}
    }
    return map;
  }, [photos]);
  useEffect(() => () => photoUrls.forEach((url) => URL.revokeObjectURL(url)), [photoUrls]);

  const photosFor = (key, id) => (id ? photos.filter((p) => p[key] === id) : []);

  // source "camera" opent meteen de camera, "galerij" je fotorol.
  const pickPhoto = (target, source) => {
    photoTarget.current = target;
    setPhotoError("");
    const ref = source === "camera" ? camRef : galRef;
    ref.current?.click();
  };

  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = photoTarget.current;
    if (!file || !target) return;
    try {
      await d.addPhoto({ file, ...target });
      setPhotos(await d.getAllPhotos());
    } catch {
      setPhotoError("De foto kon niet worden opgeslagen. Is er nog ruimte op je toestel?");
    }
  };

  const removePhoto = async (id) => {
    try {
      await d.deletePhoto(id);
      setPhotos(await d.getAllPhotos());
    } catch {}
    setLightbox(null);
  };

  const dropPhotosFor = async (match) => {
    try {
      await d.deletePhotosWhere(match);
      setPhotos(await d.getAllPhotos());
    } catch {}
  };

  // Strip met miniaturen; tikken opent de foto groot.
  const renderPhotos = (list) =>
    !list.length ? null : (
      <div className="dt-photos mt-2">
        {list.map((p) => (
          <button key={p.id} className="dl-photo-thumb-wrap" onClick={() => setLightbox(p)}>
            <img className="dl-photo-thumb" src={photoUrls.get(p.id)} alt="Foto" loading="lazy" />
          </button>
        ))}
      </div>
    );

  const photoButtons = (target, label) => (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => pickPhoto(target, "camera")}
        className="dl-btn-ghost px-3 py-2 text-xs flex items-center gap-1.5"
      >
        <Camera size={14} /> {label || "Foto maken"}
      </button>
      <button
        onClick={() => pickPhoto(target, "galerij")}
        className="dl-btn-ghost px-3 py-2 text-xs flex items-center gap-1.5"
      >
        <Images size={14} /> Uit je fotorol
      </button>
    </div>
  );

  const data = useMemo(
    () => ({ items, characters, activities, notes, profile, photos }),
    [items, characters, activities, notes, profile, photos]
  );
  const onPlatform = (list) => (platform ? list.filter((x) => x.platform === platform) : list);
  const s = d.stats(data, platform);

  // ---- Vragen ------------------------------------------------------------
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [history, setHistory] = useState([]);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef(null);

  // Inspreken van een vraag (Web Speech API, zelfde aanpak als in Daglog).
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
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setQuestion(transcript.slice(0, 200));
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
      try { rec.abort(); } catch {}
    };
  }, []);

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setSpeechError("");
    if (listening) {
      try { rec.stop(); } catch {}
      setListening(false);
      return;
    }
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Het platformfilter bovenin telt mee in de vraag, zodat "hoeveel exotics"
  // ook alleen over PS5 gaat als je dat filter aan hebt staan.
  const runAsk = (raw) => {
    const q = (raw == null ? question : raw).trim();
    if (!q) return;
    // Staat het platformfilter op PS5 of Xbox, en noemt de vraag zelf geen
    // platform? Dan hoort dat filter erbij.
    const scopedQ = platform && !/ps5|playstation|xbox/i.test(q) ? `${q} op ${d.platformLabel(platform)}` : q;
    const res = d.ask(scopedQ, data);
    setAnswer({ ...res, asked: q });
    setQuestion(q);
    const next = [q, ...history.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 12);
    setHistory(next);
    d.saveHistory(next);
  };

  // ---- Kluis -------------------------------------------------------------
  const [itemForm, setItemForm] = useState(null); // null = formulier dicht
  const [itemSearch, setItemSearch] = useState("");
  const [itemFilter, setItemFilter] = useState(""); // "", "wapen", "armor", "Exotic", "god roll"

  const charsFor = (p) => characters.filter((c) => c.platform === p);
  const charName = (c) => `${c.cls}${c.name ? ` · ${c.name}` : ""}`;

  const saveItem = () => {
    const f = itemForm;
    if (!f || !f.name.trim()) return;
    const clean = {
      ...f,
      name: f.name.trim().slice(0, 120),
      power: f.power === "" ? null : Number(f.power) || null,
      perks: f.perks.trim().slice(0, 300),
      notes: f.notes.trim().slice(0, 600),
    };
    const { isNew, ...rest } = clean;
    if (isNew) {
      commitItems([{ ...rest, id: f.id || d.newId(), createdAt: Date.now() }, ...items]);
    } else {
      commitItems(items.map((i) => (i.id === f.id ? { ...i, ...rest } : i)));
    }
    setItemForm(null);
  };

  // Weggeklikt zonder opslaan: foto's van dat niet-opgeslagen ding weg.
  const closeItemForm = () => {
    const f = itemForm;
    if (f?.isNew && f.id) dropPhotosFor((p) => p.itemId === f.id);
    setItemForm(null);
  };

  const deleteItem = (id) => {
    commitItems(items.filter((x) => x.id !== id));
    dropPhotosFor((p) => p.itemId === id);
  };

  const deleteNote = (id) => {
    commitNotes(notes.filter((x) => x.id !== id));
    dropPhotosFor((p) => p.noteId === id);
  };

  const visibleItems = useMemo(() => {
    const q = d.norm(itemSearch);
    let list = onPlatform(items);
    if (itemFilter === "wapen" || itemFilter === "armor" || itemFilter === "overig") {
      list = list.filter((i) => i.kind === itemFilter);
    } else if (itemFilter === "Exotic") {
      list = list.filter((i) => d.norm(i.rarity) === "exotic");
    } else if (itemFilter === "god roll") {
      list = list.filter((i) => (i.tags || []).some((t) => d.norm(t) === "god roll"));
    }
    if (q) {
      list = list.filter((i) =>
        d.norm([i.name, i.type, i.element, i.rarity, i.charClass, i.perks, i.notes, (i.tags || []).join(" ")].join(" ")).includes(q)
      );
    }
    return list.slice().sort((a, b) => d.norm(a.name).localeCompare(d.norm(b.name)));
  }, [items, itemSearch, itemFilter, platform]);

  // ---- Karakters ---------------------------------------------------------
  const [charForm, setCharForm] = useState(null);

  const saveChar = () => {
    const f = charForm;
    if (!f) return;
    const clean = {
      ...f,
      name: f.name.trim().slice(0, 60),
      subclass: f.subclass.trim().slice(0, 60),
      notes: f.notes.trim().slice(0, 400),
      power: f.power === "" ? null : Number(f.power) || null,
    };
    if (f.id) commitChars(characters.map((c) => (c.id === f.id ? { ...c, ...clean } : c)));
    else commitChars([...characters, { ...clean, id: d.newId() }]);
    setCharForm(null);
  };

  const removeChar = (id) => {
    // Items die op dit karakter stonden gaan terug naar de kluis.
    commitItems(items.map((i) => (i.location === id ? { ...i, location: "kluis" } : i)));
    commitChars(characters.filter((c) => c.id !== id));
  };

  // ---- Voortgang ---------------------------------------------------------
  const [actForm, setActForm] = useState(null);

  const saveAct = () => {
    const f = actForm;
    if (!f || !f.name.trim()) return;
    const clean = { ...f, name: f.name.trim().slice(0, 120), notes: f.notes.trim().slice(0, 400) };
    if (f.id) commitActs(activities.map((a) => (a.id === f.id ? { ...a, ...clean, updatedAt: Date.now() } : a)));
    else commitActs([...activities, { ...clean, id: d.newId(), updatedAt: Date.now() }]);
    setActForm(null);
  };

  const cycleStatus = (act) => {
    const order = ["todo", "bezig", "klaar"];
    const next = order[(order.indexOf(act.status) + 1) % order.length];
    commitActs(activities.map((a) => (a.id === act.id ? { ...a, status: next, updatedAt: Date.now() } : a)));
  };

  const quickAddActivity = (kind, name) => {
    const p = platform || "ps5";
    commitActs([
      ...activities,
      { id: d.newId(), platform: p, kind, name, status: "todo", notes: "", updatedAt: Date.now() },
    ]);
  };

  const visibleActs = useMemo(() => {
    const order = { todo: 0, bezig: 1, klaar: 2 };
    return onPlatform(activities)
      .slice()
      .sort(
        (a, b) =>
          d.ACTIVITY_KINDS.findIndex((k) => k.id === a.kind) - d.ACTIVITY_KINDS.findIndex((k) => k.id === b.kind) ||
          (order[a.status] ?? 0) - (order[b.status] ?? 0) ||
          d.norm(a.name).localeCompare(d.norm(b.name))
      );
  }, [activities, platform]);

  // ---- Notities ----------------------------------------------------------
  const [noteText, setNoteText] = useState("");
  // Vaste id voor de notitie die je aan het typen bent, zodat er al een foto
  // aan kan hangen voordat je opslaat.
  const [noteDraftId, setNoteDraftId] = useState(() => d.newId());
  const draftPhotos = photosFor("noteId", noteDraftId);

  const addNote = () => {
    const text = noteText.trim();
    if (!text && !draftPhotos.length) return;
    commitNotes([
      {
        id: noteDraftId,
        platform: platform || "ps5",
        text: text.slice(0, 1000),
        timestamp: Date.now(),
      },
      ...notes,
    ]);
    setNoteText("");
    setNoteDraftId(d.newId());
  };

  // ---- Bungie-koppeling --------------------------------------------------
  const [bungieCfg, setBungieCfg] = useState(() => b.getConfig());
  const [cfgForm, setCfgForm] = useState(null);
  const [loggedIn, setLoggedIn] = useState(() => b.isLoggedIn());
  const [memberships, setMemberships] = useState([]);
  const [links, setLinks] = useState(() => b.getLinks());
  const [bungieMsg, setBungieMsg] = useState("");
  const [sync, setSync] = useState(null);

  const loadMemberships = async () => {
    try {
      const list = await b.getMemberships();
      setMemberships(list);
      // Eerste keer: platform alvast invullen op basis van het soort account.
      const current = b.getLinks();
      let changed = false;
      for (const m of list) {
        const slot = m.suggestedPlatform;
        if (slot && !current[slot]) {
          current[slot] = { membershipType: m.membershipType, membershipId: m.membershipId, displayName: m.displayName };
          changed = true;
        }
      }
      if (changed) setLinks(b.saveLinks(current));
      return list;
    } catch (err) {
      setBungieMsg(err.message);
      if (err.needsLogin) setLoggedIn(false);
      return [];
    }
  };

  // Terug van Bungie: de code uit de URL omwisselen voor een token.
  useEffect(() => {
    const pending = b.pendingRedirect();
    if (!pending) {
      if (b.isLoggedIn()) loadMemberships();
      return;
    }
    setShowSettings(true);
    setBungieMsg("Bezig met inloggen bij Bungie…");
    b.completeLogin(pending)
      .then(() => {
        setLoggedIn(true);
        setBungieMsg("Ingelogd bij Bungie.");
        return loadMemberships();
      })
      .catch((err) => setBungieMsg(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBungieConfig = () => {
    const next = b.saveConfig({ mode: bungieCfg.mode, ...(cfgForm || {}) });
    setBungieCfg(next);
    setCfgForm(null);
    setBungieMsg(next.apiKey && next.clientId ? "Sleutels opgeslagen. Je kunt nu inloggen." : "");
  };

  const linkMembership = (m, slot) => {
    const next = { ...b.getLinks() };
    // Eén profiel hoort bij één platform-vakje.
    for (const key of ["ps5", "xbox"]) {
      if (next[key]?.membershipId === m.membershipId) next[key] = null;
    }
    if (slot) next[slot] = { membershipType: m.membershipType, membershipId: m.membershipId, displayName: m.displayName };
    setLinks(b.saveLinks(next));
  };

  const slotOf = (m) => {
    if (links.ps5?.membershipId === m.membershipId) return "ps5";
    if (links.xbox?.membershipId === m.membershipId) return "xbox";
    return "";
  };

  // Ophalen: profiel bij Bungie opvragen en er een keuzelijst van maken.
  const startSync = async (slot) => {
    const link = links[slot];
    if (!link) return;
    setBungieMsg("");
    setSync({ slot, phase: "ophalen", progress: null });
    try {
      const profile = await b.getProfile(link.membershipType, link.membershipId);
      const chars = b.mapCharacters(profile);
      const items = await b.mapItems(profile, {
        platform: slot,
        onProgress: (done, total) => setSync((s) => (s ? { ...s, progress: { done, total } } : s)),
      });
      // Standaard aangevinkt: wat je in de game vergrendeld hebt, plus exotics.
      const selected = new Set(
        items.filter((i) => i.locked || d.norm(i.rarity) === "exotic").map((i) => i.instanceId)
      );
      setSync({ slot, phase: "kiezen", profile, chars, items, selected, progress: null });
    } catch (err) {
      setSync(null);
      setBungieMsg(err.message);
      if (err.needsLogin) setLoggedIn(false);
    }
  };

  const toggleSelected = (instanceId) => {
    setSync((s) => {
      if (!s) return s;
      const selected = new Set(s.selected);
      if (selected.has(instanceId)) selected.delete(instanceId);
      else selected.add(instanceId);
      return { ...s, selected };
    });
  };

  const applySync = async () => {
    const s = sync;
    if (!s || s.phase !== "kiezen") return;
    setSync({ ...s, phase: "importeren", progress: null });
    try {
      // Eerst de karakters, want dingen kunnen op een karakter staan.
      const charResult = d.mergeCharactersFromBungie(characters, s.chars, s.slot);
      commitChars(charResult.list);
      const localIdFor = (bungieId) => charResult.list.find((c) => c.bungieId === bungieId)?.id || null;

      const chosen = s.items.filter((i) => s.selected.has(i.instanceId));
      const withPerks = [];
      for (let i = 0; i < chosen.length; i++) {
        const item = chosen[i];
        setSync((cur) => (cur ? { ...cur, progress: { done: i, total: chosen.length } } : cur));
        const perks = item.kind === "wapen" ? await b.perksFor(s.profile, item.instanceId).catch(() => "") : "";
        withPerks.push({ ...item, perks });
      }

      const itemResult = d.mergeItemsFromBungie(items, withPerks, s.slot, localIdFor);
      commitItems(itemResult.list);
      setSync({
        ...s,
        phase: "klaar",
        summary: {
          items: itemResult.added,
          updated: itemResult.updated,
          chars: charResult.added + charResult.updated,
        },
      });
    } catch (err) {
      setSync(null);
      setBungieMsg(err.message);
      if (err.needsLogin) setLoggedIn(false);
    }
  };

  const doLogout = () => {
    b.logout();
    setLoggedIn(false);
    setMemberships([]);
    setBungieMsg("Uitgelogd bij Bungie. Je gegevens in de app blijven gewoon staan.");
  };

  // ---- Instellingen ------------------------------------------------------
  const [showSettings, setShowSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef(null);

  const saveProfileField = (key, value) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    d.saveProfile(next);
  };

  const doExport = async () => {
    setSettingsMsg("Back-up maken…");
    const blob = new Blob([await d.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `destiny-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSettingsMsg("Back-up gedownload.");
  };

  const doImport = async (file) => {
    if (!file) return;
    try {
      setSettingsMsg("Back-up inlezen…");
      const added = await d.importData(await file.text());
      const all = d.loadAll();
      setItems(all.items);
      setCharacters(all.characters);
      setActivities(all.activities);
      setNotes(all.notes);
      setProfile(all.profile);
      try { setPhotos(await d.getAllPhotos()); } catch {}
      const aantal = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
      setSettingsMsg(
        `Toegevoegd: ${aantal(added.items, "ding", "dingen")} uit de kluis, ` +
        `${aantal(added.characters, "karakter", "karakters")}, ` +
        `${aantal(added.activities, "activiteit", "activiteiten")}, ` +
        `${aantal(added.notes, "notitie", "notities")} en ` +
        `${aantal(added.photos, "foto", "foto's")}.`
      );
    } catch {
      setSettingsMsg("Dat bestand kon ik niet lezen. Is het een back-up van deze app?");
    }
  };

  const wipeAll = () => {
    commitItems([]);
    commitChars([]);
    commitActs([]);
    commitNotes([]);
    dropPhotosFor(() => true);
    setAnswer(null);
    setConfirmWipe(false);
    setSettingsMsg("Alles gewist.");
  };

  // ---- Weergave ----------------------------------------------------------

  const [syncSearch, setSyncSearch] = useState("");
  const LIMIT = 150;
  const syncMatches = useMemo(() => {
    if (!sync?.items) return [];
    const q = d.norm(syncSearch);
    if (!q) return sync.items;
    return sync.items.filter((i) => d.norm(`${i.name} ${i.type} ${i.rarity} ${i.element}`).includes(q));
  }, [sync, syncSearch]);
  const syncVisible = syncMatches.slice(0, LIMIT);
  const syncHidden = Math.max(0, syncMatches.length - LIMIT);

  const platformOptions = [
    { id: "", name: "Beide" },
    ...d.PLATFORMS.map((p) => ({ id: p.id, name: p.short })),
  ];

  const renderItemRows = (list) =>
    list.map((i) => (
      <div key={i.id} className="dt-row p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{i.name}</div>
          <div className="text-[11px] opacity-65 dl-mono leading-relaxed">{d.itemLine(i, characters)}</div>
          {i.perks && <div className="text-[11px] opacity-60 truncate mt-0.5">{i.perks}</div>}
          {!!(i.tags || []).length && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {i.tags.map((t) => (
                <span key={t} className="dl-badge">{t}</span>
              ))}
            </div>
          )}
          {i.notes && <div className="text-[11px] opacity-60 mt-1">{i.notes}</div>}
          {renderPhotos(photosFor("itemId", i.id))}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => pickPhoto({ itemId: i.id, platform: i.platform }, "camera")}
            className="opacity-40 hover:opacity-90"
            aria-label={`Foto maken bij ${i.name}`}
          >
            <Camera size={14} />
          </button>
          <button
            onClick={() => { setItemForm({ ...emptyItem(i.platform), ...i, isNew: false, power: i.power ?? "", tags: i.tags || [] }); choose("kluis"); }}
            className="opacity-40 hover:opacity-90"
            aria-label={`Bewerk ${i.name}`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => deleteItem(i.id)}
            className="opacity-30 hover:opacity-80"
            aria-label={`Verwijder ${i.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    ));

  const renderActRows = (list) =>
    list.map((a) => (
      <div key={a.id} className={`dt-row ${STATUS_STYLE[a.status] || ""} p-3 flex items-center gap-3`}>
        <button
          onClick={() => cycleStatus(a)}
          className={`dl-check ${a.status === "klaar" ? "dl-check-on" : ""}`}
          aria-label={`Status van ${a.name}: ${d.statusLabel(a.status)} — tik om te wijzigen`}
          title={d.statusLabel(a.status)}
        >
          {a.status === "klaar" ? <Check size={15} /> : a.status === "bezig" ? <Clock size={14} className="dl-ico-accent" /> : null}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{a.name}</div>
          <div className="text-[11px] opacity-60 dl-mono">
            {d.activityKindLabel(a.kind)} · {d.statusLabel(a.status)} · {d.platformLabel(a.platform)}
          </div>
          {a.notes && <div className="text-[11px] opacity-60 mt-0.5">{a.notes}</div>}
        </div>
        <button
          onClick={() => commitActs(activities.filter((x) => x.id !== a.id))}
          className="opacity-30 hover:opacity-80 shrink-0"
          aria-label={`Verwijder ${a.name}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    ));

  const renderCharRows = (list) =>
    list.map((c) => (
      <div key={c.id} className="dt-row p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{charName(c)}</div>
          <div className="text-[11px] opacity-65 dl-mono">
            {[c.subclass, c.power ? `power ${c.power}` : "", d.platformLabel(c.platform)].filter(Boolean).join(" · ")}
          </div>
          {c.notes && <div className="text-[11px] opacity-60 mt-0.5">{c.notes}</div>}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => { setCharForm({ ...emptyChar(c.platform), ...c, power: c.power ?? "" }); choose("karakters"); }}
            className="opacity-40 hover:opacity-90"
            aria-label={`Bewerk ${charName(c)}`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => removeChar(c.id)}
            className="opacity-30 hover:opacity-80"
            aria-label={`Verwijder ${charName(c)}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    ));

  const renderNoteRows = (list) =>
    list.map((n) => (
      <div key={n.id} className="dt-row p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] opacity-60 dl-mono">{dateLabel(n.timestamp)} · {d.platformLabel(n.platform)}</div>
          <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{n.text}</div>
          {renderPhotos(photosFor("noteId", n.id))}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => pickPhoto({ noteId: n.id, platform: n.platform }, "camera")}
            className="opacity-40 hover:opacity-90"
            aria-label="Foto maken bij deze notitie"
          >
            <Camera size={14} />
          </button>
          <button
            onClick={() => deleteNote(n.id)}
            className="opacity-30 hover:opacity-80"
            aria-label="Verwijder notitie"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    ));

  return (
    <div className="max-w-xl mx-auto px-5 pb-12">
      <header className="flex items-center gap-3 mb-5">
        <div className="dl-hero-icon"><Gamepad2 size={22} strokeWidth={1.8} /></div>
        <div className="flex-1 min-w-0">
          <h1 className="dl-serif text-2xl" style={{ letterSpacing: "0.01em" }}>Destiny</h1>
          <p className="text-xs opacity-60 dl-mono truncate">
            PS5 + Xbox · alles op één plek
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="dl-btn-ghost p-2"
          aria-label="Instellingen en back-up"
          aria-pressed={showSettings}
        >
          <Settings size={15} />
        </button>
      </header>

      {showSettings && (
        <div className="dl-card p-4 mb-5 flex flex-col gap-3">
          <div className="text-xs uppercase dl-day-label opacity-60">Instellingen</div>
          {d.PLATFORMS.map((p) => (
            <Field key={p.id} label={`${p.name} — je naam in de game`}>
              <input
                className="dl-input px-3 py-2 text-sm w-full"
                value={profile[p.id] || ""}
                onChange={(e) => saveProfileField(p.id, e.target.value.slice(0, 60))}
                placeholder="bijv. Guardian#1234"
              />
            </Field>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={doExport} className="dl-btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
              <Download size={14} /> Back-up opslaan
            </button>
            <button onClick={() => fileRef.current?.click()} className="dl-btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
              <Upload size={14} /> Back-up inlezen
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }}
            />
            {confirmWipe ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="opacity-70">Alles wissen?</span>
                <button onClick={wipeAll} className="dl-btn-ghost px-2 py-1 text-sm">Ja</button>
                <button onClick={() => setConfirmWipe(false)} className="dl-btn-ghost px-2 py-1 text-sm">Nee</button>
              </span>
            ) : (
              <button onClick={() => setConfirmWipe(true)} className="dl-btn-ghost px-3 py-2 text-sm opacity-70">
                Alles wissen
              </button>
            )}
          </div>
          {settingsMsg && <p className="text-xs opacity-70">{settingsMsg}</p>}
          <p className="text-[11px] opacity-55 leading-relaxed">
            Alles staat alleen op dit toestel (in de browseropslag van deze app), foto's
            inbegrepen. Maak af en toe een back-up als je de app opnieuw installeert of
            overzet naar een ander toestel — foto's gaan mee in het back-upbestand.
          </p>

          <div className="pt-3 border-t" style={{ borderColor: "#e6e9f2" }}>
            <div className="text-xs uppercase dl-day-label opacity-60 mb-1">Bungie-koppeling</div>
            <p className="text-[11px] opacity-60 leading-relaxed mb-3">
              Haal je karakters en je kluis rechtstreeks uit Destiny 2 op, in plaats van
              alles met de hand in te voeren. Je eigen labels, notities en foto's blijven
              daarbij staan.
            </p>

            <div className="mb-3">
              <span className="text-[11px] uppercase dl-day-label opacity-60">Inloggen via</span>
              <div className="mt-1">
                <Segment
                  options={[
                    { id: "app", name: "Deze app" },
                    { id: "worker", name: "Mijn Worker" },
                  ]}
                  value={bungieCfg.mode === "worker" ? "worker" : "app"}
                  onChange={(mode) => setBungieCfg(b.saveConfig({ ...bungieCfg, mode }))}
                  label="Manier van inloggen"
                />
              </div>
              <p className="text-[11px] opacity-55 mt-1.5 leading-relaxed">
                {bungieCfg.mode === "worker"
                  ? b.workerAvailable()
                    ? "Je Worker bewaart het geheim en ververst je sessie, dus je blijft ingelogd (ongeveer 90 dagen). Je Bungie-app moet dan van het type Confidential zijn."
                    : "Stel eerst je Worker in — tandwiel ⚙️ bij Daglog, met de Worker-URL en je DAGLOG_TOKEN. Daarna werkt deze manier."
                  : "Eenvoudig, zonder Worker: je Bungie-app is van het type Public. Na een uur log je opnieuw in."}
              </p>
            </div>

            {!b.isConfigured() || cfgForm ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] opacity-60 leading-relaxed">
                  Eenmalig instellen: maak op{" "}
                  <a
                    className="underline"
                    href="https://www.bungie.net/en/Application"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    bungie.net/en/Application
                  </a>{" "}
                  een app aan. Kies OAuth-type{" "}
                  <strong>{bungieCfg.mode === "worker" ? "Confidential" : "Public"}</strong> en vul als
                  Redirect&nbsp;URL exact dit in:
                </p>
                <code className="dl-mono text-[11px] break-all dl-input px-3 py-2">{b.redirectUrl()}</code>
                <p className="text-[11px] opacity-60 leading-relaxed">
                  Vul ook het veld <strong>Origin Header</strong> in — zonder dat weigert
                  Bungie verzoeken vanuit een browser ("OriginHeaderDoesNotMatchKey"):
                </p>
                <code className="dl-mono text-[11px] break-all dl-input px-3 py-2">{b.originHeader()}</code>
                <p className="text-[11px] opacity-60 leading-relaxed">
                  Vink bij de rechten (scopes) het{" "}
                  <strong>lezen van je Destiny-gegevens</strong> aan; schrijfrechten heeft de
                  app niet nodig.
                </p>
                <Field label="API-key">
                  <input
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={(cfgForm || bungieCfg).apiKey}
                    onChange={(e) => setCfgForm({ ...(cfgForm || bungieCfg), apiKey: e.target.value })}
                    placeholder="uit je Bungie-app"
                  />
                </Field>
                <Field label="OAuth client_id">
                  <input
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={(cfgForm || bungieCfg).clientId}
                    onChange={(e) => setCfgForm({ ...(cfgForm || bungieCfg), clientId: e.target.value })}
                    placeholder="bijv. 12345"
                  />
                </Field>
                {bungieCfg.mode === "worker" && (
                  <p className="text-[11px] opacity-60 leading-relaxed">
                    Het <strong>client_secret</strong> vul je hier niet in — dat zet je als
                    secret op je Worker (<code className="dl-mono">BUNGIE_CLIENT_ID</code> en{" "}
                    <code className="dl-mono">BUNGIE_CLIENT_SECRET</code>), zodat het nooit in
                    de app terechtkomt. Zie <code className="dl-mono">worker/DEPLOY.md</code>.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveBungieConfig}
                    disabled={!(cfgForm || bungieCfg).apiKey?.trim() || !(cfgForm || bungieCfg).clientId?.trim()}
                    className="dl-btn-primary px-3 py-2 text-sm flex items-center gap-1.5"
                  >
                    <Check size={14} /> Opslaan
                  </button>
                  {cfgForm && b.isConfigured() && (
                    <button onClick={() => setCfgForm(null)} className="dl-btn-ghost px-3 py-2 text-sm">
                      Annuleren
                    </button>
                  )}
                </div>
              </div>
            ) : !loggedIn ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={b.startLogin} className="dl-btn-primary px-3 py-2 text-sm flex items-center gap-1.5">
                  <LogIn size={14} /> Inloggen bij Bungie
                </button>
                <button onClick={() => setCfgForm(bungieCfg)} className="dl-btn-ghost px-3 py-2 text-sm">
                  Sleutels wijzigen
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-[11px] uppercase dl-day-label opacity-60">Gevonden profielen</div>
                {!memberships.length ? (
                  <p className="text-sm opacity-60">Profielen ophalen…</p>
                ) : (
                  memberships.map((m) => (
                    <div key={m.membershipId} className="dt-row p-3">
                      <div className="text-sm font-semibold truncate">{m.displayName || m.typeName}</div>
                      <div className="text-[11px] opacity-60 dl-mono mb-2">{m.typeName}</div>
                      <Segment
                        options={[
                          { id: "", name: "Niet gebruiken" },
                          { id: "ps5", name: "PS5" },
                          { id: "xbox", name: "Xbox" },
                        ]}
                        value={slotOf(m)}
                        onChange={(slot) => linkMembership(m, slot)}
                        label={`Koppel ${m.typeName} aan een platform`}
                      />
                    </div>
                  ))
                )}
                <div className="flex flex-wrap gap-2">
                  {d.PLATFORMS.map((pf) =>
                    links[pf.id] ? (
                      <button
                        key={pf.id}
                        onClick={() => startSync(pf.id)}
                        className="dl-btn-primary px-3 py-2 text-sm flex items-center gap-1.5"
                      >
                        <RefreshCw size={14} /> Ophalen voor {pf.short}
                      </button>
                    ) : null
                  )}
                  <button onClick={doLogout} className="dl-btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
                    <LogOut size={14} /> Uitloggen
                  </button>
                </div>
              </div>
            )}
            {bungieMsg && <p className="text-xs opacity-75 mt-3">{bungieMsg}</p>}
            <p className="text-[11px] opacity-50 leading-relaxed mt-3">
              Zo'n Bungie-sessie duurt een uur; daarna log je opnieuw in als je weer wilt
              ophalen. De app leest alleen — er wordt niets in je game gewijzigd.
            </p>
          </div>
        </div>
      )}

      {/* Platform: beide, PS5 of Xbox */}
      <div className="mb-4">
        <Segment options={platformOptions} value={platform} onChange={choosePlatform} label="Platform" />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-5 gap-1.5 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t.id)}
            className={`dt-chip flex flex-col items-center gap-1 py-2 ${tab === t.id ? "dt-chip-on" : ""}`}
            aria-pressed={tab === t.id}
          >
            <t.icon size={15} />
            <span className="text-[10px]">{t.name}</span>
          </button>
        ))}
      </div>

      {photoError && <p className="text-xs opacity-75 mb-3">{photoError}</p>}

      {!loaded ? (
        <p className="text-sm opacity-50">Laden…</p>
      ) : sync ? (
        <div className="dl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase dl-day-label opacity-60">
              Uit Destiny 2 · {d.platformLabel(sync.slot)}
            </span>
            {sync.phase !== "importeren" && (
              <button onClick={() => setSync(null)} className="dl-btn-ghost p-1.5" aria-label="Sluiten">
                <X size={14} />
              </button>
            )}
          </div>

          {sync.phase === "ophalen" || sync.phase === "importeren" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw size={15} className="dl-spin dl-ico-accent" />
                {sync.phase === "ophalen" ? "Je kluis ophalen bij Bungie…" : "Perks ophalen en importeren…"}
              </div>
              {sync.progress && (
                <>
                  <div className="dl-bar">
                    <div
                      className="dl-bar-fill"
                      style={{ width: `${Math.round((sync.progress.done / Math.max(1, sync.progress.total)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] opacity-60 dl-mono">
                    {sync.progress.done} van {sync.progress.total}
                  </div>
                </>
              )}
              <p className="text-[11px] opacity-55 leading-relaxed">
                De eerste keer duurt dit het langst: namen en soorten worden één keer
                opgehaald en daarna bewaard.
              </p>
            </div>
          ) : sync.phase === "klaar" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Klaar: {sync.summary.items} nieuw in je kluis, {sync.summary.updated} bijgewerkt,
                {" "}{sync.summary.chars} karakters.
              </p>
              <p className="text-[11px] opacity-55 leading-relaxed">
                Je eigen labels, notities en foto's zijn ongemoeid gelaten.
              </p>
              <button onClick={() => setSync(null)} className="dl-btn-primary px-4 py-2.5 text-sm">
                Sluiten
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sync.items.length === 0 ? (
                <>
                  <p className="text-sm">Niets gevonden om over te nemen.</p>
                  <p className="text-sm opacity-80 leading-relaxed">{legeUitleg(sync.items.diagnose)}</p>
                  <p className="text-[11px] opacity-55 dl-mono leading-relaxed">
                    Bungie gaf: {sync.items.diagnose?.karakters ?? 0} karakters ·{" "}
                    {sync.items.diagnose?.ruw ?? 0} dingen ·{" "}
                    {sync.items.diagnose?.namenMislukt ?? 0} namen mislukt · kluis{" "}
                    {sync.items.diagnose?.kluisAanwezig ? "ja" : "nee"} · inventaris{" "}
                    {sync.items.diagnose?.karakterInventarisAanwezig ? "ja" : "nee"}
                  </p>
                  <button
                    onClick={() => startSync(sync.slot)}
                    className="dl-btn-ghost px-3 py-2 text-sm flex items-center gap-1.5 self-start"
                  >
                    <RefreshCw size={14} /> Opnieuw proberen
                  </button>
                </>
              ) : (
                <p className="text-sm">
                  {sync.items.length} wapens en armor gevonden. Aangevinkt staat wat je in de
                  game <strong>vergrendeld</strong> hebt, plus je exotics — dat is meestal
                  precies wat je wilt bijhouden.
                </p>
              )}
              <div className={`flex flex-wrap gap-1.5 ${sync.items.length ? "" : "hidden"}`}>
                <button
                  className="dt-chip"
                  onClick={() => setSync((s) => ({ ...s, selected: new Set(s.items.map((i) => i.instanceId)) }))}
                >
                  Alles
                </button>
                <button className="dt-chip" onClick={() => setSync((s) => ({ ...s, selected: new Set() }))}>
                  Niets
                </button>
                <button
                  className="dt-chip"
                  onClick={() =>
                    setSync((s) => ({
                      ...s,
                      selected: new Set(
                        s.items.filter((i) => i.locked || d.norm(i.rarity) === "exotic").map((i) => i.instanceId)
                      ),
                    }))
                  }
                >
                  Vergrendeld + exotics
                </button>
              </div>
              {!!sync.items.length && (
                <>
                  <input
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={syncSearch}
                    onChange={(e) => setSyncSearch(e.target.value)}
                    placeholder="Zoek op naam of soort…"
                    aria-label="Zoek in gevonden spullen"
                  />
                  <div className="text-[11px] uppercase dl-day-label opacity-55">
                    {sync.selected.size} geselecteerd
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
                {syncVisible.map((i) => {
                  const on = sync.selected.has(i.instanceId);
                  return (
                    <button
                      key={i.instanceId}
                      onClick={() => toggleSelected(i.instanceId)}
                      className={`dt-row p-2.5 flex items-center gap-2.5 text-left ${on ? "" : "dt-row-muted"}`}
                      aria-pressed={on}
                    >
                      <span className={`dl-check ${on ? "dl-check-on" : ""}`}>{on ? <Check size={14} /> : null}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{i.name}</span>
                        <span className="block text-[11px] opacity-60 dl-mono truncate">
                          {[i.rarity, i.type, i.power, i.location === "kluis" ? "kluis" : "op karakter"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {syncHidden > 0 && (
                  <p className="text-[11px] opacity-55 py-2">
                    …en nog {syncHidden}. Zoek hierboven om die te zien.
                  </p>
                )}
              </div>
              <button
                onClick={applySync}
                disabled={!sync.selected.size && !sync.chars?.length}
                className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5"
              >
                <Link2 size={15} />{" "}
                {sync.selected.size
                  ? `${sync.selected.size} overnemen in mijn kluis`
                  : `Alleen je ${sync.chars?.length || 0} karakters overnemen`}
              </button>
            </div>
          )}
        </div>
      ) : tab === "vragen" ? (
        <>
          <div className="dt-stats mb-5">
            <div className="dt-stat"><div className="dt-stat-value">{s.items}</div><div className="dt-stat-label">kluis</div></div>
            <div className="dt-stat"><div className="dt-stat-value">{s.exotics}</div><div className="dt-stat-label">exotics</div></div>
            <div className="dt-stat"><div className="dt-stat-value">{s.godRolls}</div><div className="dt-stat-label">god rolls</div></div>
            <div className="dt-stat"><div className="dt-stat-value">{s.activitiesOpen}</div><div className="dt-stat-label">te doen</div></div>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              className="dl-input px-3 py-2.5 text-sm flex-1"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAsk()}
              placeholder="Stel een vraag over je Destiny-spullen…"
              aria-label="Je vraag"
            />
            {speechSupported && (
              <button
                onClick={toggleMic}
                className={`dl-mic px-3 ${listening ? "dl-mic-live" : ""}`}
                aria-label={listening ? "Stop met inspreken" : "Vraag inspreken"}
              >
                <Mic size={16} />
              </button>
            )}
            <button
              onClick={() => runAsk()}
              disabled={!question.trim()}
              className="dl-btn-primary px-3 py-2 text-sm flex items-center gap-1.5"
            >
              <Search size={15} /> Vraag
            </button>
          </div>
          {speechError && <p className="text-xs opacity-70 mb-2">{speechError}</p>}

          {/* Voorbeeldvragen */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {d.suggestions(data).map((q) => (
              <button key={q} className="dt-chip" onClick={() => runAsk(q)}>
                <span className="inline-flex items-center gap-1"><Sparkles size={11} /> {q}</span>
              </button>
            ))}
          </div>

          {answer && (
            <div className="dt-answer p-4 mb-5">
              <div className="text-[11px] uppercase dl-day-label opacity-55 mb-1">{answer.asked}</div>
              <p className="text-sm leading-relaxed">{answer.text}</p>
              {answer.search && (
                <a
                  className="dl-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5 mt-3"
                  href={`https://www.google.com/search?q=${encodeURIComponent(`destiny 2 ${answer.search}`)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <ExternalLink size={12} /> Zoek "{answer.search}" online
                </a>
              )}
              {!!answer.items?.length && <div className="flex flex-col gap-2 mt-3">{renderItemRows(answer.items)}</div>}
              {!!answer.activities?.length && <div className="flex flex-col gap-2 mt-3">{renderActRows(answer.activities)}</div>}
              {!!answer.characters?.length && <div className="flex flex-col gap-2 mt-3">{renderCharRows(answer.characters)}</div>}
              {!!answer.notes?.length && <div className="flex flex-col gap-2 mt-3">{renderNoteRows(answer.notes)}</div>}
            </div>
          )}

          {!!history.length && (
            <>
              <div className="text-xs uppercase dl-day-label opacity-55 mb-2">Eerder gevraagd</div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((h) => (
                  <button key={h} className="dt-chip" onClick={() => runAsk(h)}>{h}</button>
                ))}
              </div>
            </>
          )}

          {!items.length && !activities.length && (
            <p className="text-xs opacity-55 leading-relaxed mt-6">
              Nog niets opgeslagen. Zet eerst wat in je <strong>Kluis</strong> (wapens, armor)
              en je <strong>Voortgang</strong> (raids, dungeons, catalysts) — daarna kun je er
              hier vragen over stellen, ook zonder internet.
            </p>
          )}
        </>
      ) : tab === "kluis" ? (
        <>
          {itemForm ? (
            <div className="dl-card p-4 mb-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase dl-day-label opacity-60">
                  {itemForm.isNew ? "Nieuw in de kluis" : "Bewerken"}
                </span>
                <button onClick={closeItemForm} className="dl-btn-ghost p-1.5" aria-label="Sluiten">
                  <X size={14} />
                </button>
              </div>
              <Segment
                options={d.PLATFORMS.map((p) => ({ id: p.id, name: p.short }))}
                value={itemForm.platform}
                onChange={(v) => setItemForm({ ...itemForm, platform: v, location: "kluis" })}
                label="Platform"
              />
              <Segment
                options={d.KINDS.map((k) => ({ id: k.id, name: k.name }))}
                value={itemForm.kind}
                onChange={(v) => setItemForm({ ...itemForm, kind: v, type: "" })}
                label="Soort"
              />
              <Field label="Naam">
                <input
                  className="dl-input px-3 py-2 text-sm w-full"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="bijv. Fatebringer"
                  autoFocus
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select
                    value={itemForm.type}
                    onChange={(v) => setItemForm({ ...itemForm, type: v })}
                    options={d.typesForKind(itemForm.kind)}
                    empty="—"
                  />
                </Field>
                <Field label="Rarity">
                  <Select
                    value={itemForm.rarity}
                    onChange={(v) => setItemForm({ ...itemForm, rarity: v })}
                    options={d.RARITIES.map((r) => r.name)}
                    empty="—"
                  />
                </Field>
                {itemForm.kind === "wapen" && (
                  <Field label="Element">
                    <Select
                      value={itemForm.element}
                      onChange={(v) => setItemForm({ ...itemForm, element: v })}
                      options={d.ELEMENTS.map((e) => e.name)}
                      empty="—"
                    />
                  </Field>
                )}
                {itemForm.kind === "armor" && (
                  <Field label="Klasse">
                    <Select
                      value={itemForm.charClass}
                      onChange={(v) => setItemForm({ ...itemForm, charClass: v })}
                      options={d.CLASSES.map((c) => c.name)}
                      empty="—"
                    />
                  </Field>
                )}
                <Field label="Power">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={itemForm.power}
                    onChange={(e) => setItemForm({ ...itemForm, power: e.target.value })}
                    placeholder="bijv. 2010"
                  />
                </Field>
                <Field label="Waar">
                  <select
                    className="dt-select"
                    value={itemForm.location}
                    onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                  >
                    <option value="kluis">In de kluis</option>
                    {charsFor(itemForm.platform).map((c) => (
                      <option key={c.id} value={c.id}>Op {charName(c)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={itemForm.kind === "wapen" ? "Perks / roll" : "Stats / eigenschappen"}>
                <input
                  className="dl-input px-3 py-2 text-sm w-full"
                  value={itemForm.perks}
                  onChange={(e) => setItemForm({ ...itemForm, perks: e.target.value })}
                  placeholder={itemForm.kind === "wapen" ? "bijv. Explosive Payload / Firefly" : "bijv. 66 mobility, discipline-mod"}
                />
              </Field>
              <div>
                <span className="text-[11px] uppercase dl-day-label opacity-60">Labels</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {d.TAG_PRESETS.map((t) => {
                    const on = (itemForm.tags || []).includes(t.name);
                    return (
                      <button
                        key={t.name}
                        className={`dt-chip ${on ? "dt-chip-on" : ""}`}
                        onClick={() =>
                          setItemForm({
                            ...itemForm,
                            tags: on ? itemForm.tags.filter((x) => x !== t.name) : [...(itemForm.tags || []), t.name],
                          })
                        }
                        aria-pressed={on}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Notitie">
                <textarea
                  className="dl-input px-3 py-2 text-sm w-full"
                  rows={2}
                  value={itemForm.notes}
                  onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                  placeholder="bijv. tweede roll voor PvP, nog masterworken"
                />
              </Field>
              <div>
                <span className="text-[11px] uppercase dl-day-label opacity-60">Foto's</span>
                <p className="text-[11px] opacity-55 mb-2 mt-0.5">
                  Handig voor de roll of de stats: richt je camera op je scherm.
                </p>
                {photoButtons({ itemId: itemForm.id, platform: itemForm.platform })}
                {renderPhotos(photosFor("itemId", itemForm.id))}
              </div>
              <button
                onClick={saveItem}
                disabled={!itemForm.name.trim()}
                className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5"
              >
                <Check size={15} /> {itemForm.isNew ? "Aan kluis toevoegen" : "Wijziging opslaan"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setItemForm({ ...emptyItem(platform || "ps5"), id: d.newId() })}
              className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5 w-full mb-4"
            >
              <Plus size={15} /> Iets aan je kluis toevoegen
            </button>
          )}

          <div className="flex gap-2 mb-3">
            <input
              className="dl-input px-3 py-2 text-sm flex-1"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Zoek in je kluis…"
              aria-label="Zoek in je kluis"
            />
            {itemSearch && (
              <button onClick={() => setItemSearch("")} className="dl-btn-ghost px-3" aria-label="Zoekopdracht leegmaken">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[
              { id: "", name: "Alles" },
              { id: "wapen", name: "Wapens" },
              { id: "armor", name: "Armor" },
              { id: "overig", name: "Overig" },
              { id: "Exotic", name: "Exotics" },
              { id: "god roll", name: "God rolls" },
            ].map((f) => (
              <button
                key={f.id || "alles"}
                className={`dt-chip ${itemFilter === f.id ? "dt-chip-on" : ""}`}
                onClick={() => setItemFilter(f.id)}
                aria-pressed={itemFilter === f.id}
              >
                {f.name}
              </button>
            ))}
          </div>

          {!visibleItems.length ? (
            <p className="text-sm opacity-50">
              {items.length ? "Niets gevonden met deze filters." : "Je kluis is nog leeg."}
            </p>
          ) : (
            <>
              <div className="text-xs uppercase dl-day-label opacity-55 mb-2">
                {visibleItems.length} {visibleItems.length === 1 ? "ding" : "dingen"}
              </div>
              <div className="flex flex-col gap-2">{renderItemRows(visibleItems)}</div>
            </>
          )}
        </>
      ) : tab === "karakters" ? (
        <>
          {charForm ? (
            <div className="dl-card p-4 mb-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase dl-day-label opacity-60">
                  {charForm.id ? "Karakter bewerken" : "Nieuw karakter"}
                </span>
                <button onClick={() => setCharForm(null)} className="dl-btn-ghost p-1.5" aria-label="Sluiten">
                  <X size={14} />
                </button>
              </div>
              <Segment
                options={d.PLATFORMS.map((p) => ({ id: p.id, name: p.short }))}
                value={charForm.platform}
                onChange={(v) => setCharForm({ ...charForm, platform: v })}
                label="Platform"
              />
              <Segment
                options={d.CLASSES.map((c) => ({ id: c.name, name: c.name }))}
                value={charForm.cls}
                onChange={(v) => setCharForm({ ...charForm, cls: v })}
                label="Klasse"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Naam (optioneel)">
                  <input
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={charForm.name}
                    onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                    placeholder="bijv. hoofd-Titan"
                  />
                </Field>
                <Field label="Power">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="dl-input px-3 py-2 text-sm w-full"
                    value={charForm.power}
                    onChange={(e) => setCharForm({ ...charForm, power: e.target.value })}
                    placeholder="bijv. 2010"
                  />
                </Field>
              </div>
              <Field label="Subclass">
                <input
                  className="dl-input px-3 py-2 text-sm w-full"
                  value={charForm.subclass}
                  onChange={(e) => setCharForm({ ...charForm, subclass: e.target.value })}
                  placeholder="bijv. Sunbreaker / Prismatic"
                />
              </Field>
              <Field label="Notitie">
                <textarea
                  className="dl-input px-3 py-2 text-sm w-full"
                  rows={2}
                  value={charForm.notes}
                  onChange={(e) => setCharForm({ ...charForm, notes: e.target.value })}
                  placeholder="bijv. build voor raids"
                />
              </Field>
              <button onClick={saveChar} className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5">
                <Check size={15} /> {charForm.id ? "Wijziging opslaan" : "Karakter toevoegen"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCharForm(emptyChar(platform || "ps5"))}
              className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5 w-full mb-4"
            >
              <Plus size={15} /> Karakter toevoegen
            </button>
          )}

          {!onPlatform(characters).length ? (
            <p className="text-sm opacity-50">
              Nog geen karakters. Voeg je Titan, Hunter en Warlock toe — dan kun je spullen
              "op een karakter" zetten in plaats van in de kluis.
            </p>
          ) : (
            <div className="flex flex-col gap-2">{renderCharRows(onPlatform(characters))}</div>
          )}
        </>
      ) : tab === "voortgang" ? (
        <>
          {actForm ? (
            <div className="dl-card p-4 mb-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase dl-day-label opacity-60">
                  {actForm.id ? "Bewerken" : "Nieuwe activiteit"}
                </span>
                <button onClick={() => setActForm(null)} className="dl-btn-ghost p-1.5" aria-label="Sluiten">
                  <X size={14} />
                </button>
              </div>
              <Segment
                options={d.PLATFORMS.map((p) => ({ id: p.id, name: p.short }))}
                value={actForm.platform}
                onChange={(v) => setActForm({ ...actForm, platform: v })}
                label="Platform"
              />
              <Field label="Soort">
                <select
                  className="dt-select"
                  value={actForm.kind}
                  onChange={(e) => setActForm({ ...actForm, kind: e.target.value })}
                >
                  {d.ACTIVITY_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Naam">
                <input
                  className="dl-input px-3 py-2 text-sm w-full"
                  value={actForm.name}
                  onChange={(e) => setActForm({ ...actForm, name: e.target.value })}
                  placeholder="bijv. Salvation's Edge"
                  autoFocus
                />
              </Field>
              <Segment
                options={d.STATUSES.map((st) => ({ id: st.id, name: st.name }))}
                value={actForm.status}
                onChange={(v) => setActForm({ ...actForm, status: v })}
                label="Status"
              />
              <Field label="Notitie">
                <textarea
                  className="dl-input px-3 py-2 text-sm w-full"
                  rows={2}
                  value={actForm.notes}
                  onChange={(e) => setActForm({ ...actForm, notes: e.target.value })}
                  placeholder="bijv. alleen laatste boss nog"
                />
              </Field>
              <button
                onClick={saveAct}
                disabled={!actForm.name.trim()}
                className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5"
              >
                <Check size={15} /> {actForm.id ? "Wijziging opslaan" : "Toevoegen"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setActForm(emptyActivity(platform || "ps5"))}
              className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5 w-full mb-4"
            >
              <Plus size={15} /> Activiteit toevoegen
            </button>
          )}

          {/* Snel toevoegen: raids en dungeons die nog niet in je lijst staan */}
          {["raid", "dungeon"].map((kind) => {
            const p = platform || "ps5";
            const missing = d.ACTIVITY_PRESETS[kind].filter(
              (name) => !activities.some((a) => a.platform === p && a.kind === kind && d.norm(a.name) === d.norm(name))
            );
            if (!missing.length) return null;
            return (
              <div key={kind} className="mb-4">
                <div className="text-xs uppercase dl-day-label opacity-55 mb-2">
                  Snel toevoegen — {kind === "raid" ? "raids" : "dungeons"} ({d.platformLabel(p)})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((name) => (
                    <button key={name} className="dt-chip" onClick={() => quickAddActivity(kind, name)}>
                      <span className="inline-flex items-center gap-1"><Plus size={11} /> {name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {!visibleActs.length ? (
            <p className="text-sm opacity-50">Nog niets bijgehouden. Tik hierboven een raid of dungeon aan.</p>
          ) : (
            <>
              <div className="text-xs uppercase dl-day-label opacity-55 mb-2">
                {s.activitiesDone} gehaald · {s.activitiesOpen} nog te doen
              </div>
              <div className="flex flex-col gap-2">{renderActRows(visibleActs)}</div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="dl-card p-4 mb-5">
            <Field label="Notitie">
              <textarea
                className="dl-input px-3 py-2 text-sm w-full"
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="bijv. Nog 3 Pinnacle-caps halen · ruilen met clan · welke build werkt goed"
              />
            </Field>
            <div className="mt-3">
              {photoButtons({ noteId: noteDraftId, platform: platform || "ps5" }, "Foto maken")}
              {renderPhotos(draftPhotos)}
            </div>
            <button
              onClick={addNote}
              disabled={!noteText.trim() && !draftPhotos.length}
              className="dl-btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5 w-full mt-3"
            >
              <Plus size={15} /> Opslaan bij {d.platformLabel(platform || "ps5")}
            </button>
          </div>
          {!onPlatform(notes).length ? (
            <p className="text-sm opacity-50">Nog geen notities.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {renderNoteRows(onPlatform(notes).slice().sort((a, b) => b.timestamp - a.timestamp))}
            </div>
          )}
        </>
      )}

      {/* Eén invoer voor de camera, één voor je fotorol — beide onzichtbaar
          en aangestuurd vanaf de knoppen hierboven. */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotoChosen}
      />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChosen} />

      {lightbox && (
        <div className="dl-photo-overlay" onClick={() => setLightbox(null)}>
          <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img className="dl-photo-modal-img" src={photoUrls.get(lightbox.id)} alt="Foto" />
            <div className="flex items-center justify-between gap-2 p-3">
              <span className="text-xs opacity-60 dl-mono">{dateLabel(lightbox.timestamp)}</span>
              <span className="flex gap-2">
                <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => removePhoto(lightbox.id)}>
                  Verwijderen
                </button>
                <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => setLightbox(null)}>
                  Sluiten
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
