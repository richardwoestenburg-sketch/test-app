// Gedeelde visuele stijl voor alle mini-apps.
// Eén keer geïnjecteerd in de App-root; elke app krijgt zijn eigen
// accentkleur via de CSS-variabelen --dl-accent en --dl-accent-bright
// (gezet in App.jsx vanuit src/apps.js).
//
// Frisse stijl: zachte getinte achtergrond met een gloed in de app-kleur,
// witte kaarten met grote afrondingen, gradient-accenten en ruime
// aanraakdoelen zodat alles prettig werkt op een telefoon.
export const APP_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

.dl-root {
  --dl-accent: #4f46e5;
  --dl-accent-bright: #818cf8;
  font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
  min-height: 100vh;
  color: #1c2434;
  background: #f2f4f9;
  background:
    radial-gradient(900px 420px at 50% -120px, color-mix(in srgb, var(--dl-accent) 16%, transparent), transparent 72%),
    linear-gradient(180deg, #f7f8fc 0%, #eef0f7 100%);
}
.dl-serif { font-family: 'Inter', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
.dl-mono { font-family: 'JetBrains Mono', monospace; }

.dl-ico-accent { color: var(--dl-accent); }

.dl-card {
  background: #ffffff;
  color: #1c2434;
  border: 1px solid #e6e9f2;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(23,28,60,0.05);
  box-shadow:
    0 1px 3px rgba(23,28,60,0.05),
    0 14px 30px -22px color-mix(in srgb, var(--dl-accent) 45%, transparent);
}

/* Gradient-badge voor app-koppen (icoon in gekleurd blokje) */
.dl-hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  color: #ffffff;
  background: var(--dl-accent);
  background: linear-gradient(135deg, var(--dl-accent-bright), var(--dl-accent));
  box-shadow: 0 6px 14px -6px color-mix(in srgb, var(--dl-accent) 65%, transparent);
  flex-shrink: 0;
}

.dl-input {
  background: #ffffff;
  border: 1px solid #d4d9e6;
  border-radius: 10px;
  color: #1c2434;
  min-height: 40px;
}
.dl-input:focus {
  outline: none;
  border-color: var(--dl-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dl-accent) 18%, transparent);
}

.dl-btn-primary {
  background: var(--dl-accent);
  background: linear-gradient(135deg, var(--dl-accent-bright), var(--dl-accent));
  color: #ffffff;
  border-radius: 10px;
  min-height: 40px;
  font-weight: 600;
  box-shadow: 0 5px 12px -5px color-mix(in srgb, var(--dl-accent) 60%, transparent);
  transition: filter 0.12s ease, transform 0.12s ease;
}
.dl-btn-primary:hover { filter: brightness(1.06); }
.dl-btn-primary:active { filter: brightness(0.94); transform: translateY(1px); }
.dl-btn-primary:disabled { opacity: 0.45; box-shadow: none; }

.dl-btn-ghost {
  background: #ffffff;
  border: 1px solid #d4d9e6;
  color: #33404d;
  border-radius: 10px;
  min-height: 40px;
  font-weight: 500;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-btn-ghost:hover {
  background: #f2f4fa;
  border-color: color-mix(in srgb, var(--dl-accent) 45%, #d4d9e6);
}

.dl-btn-primary:focus-visible, .dl-btn-ghost:focus-visible, .dl-mic:focus-visible,
.dl-check:focus-visible, .dl-qbtn:focus-visible, .dl-tile:focus-visible,
.dl-back:focus-visible {
  outline: 2px solid var(--dl-accent);
  outline-offset: 2px;
}

/* Tijdlijn (daglog) */
.dl-line {
  position: absolute;
  left: 6px;
  top: 0.65rem;
  bottom: -1.1rem;
  width: 2px;
  border-radius: 2px;
  background: #dfe3ed;
  background: linear-gradient(180deg, color-mix(in srgb, var(--dl-accent) 35%, #dfe3ed), #e4e8f1);
}
.dl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dl-accent);
  background: linear-gradient(135deg, var(--dl-accent-bright), var(--dl-accent));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dl-accent) 18%, transparent);
}
.dl-entry:last-child .dl-line { display: none; }

