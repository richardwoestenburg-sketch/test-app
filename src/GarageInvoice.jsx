import React, { useRef, useState } from "react";
import { FileText, X, Check, Loader2, Paperclip } from "lucide-react";
import { parseInvoiceText, LOG_TYPES } from "./garage.js";

const TYPE_LABELS = {
  onderhoud: "Onderhoud",
  reparatie: "Reparatie",
  apk: "APK",
  overig: "Overig",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PDF-rekening van de garage inlezen: kiezen, tekst eruit halen (pdf.js) en
 * er zo goed mogelijk datum/km-stand/bedrag/soort uit afleiden. Altijd eerst
 * ter controle tonen — een heuristiek op vrije tekst kan misgokken, en dit
 * bepaalt mee de km-stand en het logboek van de auto.
 */
export default function GarageInvoice({ carName, defaultKm, onSave, onClose }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | working | done
  const [text, setText] = useState("");
  const [km, setKm] = useState("");
  const [type, setType] = useState("reparatie");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(null);
  const [error, setError] = useState("");

  const pick = () => fileRef.current?.click();

  const onChosen = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setError("");
    setStatus("working");
    try {
      // Pas laden zodra 'm nodig is: pdf.js (+ worker) is fors qua omvang en
      // hoeft niet in de hoofdbundel te zitten voor wie nooit een rekening scant.
      const { extractPdfText } = await import("./pdfText.js");
      const raw = await extractPdfText(f);
      const parsed = parseInvoiceText(raw);
      setKm(parsed.km != null ? String(parsed.km) : defaultKm != null ? String(defaultKm) : "");
      setType(parsed.type);
      setDate(parsed.date || today());
      setAmount(parsed.amount);
      setText(`Rekening${parsed.amount != null ? ` (€${parsed.amount.toFixed(2)})` : ""}: ${parsed.summary || f.name}`);
      if (!parsed.summary) setError("Geen tekst gevonden in deze PDF (waarschijnlijk een scan). Vul zelf in.");
    } catch {
      setError("Kon de PDF niet lezen. Vul de gegevens zelf in — de bon wordt wel bewaard.");
      setDate(today());
      setText(`Rekening: ${f.name}`);
    } finally {
      setStatus("done");
    }
  };

  const save = () => {
    if (!file) return;
    onSave({
      file,
      text: text.trim() || "Rekening",
      km: km.trim() === "" ? null : Math.max(0, parseInt(km, 10) || 0),
      type,
      date,
    });
  };

  return (
    <div className="dl-photo-overlay" onClick={onClose}>
      <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Rekening toevoegen — {carName}</div>
          <button className="dl-check" onClick={onClose} aria-label="Sluiten">
            <X size={14} color="#52606e" />
          </button>
        </div>

        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onChosen} />

        {!file && (
          <button
            className="dl-btn-primary w-full py-10 flex flex-col items-center gap-3 text-sm"
            onClick={pick}
          >
            <FileText size={30} />
            Kies de PDF-rekening
          </button>
        )}

        {file && (
          <>
            <div className="dl-ag-item px-3 py-2 flex items-center gap-2 text-sm mt-1">
              <Paperclip size={14} className="opacity-60 shrink-0" />
              <span className="truncate">{file.name}</span>
            </div>

            {status === "working" && (
              <div className="text-sm opacity-70 mt-3 flex items-center gap-2">
                <Loader2 size={16} className="dl-spin" /> Rekening lezen…
              </div>
            )}

            {status === "done" && (
              <>
                {error && <div className="text-xs mt-3" style={{ color: "#b3362a" }}>{error}</div>}

                <label className="text-xs opacity-70 mt-3 block">Omschrijving</label>
                <textarea
                  className="dl-input px-3 py-2 text-sm w-full mt-1"
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 400))}
                  aria-label="Omschrijving van de rekening"
                />

                <div className="flex gap-2 mt-2">
                  <select
                    className="dl-input text-xs px-2 py-2"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    aria-label="Soort"
                  >
                    {LOG_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <input
                    className="dl-input px-2 py-2 text-xs w-20"
                    inputMode="numeric"
                    placeholder="km"
                    value={km}
                    onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))}
                    aria-label="Kilometerstand bij deze rekening"
                  />
                  <input
                    type="date"
                    className="dl-input px-2 py-2 text-xs flex-1 min-w-0"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Datum van de rekening"
                  />
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    className="dl-btn-ghost flex-1 py-2 flex items-center justify-center gap-1.5 text-sm"
                    onClick={pick}
                  >
                    Andere PDF
                  </button>
                  <button
                    className="dl-btn-primary flex-1 py-2 flex items-center justify-center gap-1.5 text-sm"
                    onClick={save}
                  >
                    <Check size={14} /> Opslaan in logboek
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
