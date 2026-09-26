// Import vanuit een CSV-export van Destiny Item Manager (DIM).
//
// Waarom: bij DIM log je gewoon in met je Bungie-account en exporteer je je
// wapens en armor als CSV — geen eigen app-registratie, API-key of Origin
// Header nodig. Dit bestand leest zo'n export en maakt er dingen van zoals de
// app ze kent, met hetzelfde instantie-id als de Bungie-API gebruikt, zodat
// een latere koppeling er naadloos op aansluit.
//
// Opzet: tolerant. Kolommen worden op naam herkend (hoofdletters maken niet
// uit) en wat we niet kennen laten we staan; verandert DIM een keer iets, dan
// mist er hooguit een veld in plaats van dat alles stukloopt.

import { norm, WEAPON_TYPES, ELEMENTS, RARITIES, CLASSES } from "./destiny.js";

// -- CSV lezen -------------------------------------------------------------

// Kleine, volledige CSV-lezer: velden tussen aanhalingstekens, ontsnapte
// aanhalingstekens ("" binnen een veld) en regeleindes binnen een veld.
// Welk teken scheidt de velden? DIM schrijft komma's, maar wie het bestand
// eerst in Excel of Google Sheets opent en de inhoud kopieert, krijgt tabs of
// puntkomma's. We kijken naar de kopregel en nemen wat daar het meest in staat.
export function bepaalScheidingsteken(text) {
  const kop = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
  const buitenQuotes = kop.replace(/"[^"]*"/g, "");
  const tellen = { ",": 0, ";": 0, "\t": 0 };
  for (const c of buitenQuotes) if (c in tellen) tellen[c] += 1;
  const beste = Object.entries(tellen).sort((a, b) => b[1] - a[1])[0];
  return beste[1] > 0 ? beste[0] : ",";
}

