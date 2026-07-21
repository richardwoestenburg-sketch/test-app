// Logica en data-laag voor de Poets-App (detailing-logboek voor de Spider 916
// en de Mito). Bewust losgekoppeld van de React-component, net als bij de
// andere tabbladen (cabrio.js, timelog.js, …).
//
// De AI-functies praten rechtstreeks vanuit de browser met de Claude API met
// een eigen API-key (net als de Stem-tab met Fish Audio en de Afbeeldingen-tab
// met Pollinations) — er is geen eigen backend voor nodig. De key wordt alleen
// lokaal op het toestel bewaard, nooit in de export/back-up.

const STORAGE_KEY = "poetsAppData";
const API_KEY_STORAGE = "poetsAppApiKey";

// Haiku is bewust gekozen: de tekstanalyses en losse vragen zijn kort, en zo
// kost een aanvraag maar een fractie van een cent.
const CLAUDE_MODEL = "claude-haiku-4-5";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export const DEFAULT_VOORRAAD = [
  { naam: "Bilt Hamber Korrosol", op: true },
  { naam: "Turtle Wax Insect Remover", op: true },
  { naam: "Meguiar's Ultimate Polish", op: true },
  { naam: "Turtle Wax Seal N Shine", op: true },
  { naam: "Hybrid Ceramic Black Wax", op: true },
  { naam: "Carnauba Wax", op: true },
  { naam: "Color Magic Jet Black Wax", op: true },
  { naam: "Wax & Dry", op: true },
  { naam: "Hybrid Ceramic Spray Coating", op: true },
  { naam: "Auto Finesse Glide (kleismeermiddel)", op: true },
  { naam: "Kleischijf", op: true },
  { naam: "Makita DPO600", op: true },
  { naam: "Kärcher SE3-18 sproei-extractor", op: true },
  { naam: "Isopropanol 99,9%", op: true },
  { naam: "Colourlock Mild Cleaner", op: true },
  { naam: "Colourlock Leather Shield", op: true },
  { naam: "Colourlock Leather Care", op: true },
  { naam: "Valma Rubber Stick", op: true },
  {
    naam: "TRG Renovating Balm zwart 300ml",
    op: true,
    notitie: "bewust niet gebruikt — kleurverschil-risico",
  },
  {
    naam: "Colourlock Leder Verzegeling",
    op: true,
    notitie: "vervangen door Leather Shield",
  },
];

const ACTIE_KEYWORDS = [
  "wasbox", "wassen", "gewassen", "voordroog", "insecten", "ijzer", "klei",
  "kleien", "polijst", "polijsten", "wax", "waxen", "seal", "sealen",
  "coating", "leer", "leder", "stuurwiel", "softtop", "kap", "raamrubber",
  "detailing", "poetsen", "gepoetst", "carnauba",
];

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni", "juli",
  "augustus", "september", "oktober", "november", "december",
];

// ---------- Persistentie ----------
export function laadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.chat) parsed.chat = [];
      return parsed;
    }
  } catch (e) {
    /* corrupte data: val terug op standaard */
  }
  return {
    entries: [],
    voorraad: JSON.parse(JSON.stringify(DEFAULT_VOORRAAD)),
    chat: [],
  };
}

export function bewaarData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ---------- API-key ----------
export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}
export function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}
export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
}

// ---------- Trefwoord-analyse (zonder AI) ----------
export function gokDatum(tekst) {
  const vandaag = new Date();
  if (/\bvandaag\b/i.test(tekst)) return vandaag.toISOString().slice(0, 10);
  if (/\bgisteren\b/i.test(tekst)) {
    const g = new Date(vandaag);
    g.setDate(g.getDate() - 1);
    return g.toISOString().slice(0, 10);
  }
  let m = tekst.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    d = d.padStart(2, "0");
    mo = mo.padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  m = tekst.match(
    new RegExp("\\b(\\d{1,2})\\s+(" + MAANDEN.join("|") + ")(?:\\s+(\\d{4}))?\\b", "i")
  );
  if (m) {
    const d = m[1].padStart(2, "0");
    const moIdx = MAANDEN.indexOf(m[2].toLowerCase());
    const mo = String(moIdx + 1).padStart(2, "0");
    const y = m[3] || String(vandaag.getFullYear());
    return `${y}-${mo}-${d}`;
  }
  return "";
}

