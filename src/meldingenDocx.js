// Vult het echte Eurosort-ongevallenmeldingsformulier (public/templates/…)
// client-side in met de ingevulde gegevens en levert een 1-op-1 kopie van
// het originele Word-document op als downloadbare .docx — geen server nodig.
// Het sjabloon bevat platte [[TOKEN]]-placeholders op de plek van elk
// invulveld (zie scratchpad-notities bij het aanmaken ervan); de vier
// "soort incident"-selectievakjes worden aangesproken via hun vaste
// content-control id uit het origineel.
import JSZip from "jszip";

const TEMPLATE_URL = "templates/ongevallen-melding-template.docx";

const CHECKBOX_IDS = {
  ongeval: "1508090336",
  bijna_ongeval: "-214512178",
  onveilige_situatie: "1349753424",
  schade: "-341856207",
};

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Elke placeholder-token zit al binnen een bestaande <w:t xml:space="preserve">…
// </w:t> in het sjabloon (soms met letterlijke tekst ervoor, zoals
// "Naam: [[BETROKKENE_NAAM]]"), dus deze functie levert alleen de
// tekstinhoud — geen eigen <w:t>-wrapper. Regeleinden worden gesplitst met
// </w:t><w:br/><w:t …>, wat geldig is omdat dat de omringende <w:t> opnieuw
// opent binnen dezelfde <w:r>.
function toRunXml(value) {
  return escapeXml(value || "").split("\n").join('</w:t><w:br/><w:t xml:space="preserve">');
}

// Sommige placeholders staan alleen in hun run (bv. de omschrijving), andere
// zitten inline achter letterlijke tekst (bv. "Naam: [[BETROKKENE_NAAM]]") —
// dus vervang de kale token-tekst zelf, waar die ook in de run voorkomt.
function replaceToken(xml, token, value) {
  return xml.split(token).join(toRunXml(value));
}

function toggleCheckbox(xml, sdtId, checked) {
  const pattern = new RegExp(
    `(<w:sdt><w:sdtPr><w:id w:val="${sdtId.replace("-", "\\-")}"/><w14:checkbox><w14:checked w14:val=")[01](".*?<w:t>)[☐☒](</w:t>)`,
    "s"
  );
  return xml.replace(pattern, (_, pre, mid, post) => `${pre}${checked ? "1" : "0"}${mid}${checked ? "☒" : "☐"}${post}`);
}

function formatDatum(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export async function fillTemplate(entry) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Sjabloon laden lukte niet");
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");

  xml = replaceToken(xml, "[[MELDER_NAAM]]", entry.melderNaam);
  xml = replaceToken(xml, "[[MELDER_FUNCTIE]]", entry.melderFunctie);
  xml = replaceToken(xml, "[[DATUM_TIJD]]", `${formatDatum(entry.date)} ${entry.timeLabel}`);
  xml = replaceToken(xml, "[[LOCATIE]]", entry.locatie);
  xml = replaceToken(xml, "[[OMSCHRIJVING]]", entry.omschrijving);
  xml = replaceToken(xml, "[[BETROKKENE_NAAM]]", entry.betrokkeneNaam);
  xml = replaceToken(xml, "[[BETROKKENE_ADRES]]", entry.betrokkeneAdres);
  xml = replaceToken(xml, "[[BETROKKENE_POSTCODE]]", entry.betrokkenePostcode);
  xml = replaceToken(xml, "[[BETROKKENE_GEBOORTEDATUM]]", entry.betrokkeneGeboortedatum);
  xml = replaceToken(xml, "[[BETROKKENE_INDIENSTTREDING]]", entry.betrokkeneIndiensttreding);
  xml = replaceToken(xml, "[[BETROKKENE_AFDELING]]", entry.betrokkeneAfdeling);
  xml = replaceToken(xml, "[[BETROKKENE_EIGEN_OF_ANDERS]]", entry.betrokkeneEigenOfAnders);
  xml = replaceToken(xml, "[[MAATREGELEN]]", entry.maatregelen);
  xml = replaceToken(xml, "[[ACTIE_LEIDINGGEVENDE]]", entry.actieLeidinggevende);

  for (const [key, sdtId] of Object.entries(CHECKBOX_IDS)) {
    xml = toggleCheckbox(xml, sdtId, entry.soorten.includes(key));
  }

  zip.file("word/document.xml", xml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function downloadFilename(entry) {
  const safe = (entry.locatie || "melding").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `ongevallenmelding-${entry.date}-${safe || "melding"}.docx`;
}
