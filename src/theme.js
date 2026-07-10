// Shared visual language for the app (Daglog + Agenda).
// Injected once at the App root so every tab uses the same tokens.
export const APP_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.dl-root {
  font-family: 'Inter', sans-serif;
  background: #10151c;
  background-image:
    radial-gradient(circle at 20% 0%, rgba(184,137,43,0.08), transparent 40%),
    radial-gradient(circle at 80% 100%, rgba(184,137,43,0.05), transparent 40%);
  min-height: 100vh;
  color: #ede6d0;
}
.dl-serif { font-family: 'Fraunces', serif; }
.dl-mono { font-family: 'JetBrains Mono', monospace; }

.dl-card {
  background: #efe3c0;
  color: #241d10;
  border-radius: 10px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.15), 0 8px 20px -10px rgba(0,0,0,0.5);
}

.dl-input {
  background: rgba(16,21,28,0.04);
  border: 1px solid rgba(36,29,16,0.18);
  border-radius: 8px;
  color: #241d10;
}
.dl-input:focus {
  outline: none;
  border-color: #b8892b;
  box-shadow: 0 0 0 3px rgba(184,137,43,0.18);
}

.dl-btn-primary {
  background: #1f2a36;
  color: #efe3c0;
  border-radius: 8px;
  transition: transform 0.12s ease, background 0.12s ease;
}
.dl-btn-primary:hover { background: #2a3949; }
.dl-btn-primary:active { transform: scale(0.97); }
.dl-btn-primary:disabled { opacity: 0.45; }

.dl-btn-ghost {
  border: 1px solid rgba(237,230,208,0.25);
  color: #ede6d0;
  border-radius: 8px;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-btn-ghost:hover { background: rgba(237,230,208,0.06); border-color: rgba(237,230,208,0.4); }

.dl-line {
  position: absolute;
  left: 6px;
  top: 0.65rem;
  bottom: -1.1rem;
  width: 1px;
  background: linear-gradient(to bottom, rgba(184,137,43,0.6), rgba(184,137,43,0.15));
}
.dl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #b8892b;
  box-shadow: 0 0 0 3px rgba(184,137,43,0.18);
}
.dl-entry:last-child .dl-line { display: none; }

.dl-day-label {
  letter-spacing: 0.14em;
}

.dl-mic {
  border: 1px solid rgba(36,29,16,0.25);
  border-radius: 8px;
  color: #241d10;
  background: rgba(16,21,28,0.04);
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dl-mic:hover { background: rgba(16,21,28,0.08); }
.dl-mic-live {
  background: #8a3b1f;
  border-color: #8a3b1f;
  color: #efe3c0;
  animation: dl-pulse 1.2s ease-in-out infinite;
}
@keyframes dl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(138,59,31,0.45); }
  50% { box-shadow: 0 0 0 5px rgba(138,59,31,0); }
}

.dl-spin { animation: dl-rotate 0.9s linear infinite; }
@keyframes dl-rotate { to { transform: rotate(360deg); } }

/* Tab bar (segmented control at the top) */
.dl-tabs {
  display: flex;
  gap: 4px;
  background: rgba(237,230,208,0.06);
  border: 1px solid rgba(237,230,208,0.12);
  border-radius: 11px;
  padding: 4px;
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
  padding: 9px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #ede6d0;
  opacity: 0.6;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, opacity 0.12s ease, color 0.12s ease;
}
@media (max-width: 480px) {
  .dl-tab { flex: 0 0 auto; padding: 9px 12px; }
}
.dl-tab:hover { opacity: 0.85; }
.dl-tab-active {
  background: #efe3c0;
  color: #241d10;
  opacity: 1;
  box-shadow: 0 1px 0 rgba(0,0,0,0.15);
}

/* Agenda item states */
.dl-ag-item {
  border: 1px solid rgba(36,29,16,0.12);
  border-radius: 9px;
  background: rgba(16,21,28,0.02);
  transition: border-color 0.12s ease, opacity 0.12s ease;
}
.dl-ag-over { border-color: rgba(138,59,31,0.55); background: rgba(138,59,31,0.06); }
.dl-ag-done { opacity: 0.5; }
.dl-ag-done .dl-ag-title { text-decoration: line-through; }

.dl-check {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1.6px solid rgba(36,29,16,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #efe3c0;
  background: transparent;
  transition: background 0.12s ease, border-color 0.12s ease;
  flex-shrink: 0;
}
.dl-check:hover { border-color: #b8892b; }
.dl-check-on { background: #2f7d5b; border-color: #2f7d5b; }

.dl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(184,137,43,0.16);
  color: #7a5a1a;
}
.dl-badge-over { background: rgba(138,59,31,0.16); color: #8a3b1f; }

/* Time-tracking quick buttons + analysis bars */
.dl-qbtn {
  background: #efe3c0;
  color: #241d10;
  border: 1px solid rgba(36,29,16,0.15);
  border-radius: 10px;
  padding: 14px 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition: transform 0.1s ease, background 0.12s ease, box-shadow 0.12s ease;
}
.dl-qbtn:hover { background: #f3e9cc; }
.dl-qbtn:active { transform: scale(0.97); }
.dl-qbtn-active {
  background: #2f7d5b;
  color: #efe3c0;
  border-color: #2f7d5b;
  box-shadow: 0 0 0 3px rgba(47,125,91,0.22);
}

.dl-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(36,29,16,0.1);
  overflow: hidden;
}
.dl-bar-fill {
  height: 100%;
  background: #b8892b;
  border-radius: 999px;
  min-width: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .dl-btn-primary, .dl-btn-ghost, .dl-mic, .dl-tab, .dl-ag-item, .dl-check, .dl-qbtn { transition: none; }
  .dl-mic-live, .dl-spin { animation: none; }
}

/* Flitsers: kaart + waarschuwingsbanner */
.fl-map-wrap {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(237,230,208,0.14);
  box-shadow: 0 8px 20px -10px rgba(0,0,0,0.5);
}
.fl-map {
  height: 42vh;
  min-height: 260px;
  background: #1f2a36;
}
.fl-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #7a5a1a;
  color: #fff7e0;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 8px 20px -10px rgba(0,0,0,0.6);
  animation: fl-pulse 1.4s ease-in-out infinite;
}
.fl-alert-close {
  background: #8a3b1f;
  animation-duration: 0.7s;
}
@keyframes fl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(122,90,26,0.4), 0 8px 20px -10px rgba(0,0,0,0.6); }
  50% { box-shadow: 0 0 0 6px rgba(122,90,26,0), 0 8px 20px -10px rgba(0,0,0,0.6); }
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
  background: rgba(237,230,208,0.06);
  border: 1px solid rgba(237,230,208,0.12);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.dl-photo-thumb-wrap:hover { opacity: 0.9; }
.dl-photo-thumb-wrap:active { transform: scale(0.97); }
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
  background: rgba(16,21,28,0.65);
  color: #ede6d0;
}
.dl-photo-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8,10,14,0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}
.dl-photo-modal {
  background: #efe3c0;
  color: #241d10;
  border-radius: 10px;
  padding: 12px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 20px -10px rgba(0,0,0,0.6);
}
.dl-photo-modal-img {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: 6px;
  background: #10151c;
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .dl-photo-thumb-wrap { transition: none; }
}
`;