export function parseCsv(text, scheidingsteken) {
  const rijen = [];
  let rij = [];
  let veld = "";
  let inQuotes = false;
  const schoon = String(text || "").replace(/^﻿/, ""); // byte-order mark
  const sep = scheidingsteken || bepaalScheidingsteken(schoon);

  for (let i = 0; i < schoon.length; i++) {
    const c = schoon[i];
    if (inQuotes) {
      if (c === '"') {
        if (schoon[i + 1] === '"') {
          veld += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        veld += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      rij.push(veld);
      veld = "";
    } else if (c === "\n") {
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = "";
    } else if (c === "\r") {
      /* overslaan; \r\n wordt afgehandeld door de \n */
    } else {
      veld += c;
    }
  }
  if (veld.length || rij.length) {
    rij.push(veld);
    rijen.push(rij);
  }
  return rijen.filter((r) => r.some((v) => String(v).trim() !== ""));
}

// Van regels naar objecten met de kolomnaam als sleutel (genormaliseerd).
export function toObjects(rijen) {
  if (!rijen.length) return { kolommen: [], rijen: [] };
  const kolommen = rijen[0].map((k) => norm(k));
  const uit = rijen.slice(1).map((r) => {
    const o = {};
    kolommen.forEach((k, i) => {
      if (k) o[k] = (r[i] ?? "").trim();
    });
    return o;
  });
  return { kolommen, rijen: uit };
}

// -- Vertaling naar het model van de app -----------------------------------

// DIM schrijft Engelse typenamen; onze armor-namen zijn Nederlands.
const ARMOR_TYPE_MAP = {
  helmet: "Helm",
  gauntlets: "Handschoenen",
  "chest armor": "Bruststuk",
  "leg armor": "Beenstukken",
  "class armor": "Klasse-item",
  "hunter cloak": "Klasse-item",
  "titan mark": "Klasse-item",
  "warlock bond": "Klasse-item",
};

function waarde(rij, ...namen) {
  for (const n of namen) {
    const v = rij[norm(n)];
    if (v != null && v !== "") return v;
  }
  return "";
}

const jaNee = (v) => /^(true|ja|yes|1)$/i.test(String(v).trim());

// DIM zet soms een apostrof voor lange getallen zodat Excel ze niet verhaspelt.
const schoonId = (v) => String(v || "").replace(/^['"]+|['"]+$/g, "").trim();

function bepaalSoort(type, categorie) {
  const t = norm(type);
  if (ARMOR_TYPE_MAP[t]) return "armor";
  if (WEAPON_TYPES.some((w) => norm(w.name) === t)) return "wapen";
  const c = norm(categorie);
  if (c.includes("armor")) return "armor";
  if (c.includes("weapon")) return "wapen";
  return null;
}

function bepaalType(type, soort) {
  const t = norm(type);
  if (soort === "armor") return ARMOR_TYPE_MAP[t] || type;
  const weapon = WEAPON_TYPES.find((w) => norm(w.name) === t);
  return weapon ? weapon.name : type;
}

function bepaalLocatie(owner, characters, platform) {
  const o = norm(owner);
  if (!o || o.includes("vault") || o.includes("kluis")) return "kluis";
  const klasse = CLASSES.find((c) => o.includes(norm(c.name)) || c.syn.some((s) => o.includes(norm(s))));
  if (!klasse) return "kluis";
  const kar = characters.find((c) => c.platform === platform && norm(c.cls) === norm(klasse.name));
  return kar ? kar.id : "kluis";
}

// Alle kolommen die perks bevatten, op volgorde ("Perks 0", "Perks 1", …).
function perksUit(rij, kolommen) {
  const namen = kolommen.filter((k) => k.startsWith("perks") || k === "traits" || k === "perk");
  const waarden = namen.map((k) => rij[k]).filter((v) => v && v.trim());
  return [...new Set(waarden.join(", ").split(/\s*,\s*/).filter(Boolean))].join(" / ").slice(0, 300);
}

export function mapDimRows(csvTekst, { platform, characters = [] } = {}) {
  const { kolommen, rijen } = toObjects(parseCsv(csvTekst));
  if (!kolommen.length) {
    return { items: [], diagnose: { rijen: 0, herkend: 0, reden: "Het bestand bevat geen kolommen." } };
  }
  if (!kolommen.includes("name")) {
    return {
      items: [],
      diagnose: {
        rijen: rijen.length,
        herkend: 0,
        reden: "Geen kolom 'Name' gevonden — is dit wel de wapen- of armor-export van DIM?",
        kolommen,
      },
    };
  }

  let zonderNaam = 0;
  let overig = 0;
  const items = [];
  for (const rij of rijen) {
    const name = waarde(rij, "Name", "Item Name");
    if (!name) {
      zonderNaam += 1;
      continue;
    }
    const type = waarde(rij, "Type", "Item Type", "Item Category");
    // Kennen we het type niet (ghosts, sparrows, schepen, een nieuw soort
    // uitrusting), dan komt het onder "Overig" te staan. Weggooien zou het
    // stilletjes laten verdwijnen, en dan lijkt je export half leeg.
    const soort = bepaalSoort(type, waarde(rij, "Category")) || "overig";
    if (soort === "overig") overig += 1;

    // DIM heeft deze kolom ooit hernoemd: oudere exports schrijven "Tier",
    // nieuwere "Rarity". Zonder allebei blijft je hele kluis zonder rarity
    // staan en telt de app nul exotics.
    const tier = waarde(rij, "Tier", "Rarity", "Quality");
    const rarity = RARITIES.find((r) => norm(r.name) === norm(tier));
    const elementRuw = waarde(rij, "Element", "Damage Type", "Damage", "Energy");
    const element = ELEMENTS.find((e) => norm(e.name) === norm(elementRuw));
    const klasseRuw = waarde(rij, "Equippable", "Class", "Class Type");
    const klasse = CLASSES.find((c) => norm(c.name) === norm(klasseRuw));
    const mwTier = Number(waarde(rij, "Masterwork Tier")) || 0;
    const dimTag = norm(waarde(rij, "Tag"));

    const tags = [];
    if (jaNee(waarde(rij, "Locked")) || dimTag === "favorite") tags.push("favoriet");
    if (mwTier >= 10 || norm(waarde(rij, "Masterwork Type")) === "masterwork") tags.push("masterwork");
    if (dimTag === "junk") tags.push("wegdoen");
    if (dimTag === "pvp") tags.push("PvP");
    if (dimTag === "pve") tags.push("PvE");

    items.push({
      // Zonder Id kunnen we niet netjes samenvoegen; dan maken we er zelf een
      // die bij een volgende export hetzelfde blijft.
      instanceId:
        schoonId(waarde(rij, "Id", "Item Id", "Instance Id")) ||
        `dim:${schoonId(waarde(rij, "Hash")) || norm(name)}:${norm(waarde(rij, "Owner", "Character", "Location"))}`,
      bungieHash: schoonId(waarde(rij, "Hash")) || null,
      platform,
      kind: soort,
      name: name.slice(0, 120),
      type: bepaalType(type, soort),
      element: soort === "wapen" && element ? element.name : "",
      rarity: rarity ? rarity.name : tier,
      charClass: soort === "armor" && klasse ? klasse.name : "",
      power: Number(waarde(rij, "Power", "Power Level", "Light")) || null,
      location: bepaalLocatie(waarde(rij, "Owner", "Character", "Location"), characters, platform),
      perks: soort === "wapen" ? perksUit(rij, kolommen) : "",
      notes: waarde(rij, "Notes").slice(0, 600),
      tags: [...new Set(tags)],
      locked: jaNee(waarde(rij, "Locked")),
      bron: "dim",
    });
  }

  return {
    items,
    diagnose: {
      rijen: rijen.length,
      herkend: items.length,
      overig,
      zonderNaam,
      zonderId: items.filter((i) => !i.instanceId).length,
      kolommen,
    },
  };
}
