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

// De paragraaf met de omschrijving heeft in het sjabloon dit vaste paraId —
// een foto wordt daar direct achter geplakt, in dezelfde tabelcel.
const OMSCHRIJVING_PARA_ID = "4225DD84";
const FOTO_REL_ID = "rIdMeldingFoto";
const FOTO_MEDIA_PATH = "word/media/melding-foto.jpg";
const EMU_PER_INCH = 914400;
const MAX_PHOTO_WIDTH_EMU = Math.round(4.4 * EMU_PER_INCH);

function imageSize(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto-afmetingen lezen lukte niet"));
    };
    img.src = url;
  });
}

async function embedPhoto(zip, xml, blob) {
  const { width, height } = await imageSize(blob);
  const cx = MAX_PHOTO_WIDTH_EMU;
  const cy = Math.round(cx * (height / width));

  zip.file(FOTO_MEDIA_PATH, blob);

  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = await zip.file(contentTypesPath).async("string");
  if (!contentTypes.includes('Extension="jpg"') && !contentTypes.includes('Extension="jpeg"')) {
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Default Extension="jpg" ContentType="image/jpeg"/></Types>'
    );
  }
  zip.file(contentTypesPath, contentTypes);

  const relsPath = "word/_rels/document.xml.rels";
  let rels = await zip.file(relsPath).async("string");
  rels = rels.replace(
    "</Relationships>",
    `<Relationship Id="${FOTO_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/melding-foto.jpg"/></Relationships>`
  );
  zip.file(relsPath, rels);

  const photoParagraphs =
    '<w:p><w:pPr><w:pStyle w:val="Broodtekst"/><w:spacing w:before="120"/><w:ind w:left="0"/></w:pPr>' +
    '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Foto van de situatie:</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Broodtekst"/><w:ind w:left="0"/></w:pPr><w:r><w:drawing>' +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="9001" name="MeldingFoto"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:nvPicPr><pic:cNvPr id="9001" name="MeldingFoto"/><pic:cNvPicPr/></pic:nvPicPr>' +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${FOTO_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";

  const anchor = new RegExp(`(<w:p w14:paraId="${OMSCHRIJVING_PARA_ID}"[\\s\\S]*?</w:p>)`);
  if (!anchor.test(xml)) throw new Error("Kon de plek voor de foto in het sjabloon niet vinden");
  return xml.replace(anchor, `$1${photoParagraphs}`);
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

  if (entry.blob) {
    xml = await embedPhoto(zip, xml, entry.blob);
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
