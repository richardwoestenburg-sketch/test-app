// Shared visual language for the app (Daglog + Agenda).
// Injected once at the App root so every tab uses the same tokens.
//
// Zakelijke stijl: licht, neutraal grijs met één blauwe accentkleur,
// witte kaarten met dunne randen, en ruime aanraakdoelen zodat alles
// makkelijk te bedienen is op een telefoon.
export const APP_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.dl-root {
  font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
  background: #f5f6f8;
  min-height: 100vh;
  color: #1f2937;
}
.dl-serif { font-family: 'Inter', sans-serif; font-weight: 600; letter-spacing: -0.01em; }
.dl-mono { font-family: 'JetBrains Mono', monospace; }

.dl-card {
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #e3e7ec;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.05);
}

.dl-input {
  background: #ffffff;
  border: 1px solid #cbd2d9;
  border-radius: 8px;
  color: #1f2937;
  min-height: 40px;
}
.dl-input:focus {
  outline: none;
  border-color: #1f4e8c;
  box-shadow: 0 0 0 3px rgba(31,78,140,0.15);
}

.dl-btn-primary {
  background: #1f4e8c;
  color: #ffffff;
  border-radius: 8px;
  min-height: 40px;
  font-weight: 500;
  transition: background 0.12s ease;
}
.dl-btn-primary:hover { background: #183e70; }
.dl-btn-primary:active { background: #143459; }
.dl-btn-primary:disabled { opacity: 0.45; }

.dl-btn-ghost {
  background: #ffffff;
  border: 1px solid #cbd2d9;
  color: #33404d;
  border-radius: 8px;
  min-height: 40px;
  font-weight: 500;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-btn-ghost:hover { background: #eef1f4; border-color: #b3bcc5; }

.dl-btn-primary:focus-visible, .dl-btn-ghost:focus-visible, .dl-tab:focus-visible,
.dl-mic:focus-visible, .dl-check:focus-visible, .dl-qbtn:focus-visible {
  outline: 2px solid #1f4e8c;
  outline-offset: 2px;
}

.dl-line {
  position: absolute;
  left: 6px;
  top: 0.65rem;
  bottom: -1.1rem;
  width: 1px;
  background: #d5dbe1;
}
.dl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #1f4e8c;
  box-shadow: 0 0 0 3px rgba(31,78,140,0.15);
}
.dl-entry:last-child .dl-line { display: none; }

.dl-day-label {
  letter-spacing: 0.14em;
}

.dl-mic {
  border: 1px solid #cbd2d9;
  border-radius: 8px;
  color: #33404d;
  background: #ffffff;
  min-height: 40px;
  min-width: 44px;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-mic:hover { background: #eef1f4; }
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

/* Tab bar (segmented control at the top) */
.dl-tabs {
  display: flex;
  gap: 4px;
  background: #ffffff;
  border: 1px solid #e3e7ec;
  border-radius: 11px;
  padding: 4px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.05);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.dl-tabs::-webkit-scrollbar { display: none; }
.dl-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 8px;
  min-height: 42px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #52606e;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}
@media (max-width: 480px) {
  /* Met tien tabbladen past niet alles op één rij op een telefoon. Wrap naar
     meerdere rijen in plaats van onzichtbaar horizontaal te laten scrollen
     (de scrollbalk is verborgen, dus scrollen zou geen enkele aanwijzing geven
     dat er meer tabbladen zijn). */
  .dl-tabs { flex-wrap: wrap; overflow-x: visible; }
  .dl-tab { flex: 1 1 30%; padding: 10px 6px; font-size: 12px; }
}
.dl-tab:hover { background: #eef1f4; color: #1f2937; }
.dl-tab-active, .dl-tab-active:hover {
  background: #1f4e8c;
  color: #ffffff;
}

/* Agenda item states */
.dl-ag-item {
  border: 1px solid #e3e7ec;
  border-radius: 9px;
  background: #fafbfc;
  transition: border-color 0.12s ease, opacity 0.12s ease;
}
.dl-ag-over { border-color: rgba(179,54,42,0.5); background: rgba(179,54,42,0.05); }
.dl-ag-done { opacity: 0.55; }
.dl-ag-done .dl-ag-title { text-decoration: line-through; }

.dl-check {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1.6px solid #b3bcc5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: #ffffff;
  transition: background 0.12s ease, border-color 0.12s ease;
  flex-shrink: 0;
}
.dl-check:hover { border-color: #1f4e8c; }
.dl-check-on { background: #1e7a4f; border-color: #1e7a4f; }

.dl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8eef6;
  color: #1f4e8c;
}
.dl-badge-over { background: #f6e5e3; color: #b3362a; }

/* Time-tracking quick buttons + analysis bars */
.dl-qbtn {
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #cbd2d9;
  border-radius: 10px;
  padding: 14px 12px;
  min-height: 48px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.dl-qbtn:hover { background: #eef1f4; }
.dl-qbtn:active { background: #e3e7ec; }
.dl-qbtn-active, .dl-qbtn-active:hover {
  background: #1e7a4f;
  color: #ffffff;
  border-color: #1e7a4f;
  box-shadow: 0 0 0 3px rgba(30,122,79,0.18);
}

.dl-bar {
  height: 8px;
  border-radius: 999px;
  background: #e3e7ec;
  overflow: hidden;
}
.dl-bar-fill {
  height: 100%;
  background: #1f4e8c;
  border-radius: 999px;
  min-width: 2px;
}
.dl-bar-fill-over { background: #b3362a; }

@media (prefers-reduced-motion: reduce) {
  .dl-btn-primary, .dl-btn-ghost, .dl-mic, .dl-tab, .dl-ag-item, .dl-check, .dl-qbtn { transition: none; }
  .dl-mic-live, .dl-spin { animation: none; }
}

/* Flitsers: kaart + waarschuwingsbanner */
.fl-map-wrap {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e3e7ec;
  box-shadow: 0 1px 2px rgba(16,24,40,0.05);
}
.fl-map {
  height: 42vh;
  min-height: 260px;
  background: #e3e7ec;
}
.fl-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #b46a10;
  color: #ffffff;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 2px 8px rgba(16,24,40,0.15);
  animation: fl-pulse 1.4s ease-in-out infinite;
}
.fl-alert-close {
  background: #b3362a;
  animation-duration: 0.7s;
}
@keyframes fl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(180,106,16,0.35), 0 2px 8px rgba(16,24,40,0.15); }
  50% { box-shadow: 0 0 0 6px rgba(180,106,16,0), 0 2px 8px rgba(16,24,40,0.15); }
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
  border-radius: 8px;
  overflow: hidden;
  background: #eef1f4;
  border: 1px solid #e3e7ec;
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
  background: rgba(31,41,55,0.72);
  color: #ffffff;
}
.dl-photo-overlay {
  position: fixed;
  inset: 0;
  background: rgba(31,41,55,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}
.dl-photo-modal {
  background: #ffffff;
  color: #1f2937;
  border-radius: 10px;
  padding: 12px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(16,24,40,0.25);
}
.dl-photo-modal-img {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: 6px;
  background: #eef1f4;
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
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.08);
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
  border: 1px solid #e3e7ec;
  border-radius: 9px;
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
`;