export function gokAuto(tekst) {
  return /\bmito\b/i.test(tekst) ? "mito" : "spider";
}

export function vindTags(tekst, voorraad) {
  const laag = tekst.toLowerCase();
  const gevonden = new Set();
  voorraad.forEach((p) => {
    if (laag.includes(p.naam.toLowerCase())) gevonden.add(p.naam);
  });
  ACTIE_KEYWORDS.forEach((k) => {
    if (laag.includes(k)) gevonden.add(k);
  });
  return Array.from(gevonden);
}

// Splitst geplakte tekst op in fragmenten en houdt alleen de fragmenten over
// waarin iets herkenbaars staat (een tag of een datum).
export function analyseerTekstLokaal(ruw, voorraad) {
  let stukken = ruw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (stukken.length <= 1) {
    stukken = ruw.split(/\n/).map((s) => s.trim()).filter(Boolean);
  }
  const fragmenten = [];
  stukken.forEach((stuk) => {
    const tags = vindTags(stuk, voorraad);
    const datum = gokDatum(stuk);
    if (tags.length === 0 && !datum) return;
    fragmenten.push({
      bron: stuk,
      datum: datum || new Date().toISOString().slice(0, 10),
      auto: gokAuto(stuk),
      tags,
    });
  });
  return fragmenten;
}

// ---------- Wasstatus ----------
export function dagenGeledenTekst(datumStr) {
  const d = new Date(datumStr + "T00:00:00");
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const diff = Math.round((vandaag - d) / 86400000);
  if (diff === 0) return "vandaag";
  if (diff === 1) return "gisteren";
  if (diff < 0) return "in de toekomst";
  return diff + " dagen geleden";
}

export function laatsteWasbeurt(entries, auto) {
  const wasRegex = /was/i;
  const relevante = entries.filter(
    (e) =>
      e.auto === auto &&
      [...(e.producten || []), ...(e.acties || [])].some((t) => wasRegex.test(t))
  );
  if (relevante.length === 0) return null;
  return relevante.reduce((max, e) => (e.datum > max.datum ? e : max), relevante[0]).datum;
}

// ---------- Claude API ----------
async function callClaude(body) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Geen API-key ingesteld (zie tab Inzicht).");
  const resp = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg =
      data && data.error && data.error.message ? data.error.message : "HTTP " + resp.status;
    throw new Error(msg);
  }
  return data;
}

const EXTRACTIE_SCHEMA = {
  type: "object",
  properties: {
    fragmenten: {
      type: "array",
      items: {
        type: "object",
        properties: {
          datum: {
            type: "string",
            description:
              "Datum in YYYY-MM-DD formaat. Gebruik de datum van vandaag als er geen datum genoemd wordt.",
          },
          auto: {
            type: "string",
            enum: ["spider", "mito"],
            description: "Welke auto het betreft; standaard spider als onduidelijk.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Gebruikte producten en/of acties, bv. 'Bilt Hamber Korrosol', 'klei', 'wassen', 'leer'.",
          },
          bronfragment: {
            type: "string",
            description:
              "Het originele tekstfragment (verkort tot max 300 tekens) waarop deze entry gebaseerd is.",
          },
        },
        required: ["datum", "auto", "tags", "bronfragment"],
        additionalProperties: false,
      },
    },
  },
  required: ["fragmenten"],
  additionalProperties: false,
};

