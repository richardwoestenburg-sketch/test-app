# Daglog

Een journaal van hoe je je uren besteedt — een eenvoudige tijdlijn-app om door de
dag heen korte aantekeningen te maken, optioneel met je locatie.

Gebouwd met **React + Vite** en **Tailwind CSS**. Het is een **installeerbare PWA**:
je kunt hem op je startscherm zetten en als een echte app openen, ook offline.
Aantekeningen worden lokaal in je browser bewaard (`localStorage`), er is geen
server of account nodig.

De app heeft twee tabbladen: **Daglog** (terugkijken — wat deed je) en
**Agenda** (vooruit plannen — met een melding op tijd).

## Functies

**Daglog**

- Log activiteiten met een tijdstip en korte omschrijving
- Voeg optioneel je GPS-locatie toe aan een aantekening
- Aantekeningen gegroepeerd per dag ("Vandaag", "Gisteren", of de datum)
- Verwijder losse aantekeningen of wis alles in één keer
- Optionele **synchronisatie** via een eigen Cloudflare-backend, zodat telefoon,
  browser én een Wear OS-horloge dezelfde daglog delen
- Inspreken: microfoon-knop in de app (Web Speech API), en een `/log`-eindpunt
  om vanaf een smartwatch in te spreken

**Agenda / planner**

- Plan afspraken en taken vooruit met datum, tijd en titel
- Laat een afspraak **herhalen**: elke dag, elke werkdag (ma–vr), elke week of
  elke maand. Een terugkerend item schuift vanzelf door naar de volgende keer
  (en krijgt telkens een nieuwe melding); afvinken zet 'm meteen op de volgende keer
- Optionele **einddatum** voor een herhaling ("t/m …"): na die datum stopt de
  reeks vanzelf en verdwijnt het item. Laat leeg om oneindig te herhalen
- Kies per afspraak wanneer je een **melding** wilt: op tijd, of 5/15/30 minuten,
  1 uur of 1 dag ervoor
- Gegroepeerd per dag ("Vandaag", "Morgen", of de datum); verlopen afspraken
  worden gemarkeerd
- Vink af wat je gedaan hebt; afgeronde items schuiven weg maar blijven terug te
  vinden onder "Toon afgerond"
- **Meldingen** komen binnen via de browser/het systeem. Op Android/Chrome
  (geïnstalleerd als PWA) worden ze op het geplande moment afgeleverd, ook als de
  app dicht is (via de Notification Triggers API). Op browsers zonder die
  ondersteuning (o.a. Safari) verschijnt de melding terwijl de app open is, en
  als inhaalmelding zodra je de app weer opent.

**Algemeen**

- Alles blijft lokaal opgeslagen op je apparaat (`localStorage`) — geen account nodig
- Installeerbaar op je startscherm (PWA) en werkt offline
- Met de optionele Cloudflare-sync worden **zowel de daglog als de agenda** tussen
  je apparaten gedeeld (zelfde koppeling, ingesteld via het tandwiel ⚙️)

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

Standaard werkt Daglog puur lokaal. Wil je je aantekeningen én je agenda delen
tussen apparaten — of vanaf een Wear OS-horloge inspreken — dan zet je de
meegeleverde Cloudflare-backend aan. De Worker bewaart de daglog (`/entries`) en
de agenda (`/agenda`) apart in dezelfde KV-opslag; de app gebruikt voor beide
dezelfde koppeling.

> **Al een oudere Worker gedraaid?** De agenda-endpoints (`/agenda`) zijn nieuw —
> deploy de Worker in `worker/` opnieuw zodat je agenda ook synchroniseert.

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
src/App.jsx                   tab-shell (Daglog / Agenda) + gedeelde stijl
src/DagLog.jsx                het daglog-component (UI + logica)
src/Agenda.jsx                het agenda/planner-component (UI + logica)
src/agenda.js                 opslag & helpers voor agenda-items
src/notify.js                 meldingen (Notification Triggers + in-app fallback)
src/theme.js                  gedeelde CSS/design-tokens
src/storage.js                localStorage-persistentie (daglog)
src/sync.js                   client voor de Cloudflare-backend (sync)
src/index.css                 Tailwind
public/manifest.webmanifest   PWA-manifest (naam, iconen, kleuren)
public/sw.js                  service worker (offline caching + melding-clicks)
public/icon-*.png, icon.svg   app-iconen
worker/                       Cloudflare Worker backend (+ DEPLOY.md)
```