.dl-day-label {
  letter-spacing: 0.14em;
  color: var(--dl-accent);
}

.dl-mic {
  border: 1px solid #d4d9e6;
  border-radius: 10px;
  color: #33404d;
  background: #ffffff;
  min-height: 40px;
  min-width: 44px;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-mic:hover { background: #f2f4fa; }
.dl-mic-live {
  background: #b3362a;
  border-color: #b3362a;
  color: #ffffff;
  animation: dl-pulse 1.2s ease-in-out infinite;
}
@keyframes dl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(179,54,42,0.4); }
  50% { box-shadow: 0 0 0 5px rgba(179,54,42,0); }
}

.dl-spin { animation: dl-rotate 0.9s linear infinite; }
@keyframes dl-rotate { to { transform: rotate(360deg); } }

/* Startscherm: raster van app-tegels */
.dl-home-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 440px) {
  .dl-home-grid { grid-template-columns: repeat(3, 1fr); }
}
.dl-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 16px 14px 14px;
  background: #ffffff;
  border: 1px solid #e6e9f2;
  border-radius: 18px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(23,28,60,0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.dl-tile:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--dl-accent) 40%, #e6e9f2);
  box-shadow: 0 12px 26px -14px color-mix(in srgb, var(--dl-accent) 55%, transparent);
}
.dl-tile:active { transform: translateY(0); }
.dl-tile-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  margin-bottom: 8px;
  color: #ffffff;
  background: var(--dl-accent);
  background: linear-gradient(135deg, var(--dl-accent-bright), var(--dl-accent));
  box-shadow: 0 6px 12px -5px color-mix(in srgb, var(--dl-accent) 65%, transparent);
}
.dl-tile-name { font-weight: 600; font-size: 14px; }
.dl-tile-tag { font-size: 11px; opacity: 0.55; line-height: 1.35; }