// AI-extractie van geplakte tekst -> lijst fragmenten in dezelfde vorm als
// analyseerTekstLokaal().
export async function analyseerTekstMetAI(ruw, voorraad) {
  const bekendeProducten = voorraad.map((p) => p.naam).join(", ");
  const result = await callClaude({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system:
      "Je haalt poets- en onderhoudsinformatie over auto's (Spider 916, Mito) uit vrije tekst of chatgeschiedenis (bv. een gesprek met Gemini). " +
      "Bekende producten/materialen: " +
      bekendeProducten +
      ". " +
      "Neem alleen fragmenten op die echt over poetsen, detailing of onderhoud gaan — negeer irrelevante tekst.",
    messages: [{ role: "user", content: ruw }],
    output_config: { format: { type: "json_schema", schema: EXTRACTIE_SCHEMA } },
  });
  const tekstBlok = result.content.find((b) => b.type === "text");
  const parsed = JSON.parse(tekstBlok.text);
  return (parsed.fragmenten || []).map((f) => ({
    bron: f.bronfragment,
    datum: f.datum,
    auto: f.auto === "mito" ? "mito" : "spider",
    tags: f.tags || [],
  }));
}

// Trend- en effectanalyse over de log.
export async function genereerInzicht(entries, autoFilter) {
  const compacteLog = entries.slice(0, 100).map((e) => ({
    datum: e.datum,
    auto: e.auto,
    tags: [...(e.producten || []), ...(e.acties || [])],
    notitie: e.notitie,
  }));
  const autoLabel =
    autoFilter === "alle"
      ? "beide auto's (Spider 916 en Mito)"
      : autoFilter === "mito"
      ? "de Mito"
      : "de Spider 916";
  const result = await callClaude({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system:
      "Je bent een data-analist die trends analyseert in onderhouds-/detailinglog van " +
      autoLabel +
      ". " +
      "Geef een kort, concreet verslag in het Nederlands: welke aanpak/producten het beste effect lijken te hebben, patronen in frequentie of volgorde, " +
      "en 2-3 concrete aanbevelingen. Wees bondig (maximaal ~200 woorden), gewoon platte tekst zonder markdown-opmaak.",
    messages: [{ role: "user", content: JSON.stringify(compacteLog) }],
  });
  return result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function chatSysteemPrompt(voorraad) {
  const voorraadNamen = voorraad
    .filter((p) => p.op !== false && !p.slechteErvaring)
    .map((p) => p.naam)
    .join(", ");
  const slechteErvaringen = voorraad
    .filter((p) => p.slechteErvaring)
    .map((p) => p.naam + (p.notitie ? " (" + p.notitie + ")" : ""));
  const slechteErvaringTekst = slechteErvaringen.length
    ? "- Producten waar Richard een SLECHTE ervaring mee had (raad deze niet aan, of waarschuw expliciet als ze toch relevant zijn): " +
      slechteErvaringen.join("; ") +
      ".\n"
    : "";
  return (
    "Je bent een behulpzame assistent voor Richard rond onderhoud en detailing van zijn Alfa Romeo Spider 916 (1996, 2.0i Twin Spark, zwart cabrio) en Mito (rood).\n" +
    "Achtergrondinformatie:\n" +
    "- Vaste exterieur-poetsvolgorde: wasbox (voordroog) -> Turtle Wax Insect Remover -> Bilt Hamber Korrosol (ijzer-fallout) -> klei-behandeling (kleischijf op Makita DPO600, met Auto Finesse Glide als kleismeermiddel) -> Meguiar's Ultimate Polish -> Turtle Wax Seal N Shine.\n" +
    "- Vaste leerverzorging (kleurloze aanpak, geen verven): Colourlock Mild Cleaner -> Colourlock Leather Shield -> 15 min intrekken -> Colourlock Leather Care -> 1 uur drogen -> Valma Rubber Stick voor detailwerk. Stuurwiel: spaarzaam, grip-check voor het rijden.\n" +
    "- Bekende technische aandachtspunten Spider 916: raamrubber bestuurderskant trekt naar binnen bij het laten zakken in koud weer; softtop-vervanging kost ca. €1.300-2.200 (Cabrio Care Naarden is genoteerd als specialist).\n" +
    "- Producten die Richard in voorraad heeft: " +
    voorraadNamen +
    ".\n" +
    slechteErvaringTekst +
    "Help met troubleshooten van problemen, productadvies en poets/detailing-technieken. Wees bondig en praktisch, geen overbodige inleidingen."
  );
}

export async function stuurChat(recente, voorraad) {
  const result = await callClaude({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: chatSysteemPrompt(voorraad),
    messages: recente.map((m) => ({ role: m.role, content: m.content })),
  });
  return result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
