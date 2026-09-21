import React, { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  HardDrive,
  Trash2,
  Undo2,
  Clock,
  AlertTriangle,
  Check,
  X,
  Smartphone,
  FolderOpen,
} from "lucide-react";
import {
  BRONNEN,
  TRASH_DAGEN,
  laadInstellingen,
  bewaarInstellingen,
  bewaarBronInstelling,
  laadLog,
  wisLog,
  scanAlles,
  ruimOp,
  leesPrullenbakAlles,
  zetTerug,
  leegPrullenbak,
  opslagInfo,
  registreerAchtergrond,
  fmtBytes,
  fmtDatum,
} from "./opruim.js";
import { nativeBeschikbaar, nativeStatus, vraagNativeToestemming } from "./opruimNative.js";

const BAK_ZICHTBAAR = 8;
const LOG_ZICHTBAAR = 5;

function dagenLabel(dagen) {
  if (!dagen) return "alles";
  if (dagen === 1) return "ouder dan 1 dag";
  if (dagen < 30) return `ouder dan ${dagen} dagen`;
  if (dagen === 365) return "ouder dan 1 jaar";
  if (dagen === 730) return "ouder dan 2 jaar";
  const maanden = Math.round(dagen / 30);
  return `ouder dan ${maanden} ${maanden === 1 ? "maand" : "maanden"}`;
}

const KNOP_TEKST = {
  idle: "Opruimen",
  scannen: "Kijken…",
  plan: "Verwijderen",
  opruimen: "Bezig…",
  klaar: "Opruimen",
};

