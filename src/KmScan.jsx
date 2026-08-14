import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, X, Loader2 } from "lucide-react";

/**
 * Km-stand scannen: camera openen, cijfers herkennen met Tesseract.js (alleen
 * op het apparaat, geen server nodig), en altijd een korte controle vóór het
 * opslaan — OCR kan een cijfer missen of verzinnen, dus blind overnemen is te
 * riskant voor iets dat de kilometerstand van de auto bepaalt.
 */
export default function KmScan({ carName, onSave, onClose }) {
  const fileRef = useRef(null);
  const workerRef = useRef(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | working | done
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      workerRef.current?.terminate?.();
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWorker = async () => {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
    workerRef.current = worker;
    return worker;
  };

  const openCamera = () => fileRef.current?.click();

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setValue("");
    setImgUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setStatus("working");
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(file);
      // Odometers zijn de langste cijferreeks in beeld; kortere getallen zijn
      // vaak een klokje, ronde-teller of storingscode elders op het dashboard.
      const digits = (data.text.match(/\d+/g) || []).sort((a, b) => b.length - a.length)[0] || "";
      setValue(digits);
    } catch {
      setError("Herkennen lukte niet. Typ de km-stand zelf over, of probeer een scherpere foto.");
    } finally {
      setStatus("done");
    }
  };

  const save = () => {
    const km = parseInt(value, 10);
    if (!isNaN(km) && km >= 0) onSave(km);
  };

  return (
    <div className="dl-photo-overlay" onClick={onClose}>
      <div className="dl-photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Km-stand scannen — {carName}</div>
          <button className="dl-check" onClick={onClose} aria-label="Sluiten">
            <X size={14} color="#52606e" />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhoto}
        />

        {!imgUrl && (
          <button
            className="dl-btn-primary w-full py-10 flex flex-col items-center gap-3 text-sm"
            onClick={openCamera}
          >
            <Camera size={30} />
            Richt op de km-teller en maak een foto
          </button>
        )}

        {imgUrl && (
          <>
            <img className="dl-photo-modal-img" src={imgUrl} alt="Foto van de km-stand" />

            {status === "working" && (
              <div className="text-sm opacity-70 mt-3 flex items-center gap-2">
                <Loader2 size={16} className="dl-spin" /> Cijfers herkennen…
              </div>
            )}

            {status === "done" && (
              <>
                {error && <div className="text-xs mt-3" style={{ color: "#b3362a" }}>{error}</div>}
                <label className="text-xs opacity-70 mt-3 block">Klopt deze km-stand?</label>
                <input
                  className="dl-input px-3 py-2 text-lg w-full mt-1 text-center"
                  inputMode="numeric"
                  placeholder="km-stand"
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                  aria-label="Herkende kilometerstand, controleer en pas aan indien nodig"
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button
                    className="dl-btn-ghost flex-1 py-2 flex items-center justify-center gap-1.5 text-sm"
                    onClick={openCamera}
                  >
                    <RotateCcw size={14} /> Overnieuw
                  </button>
                  <button
                    className="dl-btn-primary flex-1 py-2 flex items-center justify-center gap-1.5 text-sm"
                    onClick={save}
                    disabled={!value}
                  >
                    <Check size={14} /> Opslaan
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
