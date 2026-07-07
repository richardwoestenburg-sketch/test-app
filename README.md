# Daglog

Een journaal van hoe je je uren besteedt — een eenvoudige tijdlijn-app om door de
dag heen korte aantekeningen te maken, optioneel met je locatie.

Gebouwd met **React + Vite** en **Tailwind CSS**. Het is een **installeerbare PWA**:
je kunt hem op je startscherm zetten en als een echte app openen, ook offline.
Aantekeningen worden lokaal in je browser bewaard (`localStorage`), er is geen
server of account nodig.

## Functies

- Log activiteiten met een tijdstip en korte omschrijving
- Voeg optioneel je GPS-locatie toe aan een aantekening
- Aantekeningen gegroepeerd per dag ("Vandaag", "Gisteren", of de datum)
- Verwijder losse aantekeningen of wis alles in één keer
- Alles blijft lokaal opgeslagen op je apparaat
- Installeerbaar op je startscherm (PWA) en werkt offline
- Optionele **synchronisatie** via een eigen Cloudflare-backend, zodat telefoon,
  browser én een Wear OS-horloge dezelfde daglog delen
- Inspreken: microfoon-knop in de app (Web Speech API), en een `/log`-eindpunt
  om vanaf een smartwatch in te spreken

## Live (GitHub Pages)

De app wordt automatisch gepubliceerd op GitHub Pages via de workflow in
`.github/workflows/deploy.yml`:

**https://richardwoestenburg-sketch.github.io/test-app/**

Open die URL op je telefoon om de app te installeren.

## Op je startscherm zetten

Open de app in je browser en:

- **iPhone / iPad (Safari):** deel-knop → *Zet op beginscherm*.
- **Android (Chrome):** menu (⋮) → *App installeren* / *Toevoegen aan startscherm*.
- **Desktop (Chrome / Edge):** het installatie-icoon in de adresbalk, of menu → *Installeren*.

Daarna start Daglog als een losstaande app, zonder browserbalk.

## Aan de slag

```bash
npm install      # dependencies installeren
npm run dev      # ontwikkelserver starten (http://localhost:5173)
npm run build    # productie-build maken in dist/
npm run preview  # de productie-build lokaal bekijken
```

## Synchronisatie & Wear OS (optioneel)

Standaard werkt Daglog puur lokaal. Wil je je aantekeningen delen tussen
apparaten — of vanaf een Wear OS-horloge inspreken — dan zet je de meegeleverde
Cloudflare-backend aan.

**Snelste manier (ook op de telefoon), één knop:**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/richardwoestenburg-sketch/test-app/tree/main/worker)

De wizard maakt de opslag (KV) automatisch aan. Voeg daarna de secret
`DAGLOG_TOKEN` toe (Worker → Settings → Variables and Secrets), en koppel de app
via het tandwiel ⚙️ (Worker-URL + die sleutel). Volledige uitleg en de
handmatige route: **[`worker/DEPLOY.md`](worker/DEPLOY.md)**.

Kort:
1. Deploy de Worker in `worker/` naar je eigen (gratis) Cloudflare-account.
2. Koppel de app via het tandwiel ⚙️ (Worker-URL + sleutel).
3. Laat je horloge het `/log`-eindpunt aanroepen met je ingesproken tekst.

## Structuur

```
index.html                    entrypoint + PWA-meta en service worker-registratie
src/main.jsx                  React root
src/DagLog.jsx                het hoofdcomponent (UI + logica)
src/storage.js                localStorage-persistentie
src/sync.js                   client voor de Cloudflare-backend (sync)
src/index.css                 Tailwind
public/manifest.webmanifest   PWA-manifest (naam, iconen, kleuren)
public/sw.js                  service worker (offline caching)
public/icon-*.png, icon.svg   app-iconen
worker/                       Cloudflare Worker backend (+ DEPLOY.md)
```