export default function Opruim() {
  const [instellingen, setInstellingen] = useState(laadInstellingen);
  const [status, setStatus] = useState("idle");
  const [plan, setPlan] = useState(null);
  const [resultaat, setResultaat] = useState(null);
  const [opslag, setOpslag] = useState(null);
  const [bak, setBak] = useState([]);
  const [log, setLog] = useState(laadLog);
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [achtergrond, setAchtergrond] = useState(false);
  // Alleen gevuld als de app als Android-app draait; in de browser blijft dit null.
  const [telefoon, setTelefoon] = useState(null);

  const ververs = useCallback(async () => {
    setOpslag(await opslagInfo());
    setBak(await leesPrullenbakAlles());
    setLog(laadLog());
    if (nativeBeschikbaar()) setTelefoon(await nativeStatus());
  }, []);

  useEffect(() => {
    ververs();
  }, [ververs]);

  useEffect(() => {
    if (!instellingen.automatisch) return;
    registreerAchtergrond().then(setAchtergrond);
  }, [instellingen.automatisch]);

  const voerUit = useCallback(
    async (scan) => {
      setStatus("opruimen");
      setFout("");
      try {
        const res = await ruimOp(scan, { modus: "handmatig" });
        setResultaat(res);
        setPlan(null);
        setStatus("klaar");
        // Na de eerste geslaagde ronde weet je wat de knop doet, dus dan mag
        // het ook echt in één druk. Terugzetten kan onder "Wat wordt opgeruimd".
        if (instellingen.bevestigen) {
          setInstellingen(bewaarInstellingen({ bevestigen: false }));
          setMelding("Voortaan ruimt één druk meteen op. Wil je eerst blijven kijken? Zet het hieronder weer aan.");
        }
        await ververs();
      } catch (e) {
        setFout(e?.message || "Opruimen is niet gelukt.");
        setStatus("idle");
      }
    },
    [instellingen.bevestigen, ververs]
  );

  const drukKnop = useCallback(async () => {
    setMelding("");
    setFout("");
    if (status === "plan" && plan) {
      await voerUit(plan);
      return;
    }
    setResultaat(null);
    setStatus("scannen");
    try {
      const scan = await scanAlles(instellingen);
      setOpslag(scan.opslag);
      if (!scan.aantal) {
        setPlan(null);
        setStatus("idle");
        setMelding("Niets te doen — er staat geen rommel klaar.");
        return;
      }
      if (instellingen.bevestigen) {
        setPlan(scan);
        setStatus("plan");
        return;
      }
      await voerUit(scan);
    } catch (e) {
      setFout(e?.message || "Kon niet nakijken wat er op te ruimen valt.");
      setStatus("idle");
    }
  }, [instellingen, plan, status, voerUit]);

  const annuleer = () => {
    setPlan(null);
    setStatus("idle");
    setMelding("Niets verwijderd.");
  };

  const wisselBron = (key) => (e) => {
    setInstellingen(bewaarBronInstelling(key, { aan: e.target.checked }));
    setPlan(null);
    if (status === "plan") setStatus("idle");
  };

  const kiesDagen = (key) => (e) => {
    setInstellingen(bewaarBronInstelling(key, { dagen: Number(e.target.value) }));
    setPlan(null);
    if (status === "plan") setStatus("idle");
  };

  const terug = async (regel) => {
    await zetTerug(regel);
    setMelding(`"${regel.label}" staat weer terug.`);
    await ververs();
  };

  const geefToegang = async () => {
    const gelukt = await vraagNativeToestemming();
    setTelefoon(await nativeStatus());
    setMelding(
      gelukt
        ? "Toegang geregeld — de knop ruimt nu ook de opslag van je telefoon op."
        : "Zonder die toegang blijft het bij de gegevens van de app zelf."
    );
  };

  const bakLegen = async () => {
    const weg = await leegPrullenbak();
    setMelding(weg.aantal ? `Prullenbak geleegd — ${fmtBytes(weg.bytes)} vrij.` : "De prullenbak was al leeg.");
    await ververs();
  };

  const webBronnen = BRONNEN.filter((b) => !b.native);
  const telBronnen = BRONNEN.filter((b) => b.native);

  const bronRegel = (bron) => {
    const inst = instellingen.bronnen[bron.key] || {};
    return (
      <div key={bron.key} className="op-bron">
        <div className="op-bron-kop">
          {/* De keuzelijst staat bewust buiten het label, anders zet elke tik
              erop ook het vinkje om. */}
          <label className="op-bron-naam">
            <input
              type="checkbox"
              checked={bron.altijd ? true : !!inst.aan}
              disabled={!!bron.altijd}
              onChange={wisselBron(bron.key)}
            />
            <span className="text-sm font-medium">{bron.naam}</span>
          </label>
          {bron.dagen && (
            <select
              className="dl-input text-xs px-2 py-1.5"
              value={inst.dagen ?? bron.standaardDagen ?? 0}
              onChange={kiesDagen(bron.key)}
            >
              {bron.dagen.map((d) => (
                <option key={d} value={d}>
                  {dagenLabel(d)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="text-xs opacity-60 mt-1 ml-7">{bron.uitleg}</div>
      </div>
    );
  };

  const bezig = status === "scannen" || status === "opruimen";
  // Wat naar de prullenbak ging telt nog mee in je opslag tot die geleegd is —
  // dat hoort de uitkomst te vermelden, anders klopt de opslagmeter gevoelsmatig niet.
  const inPrullenbak =
    !!resultaat && BRONNEN.some((b) => b.terugzetbaar && resultaat.per[b.key]?.aantal);
  const bakBytes = bak.reduce((som, r) => som + (r.bytes || 0), 0);
  const opslagPct = opslag ? Math.min(100, Math.round((opslag.gebruikt / opslag.quota) * 100)) : null;

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {/* Opslag + laatste ronde */}
      <div className="flex items-center justify-between gap-2 mb-3 text-xs opacity-70">
        <div className="flex items-center gap-1.5">
          <HardDrive size={12} />
          {opslag
            ? `${fmtBytes(opslag.gebruikt)} van ${fmtBytes(opslag.quota)} in gebruik`
            : "opslaggebruik onbekend"}
        </div>
        <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={ververs}>
          <RefreshCw size={13} />
          Ververs
        </button>
      </div>
      {opslagPct != null && (
        <div className="dl-bar mb-4">
          <div className="dl-bar-fill" style={{ width: `${Math.max(2, opslagPct)}%` }} />
        </div>
      )}

      {/* De knop */}
      <div className="op-knop-wrap">
        <button className="op-knop" onClick={drukKnop} disabled={bezig}>
          <Sparkles size={34} className={bezig ? "dl-spin" : ""} />
          <span className="op-knop-tekst">{KNOP_TEKST[status]}</span>
          {status === "plan" && plan && (
            <span className="op-knop-sub">
              {plan.aantal} items · {fmtBytes(plan.bytes)}
            </span>
          )}
        </button>
        {status === "plan" && (
          <button className="dl-btn-ghost text-xs px-3 py-1.5 mt-3 flex items-center gap-1.5" onClick={annuleer}>
            <X size={13} />
            Toch niet
          </button>
        )}
      </div>

      {melding && <div className="op-melding mb-3">{melding}</div>}
      {fout && (
        <div className="op-melding op-melding-fout mb-3 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          {fout}
        </div>
      )}

      {/* Droogloop: wat zou er weg gaan */}
      {status === "plan" && plan && (
        <div className="dl-card p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3">Dit gaat weg</div>
          {plan.bronnen
            .filter((b) => b.aantal > 0)
            .map((b) => (
              <div key={b.key} className="op-rij">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{b.naam}</div>
                  <div className="text-xs opacity-60 truncate">
                    {b.items
                      .slice(0, 3)
                      .map((i) => i.label)
                      .join(" · ")}
                    {b.aantal > 3 && ` · +${b.aantal - 3}`}
                  </div>
                </div>
                <div className="text-xs text-right flex-shrink-0">
                  <div className="dl-mono">{fmtBytes(b.bytes)}</div>
                  <div className="opacity-55">{b.aantal}×</div>
                </div>
              </div>
            ))}
          <div className="text-xs opacity-60 mt-3">
            Wat terug te zetten is gaat naar de prullenbak en blijft daar {TRASH_DAGEN} dagen staan.
          </div>
        </div>
      )}

      {/* Uitkomst */}
      {status === "klaar" && resultaat && (
        <div className="op-resultaat mb-4">
          <div className="op-resultaat-icon">
            <Check size={26} />
          </div>
          <div className="flex-1">
            <div className="dl-serif text-lg font-semibold">{fmtBytes(resultaat.bytes)} vrijgemaakt</div>
            <div className="text-sm opacity-80 mt-0.5">
              {resultaat.aantal} items opgeruimd
              {resultaat.fouten.length > 0 && ` · ${resultaat.fouten.length} overgeslagen`}
            </div>
            {inPrullenbak && (
              <div className="text-xs opacity-75 mt-1">
                Staat nog {TRASH_DAGEN} dagen in de prullenbak — pas daarna is die ruimte echt vrij.
              </div>
            )}
            {resultaat.fouten.map((f) => (
              <div key={f} className="text-xs mt-1" style={{ color: "#b3362a" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wat wordt opgeruimd */}
      <div className="dl-card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3">
          Wat wordt opgeruimd {telefoon && <span className="opacity-70">· in de app</span>}
        </div>
        {webBronnen.map(bronRegel)}
      </div>

      {/* Alleen op de telefoon: de gedeelde opslag */}
      {telefoon && (
        <div className="dl-card p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3 flex items-center gap-1.5">
            <Smartphone size={13} />
            Op je telefoon
          </div>
          {telefoon.toestemming ? (
            <>
              {telBronnen.map(bronRegel)}
              <div className="text-xs opacity-55 mt-3 flex items-start gap-1.5">
                <FolderOpen size={13} className="mt-0.5 flex-shrink-0" />
                {telefoon.wortel || "gedeelde opslag"} · je camera, documenten, muziek en
                chat-mappen blijven altijd buiten schot, net als alles van de afgelopen
                3 dagen.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm">Geef toegang tot je bestanden</div>
              <div className="text-xs opacity-60 mt-1 mb-3">
                Zonder die toestemming kan de app alleen zijn eigen gegevens opruimen.
                Android zet je hiervoor naar een instellingenscherm; daarna kun je terug.
              </div>
              <button className="dl-btn-primary text-sm px-4 py-2" onClick={geefToegang}>
                Toegang geven
              </button>
            </>
          )}
        </div>
      )}

      {/* Instellingen van de knop zelf */}
      <div className="dl-card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-3">De knop</div>
        <label className="op-bron-kop mb-2">
          <input
            type="checkbox"
            checked={!!instellingen.bevestigen}
            onChange={(e) => setInstellingen(bewaarInstellingen({ bevestigen: e.target.checked }))}
          />
          <span className="text-sm flex-1">Eerst laten zien wat er weg gaat</span>
        </label>
        <label className="op-bron-kop">
          <input
            type="checkbox"
            checked={!!instellingen.automatisch}
            onChange={(e) => setInstellingen(bewaarInstellingen({ automatisch: e.target.checked }))}
          />
          <span className="text-sm flex-1">Vanzelf opruimen, hooguit één keer per dag</span>
        </label>
        <div className="text-xs opacity-60 mt-2 ml-7">
          {!instellingen.automatisch
            ? "Staat uit: opruimen gebeurt alleen als je op de knop drukt."
            : telefoon
              ? "Draait zodra je een van de apps opent. Helemaal zonder de app te openen — een knop in je snelinstellingen en een vaste ronde 's nachts — is de volgende stap."
              : achtergrond
                ? "Draait op de achtergrond én zodra je een Daglog-app opent."
                : "Draait zodra je een Daglog-app opent. Echt op de achtergrond kan pas als je de app installeert."}
        </div>
      </div>

      {/* Prullenbak */}
      <div className="dl-card p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60">
            Prullenbak · {bak.length} items · {fmtBytes(bakBytes)}
          </div>
          {bak.length > 0 && (
            <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={bakLegen}>
              <Trash2 size={13} />
              Nu legen
            </button>
          )}
        </div>
        {bak.length === 0 && <div className="text-xs opacity-60">Leeg. Alles wat je opruimt komt hier eerst terecht.</div>}
        {bak.slice(0, BAK_ZICHTBAAR).map((regel) => (
          <div key={regel.id} className="op-rij">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{regel.label}</div>
              <div className="text-xs opacity-55 truncate">
                {regel.soort === "telefoon" ? regel.pad : regel.bron} · {fmtDatum(regel.verwijderdOp)} ·{" "}
                {fmtBytes(regel.bytes)}
              </div>
            </div>
            <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => terug(regel)}>
              <Undo2 size={13} />
              Terug
            </button>
          </div>
        ))}
        {bak.length > BAK_ZICHTBAAR && (
          <div className="text-xs opacity-55 mt-2">+{bak.length - BAK_ZICHTBAAR} meer</div>
        )}
        {bak.length > 0 && (
          <div className="text-xs opacity-60 mt-3">
            Wordt na {TRASH_DAGEN} dagen vanzelf definitief gewist.
          </div>
        )}
      </div>

      {/* Logboek */}
      <div className="dl-card p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60">Eerdere rondes</div>
          {log.length > 0 && (
            <button className="dl-btn-ghost text-xs px-3 py-1.5" onClick={() => setLog(wisLog())}>
              Wissen
            </button>
          )}
        </div>
        {log.length === 0 && <div className="text-xs opacity-60">Nog niets opgeruimd.</div>}
        {log.slice(0, LOG_ZICHTBAAR).map((regel) => (
          <div key={regel.op} className="op-rij">
            <div className="flex items-center gap-1.5 text-xs opacity-70 flex-1 min-w-0">
              <Clock size={12} className="flex-shrink-0" />
              <span className="truncate">
                {fmtDatum(regel.op)} · {regel.modus}
              </span>
            </div>
            <div className="text-xs text-right flex-shrink-0">
              <span className="dl-mono">{fmtBytes(regel.bytes)}</span>
              <span className="opacity-55"> · {regel.aantal}×</span>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs opacity-50 flex items-start gap-1.5">
        <Sparkles size={13} className="mt-0.5 flex-shrink-0" />
        {telefoon
          ? "Deze knop ruimt op wat Daglog opbouwt én de rommel op je gedeelde opslag. De cache ván andere apps blijft buiten bereik: dat mag sinds Android 6 alleen het systeem zelf."
          : "Deze knop ruimt op wat Daglog zelf opbouwt. Voor de rommel op je telefoonopslag is de Android-versie van de app nodig."}
      </div>
    </div>
  );
}