/* Slanke navigatiebalk boven een geopende app */
.dl-appbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e6e9f2;
  border-radius: 13px;
  padding: 5px 8px;
  box-shadow: 0 1px 3px rgba(23,28,60,0.05);
}
.dl-appbar-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}
.dl-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: #52606e;
  background: transparent;
  transition: background 0.12s ease, color 0.12s ease;
}
.dl-back:hover { background: #f2f4fa; color: var(--dl-accent); }

/* Agenda item states */
.dl-ag-item {
  border: 1px solid #e6e9f2;
  border-radius: 12px;
  background: #fafbfd;
  transition: border-color 0.12s ease, opacity 0.12s ease;
}
.dl-ag-over { border-color: rgba(179,54,42,0.5); background: rgba(179,54,42,0.05); }
.dl-ag-done { opacity: 0.55; }
.dl-ag-done .dl-ag-title { text-decoration: line-through; }

.dl-check {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1.6px solid #b8c0cf;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: #ffffff;
  transition: background 0.12s ease, border-color 0.12s ease;
  flex-shrink: 0;
}
.dl-check:hover { border-color: var(--dl-accent); }
.dl-check-on { background: #1e7a4f; border-color: #1e7a4f; }

.dl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eceffa;
  background: color-mix(in srgb, var(--dl-accent) 12%, #ffffff);
  color: var(--dl-accent);
}
.dl-badge-over { background: #f6e5e3; color: #b3362a; }

/* Tijdregistratie: snelknoppen + analysebalkjes */
.dl-qbtn {
  background: #ffffff;
  color: #1c2434;
  border: 1px solid #d4d9e6;
  border-radius: 12px;
  padding: 14px 12px;
  min-height: 48px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.dl-qbtn:hover { background: #f2f4fa; }
.dl-qbtn:active { background: #e6e9f2; }
.dl-qbtn-active, .dl-qbtn-active:hover {
  background: #1e7a4f;
  color: #ffffff;
  border-color: #1e7a4f;
  box-shadow: 0 0 0 3px rgba(30,122,79,0.18);
}

.dl-bar {
  height: 8px;
  border-radius: 999px;
  background: #e4e8f1;
  overflow: hidden;
}
.dl-bar-fill {
  height: 100%;
  background: var(--dl-accent);
  background: linear-gradient(90deg, var(--dl-accent-bright), var(--dl-accent));
  border-radius: 999px;
  min-width: 2px;
}
.dl-bar-fill-over { background: #b3362a; }

@media (prefers-reduced-motion: reduce) {
  .dl-btn-primary, .dl-btn-ghost, .dl-mic, .dl-ag-item, .dl-check, .dl-qbtn,
  .dl-tile, .dl-back { transition: none; }
  .dl-mic-live, .dl-spin { animation: none; }
  .dl-tile:hover { transform: none; }
}

/* Flitsers: kaart + waarschuwingsbanner */
.fl-map-wrap {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e6e9f2;
  box-shadow: 0 1px 3px rgba(23,28,60,0.05);
}
.fl-map {
  height: 42vh;
  min-height: 260px;
  background: #e4e8f1;
}
.fl-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #b46a10;
  color: #ffffff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 2px 8px rgba(23,28,60,0.15);
  animation: fl-pulse 1.4s ease-in-out infinite;
}
.fl-alert-close {
  background: #b3362a;
  animation-duration: 0.7s;
}
@keyframes fl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(180,106,16,0.35), 0 2px 8px rgba(23,28,60,0.15); }
  50% { box-shadow: 0 0 0 6px rgba(180,106,16,0), 0 2px 8px rgba(23,28,60,0.15); }
}
@media (prefers-reduced-motion: reduce) {
  .fl-alert { animation: none; }
}

/* Vakantie: fototijdlijn + lightbox */
.dl-photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.dl-photo-thumb-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f2f4fa;
  border: 1px solid #e6e9f2;
  transition: opacity 0.12s ease;
}
.dl-photo-thumb-wrap:hover { opacity: 0.9; }
.dl-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.dl-photo-time {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(28,36,52,0.72);
  color: #ffffff;
}
.dl-photo-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28,36,52,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}
.dl-photo-modal {
  background: #ffffff;
  color: #1c2434;
  border-radius: 14px;
  padding: 12px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(23,28,60,0.25);
}
.dl-photo-modal-img {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: 8px;
  background: #f2f4fa;
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .dl-photo-thumb-wrap { transition: none; }
}

/* Cabrio: weeradvies-banner + uurtijdlijn */
.cb-advice {
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(23,28,60,0.08);
}
.cb-advice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.16);
}
.cb-advice-open {
  background: #1e7a4f;
  color: #ffffff;
}
.cb-advice-closed {
  background: #47535f;
  color: #ffffff;
}

.cb-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.cb-stat {
  background: #ffffff;
  border: 1px solid #e6e9f2;
  border-radius: 11px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.cb-stat-value {
  font-size: 14px;
  font-weight: 600;
}
.cb-stat-label {
  font-size: 9px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.cb-hours {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}
.cb-hour {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 40px;
  opacity: 0.75;
}
.cb-hour-time {
  font-size: 10px;
  opacity: 0.7;
}
.cb-hour-temp {
  font-size: 12px;
  font-weight: 600;
}
.cb-hour-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #cbd2d9;
}
.cb-hour-open {
  opacity: 1;
}
.cb-hour-open .cb-hour-dot {
  background: #1e7a4f;
}

/* Meldingen: gevaar-melding + ernst-kiezer */
.mg-sev-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1.6px solid #d4d9e6;
  border-radius: 10px;
  background: #ffffff;
  color: #33404d;
  min-height: 44px;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.mg-sev-btn:hover { background: #f2f4fa; }
.mg-sev-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex-shrink: 0;
}
.mg-item {
  border: 1px solid #e6e9f2;
  border-left: 4px solid #d4d9e6;
  border-radius: 12px;
  background: #fafbfd;
}
.mg-btn-report {
  width: 100%;
  justify-content: center;
  font-size: 15px;
  padding: 13px 16px;
  border-radius: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .mg-sev-btn { transition: none; }
}
`;
