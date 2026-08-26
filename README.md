# Daglog

Een journaal van hoe je je uren besteedt — een eenvoudige tijdlijn-app om door de
dag heen korte aantekeningen te maken, optioneel met je locatie.

Gebouwd met **React + Vite** en **Tailwind CSS**. Het is een **installeerbare PWA**:
je kunt hem op je startscherm zetten en als een echte app openen, ook offline.
Aantekeningen worden lokaal in je browser bewaard (`localStorage`), er is geen
server of account nodig.

De app opent met een **startscherm met app-tegels** — elke module heeft een
eigen kleur en icoon, en is ook **als losse app** te installeren op je
startscherm (zie *Op je startscherm zetten*). De elf apps: **Daglog** (terugkijken — wat deed je),
**Meldingen** (direct een gevaarlijke situatie melden en doorsturen naar quality),
**Agenda** (vooruit plannen — met een melding op tijd), **Tijd** (snel
registreren wat je doet en hoe lang, met een daganalyse), **Vakantie**
(op elk moment een foto toevoegen, zodat je achteraf in één tijdlijn ziet hoe
je vakantie was), **Flitsers** (kaart met flitspalen/trajectcontroles en een
waarschuwing als je in de buurt komt), **Cabrio** (live weeradvies — kap open
of dicht — op basis van temperatuur, wind, regenkans en UV op jouw locatie),
**Garage** (onderhouds- en detailing-logboek voor je auto's, met APK- en
verzekeringsherinneringen en een wasdag-advies),
**Afbeeldingen** (hoge-resolutie 3D-render-stijl afbeeldingen genereren op
basis van een omschrijving), **Stem** (je eigen stem klonen en tekst laten
voorlezen in die stem) en **Secretaresse** (je Outlook-mail en -agenda, met
meldingen — ook met vergrendeld scherm).

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

**Meldingen**

- Het officiële **ongevallenmeldingsformulier** (ongeval, bijna-ongeval/incident,
  onveilige situatie/handeling, materiaal-/milieuschade) als mobiele app —
  meteen open bij het starten, zo min mogelijk tikken tot versturen
- Velden: locatie, soort incident (aan te vinken), omschrijving, optioneel een
  foto (rechtstreeks vanaf de camera), gegevens betrokkene (inklapbaar,
  meestal niet nodig bij een bijna-ongeval), genomen/te nemen maatregelen en
  actie leidinggevende
- **Direct doorsturen naar quality**: na het opslaan opent de app je mail-app
  met een kant-en-klare e-mail (onderwerp + volledige formuliertekst) naar het
  ingestelde adres — jij hoeft alleen nog op *verstuur* te tikken. Een foto kan
  een mailto-link niet automatisch meesturen; die voeg je zelf toe in je
  mail-app
- E-mailadres van quality en je standaard naam/functie stel je één keer in
  via het tandwiel ⚙️
- Meldingen blijven ook lokaal bewaard (met foto, IndexedDB) als overzicht/
  bewijs, met een "verstuurd"-label; opnieuw versturen en verwijderen kan
  altijd

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

**Tijd / tijdregistratie**

- **Snelknoppen** voor je vaste (werk)activiteiten — één tik start een activiteit
  en stopt automatisch de vorige, zodat wisselen één tik kost
- Een **lopende teller** loopt live mee; met één druk op **Stop** rond je af
- Vrij tekstveld voor een **eenmalige** activiteit die niet op een knop staat
- Snelknoppen zijn zelf **aan te passen** (toevoegen/verwijderen)
- Per dag een **analyse**: totale tijd per activiteit met balkjes en percentage,
  plus de losse sessies met tijdvak en duur; blader terug naar eerdere dagen
- Heel korte registraties (< 2 s) worden als mis-tik genegeerd
- Optionele **synchronisatie** (zelfde Cloudflare-koppeling): je tijdregistratie
  is gelijk op telefoon, laptop en browser
- **Vanaf je horloge loggen**: een `/track`-eindpunt waarmee een Wear OS-tegel
  met één tik een activiteit start/wisselt (zie `worker/DEPLOY.md`)

**Vakantie**

- Voeg op elk moment een **foto** toe (uit je camera of fotobibliotheek), met
  tijdstip en een optioneel bijschrift
- Foto's worden automatisch **verkleind en gecomprimeerd** in de browser
  voordat ze bewaard worden, zodat je er veel kwijt kunt
- Bekeken als **tijdlijn per dag**, met miniaturen en het tijdstip erbij
- Tik op een foto voor een **groot scherm** met bijschrift, tijdstip en
  eventuele locatie; van daaruit ook meteen te verwijderen
- Zo zie je in één overzicht — achteraf — hoe je vakantie eruitzag
- Voeg optioneel je GPS-locatie toe aan een foto
- Verwijder losse foto's of wis alles in één keer
- Foto's blijven **lokaal op je apparaat** (IndexedDB), er is geen account of
  server nodig

**Flitsers**

- **Kaart** (OpenStreetMap) met je eigen positie en flitspalen/trajectcontroles
  in de buurt
- Camera-data komt **gratis en automatisch** van OpenStreetMap (Overpass API,
  geen account nodig) en wordt lokaal gecached; een **Ververs**-knop haalt de
  laatste stand op, en dat gebeurt ook vanzelf als de cache ouder dan 2 weken is
- **Geluid + trilling** zodra een camera binnen de ingestelde afstand komt
  (instelbaar: 300 m – 1,5 km), met een duidelijke banner bovenaan
- Waarschuwt bij voorkeur alleen voor camera's **in je rijrichting** (op basis
  van je GPS-koers), zodat je niet gestoord wordt door camera's op een andere weg
- **Zelf camera's toevoegen** op je huidige locatie (bijv. mobiele controles die
  OSM mist) — deze blijven lokaal op je apparaat bewaard en zijn los te verwijderen
- Werkt het betrouwbaarst met de app **open en actief** (bv. telefoon in een
  houder); zoals bij vrijwel elke navigatie-PWA werken meldingen niet
  gegarandeerd door als het scherm vergrendeld is

**Cabrio**

- **Kap open of dicht?** — duidelijk advies op basis van live weerdata op je
  huidige locatie: temperatuur, windstoten, regenkans en UV-index
- Weerdata komt **gratis en automatisch** van Open-Meteo (geen account of
  sleutel nodig) en ververst vanzelf elke 15 minuten
- **Uurverwachting voor vandaag**, zodat je in één oogopslag ziet wanneer
  het (nog) een goed moment is om de kap open te doen
- Zelf in te stellen **grenzen**: vanaf welke temperatuur, tot welke wind en
  tot welke regenkans jij het nog prima vindt
- Geen opslag nodig — alleen je eigen drempelwaarden blijven lokaal bewaard

**Garage**

- **Twee auto's** (Spider 916 en MiTo), elk met eigen kilometerstand,
  logboek, datums, detailing-historie en foto's
- Komt **voorgevuld** met de bekende historie van de Spider (o.a. de grote
  200.000 km-beurt + APK van 08-06-2026, banden, bougies en het
  startonderbreker-aandachtspunt) — eenmalig ingeladen, daarna gewoon
  lokaal aan te vullen
- **Onderhoudslogboek**: leg vast wat er is gedaan (onderhoud, reparatie,
  APK, overig) met kilometerstand — ook **in te spreken** met de microfoon,
  handig met vieze handen in de garage
- **Belangrijke datums**: APK, verzekering en onderhoudsbeurt, met een
  melding 14 dagen van tevoren (zelfde meldingssysteem als de Agenda)
- **Detailing-workflow**: de vaste volgorde (insectenverwijderaar → Korrosol
  → klei → polijsten → wax, plus leerverzorging voor de Spider) met per stap
  hoe lang geleden die is gedaan en wanneer die weer "toe aan" is
- **Wasdag-advies** op basis van live weerdata (Open-Meteo): regen(kans),
  temperatuur, felle zon en wind bepalen of het een goede was/wax-dag is
- **Fototijdlijn per auto** (lokaal, IndexedDB) om poets- en
  restauratieresultaten door de tijd heen vast te leggen

**Afbeeldingen**

- Typ een omschrijving en genereer een **hoge-resolutie 3D-render-stijl**
  afbeelding — werkt direct, geen account, sleutel of eigen backend nodig
  (gratis via [Pollinations.ai](https://pollinations.ai))
- Kies de afmeting (vierkant, breed of staand) en optioneel een
  3D-render-stijl die aan je omschrijving wordt toegevoegd
- Gegenereerde afbeeldingen blijven **lokaal op je apparaat** (IndexedDB) in
  een galerij, met lightbox om te downloaden of te verwijderen

**Stem**

- Neem opnames van jezelf op (microfoon in de browser) en **kloon je eigen
  stem** via [Fish Audio](https://fish.audio) — vereist een eigen (gratis,
  voor persoonlijk gebruik) Fish Audio API-key, ingevuld in de tab zelf
- Typ tekst en laat die **voorlezen in je gekloonde stem**; gegenereerde
  fragmenten blijven als **geschiedenis** bewaard (lokaal, IndexedDB), met
  afspelen, downloaden en verwijderen
- De API-key en de gekloonde stem worden alleen **lokaal in je browser**
  bewaard (`localStorage`); aanroepen gaan rechtstreeks van de app naar Fish
  Audio, er is geen eigen backend/Worker voor nodig
- Kloon alleen stemmen waar je zelf toestemming voor hebt (je eigen stem)

**Secretaresse**

- Log in met je **Outlook/Microsoft 365**-account (OAuth, geen wachtwoord
  gaat via deze app of de Worker)
- **Postvak in**: nieuwste mail met lezen/ongelezen, archiveren, verwijderen
  en een snelle reactie versturen
- **Agenda**: aankomende afspraken bekijken, nieuwe aanmaken en verwijderen
- **Meldingen — ook met vergrendeld scherm**: via je eigen Cloudflare Worker
  (Microsoft Graph-webhooks + Web Push) krijg je een seintje bij nieuwe mail
  en vlak voor een afspraak begint, zonder dat de app open hoeft te staan
- Vereist eenmalig een gratis **Azure-app-registratie** en **VAPID-sleutels**
  op je Worker — zie [`worker/DEPLOY.md`](worker/DEPLOY.md)

**Algemeen**

- Alles blijft lokaal opgeslagen op je apparaat (`localStorage`) — geen account nodig
- Installeerbaar op je startscherm (PWA) en werkt offline
- Daglog, Agenda én tijdregistratie synchroniseren optioneel via dezelfde
  Cloudflare-koppeling, zodat al je apparaten (en je horloge) gelijklopen
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

### Elke module als eigen app

Elke module is ook **onafhankelijk** te installeren, met eigen naam, kleur en
icoon. Open de module en tik rechtsboven op ⧉ (of ga direct naar
`…/?app=agenda`, `…/?app=garage`, enz.) en installeer vanaf daar zoals
hierboven. Zo krijg je bijvoorbeeld "Agenda", "Garage" en "Cabrio" als aparte
apps naast elkaar op je telefoon; elke app opent direct in die module, zonder
startscherm eromheen. (Op Android/Chrome en desktop krijgt elke app zijn eigen
icoon en naam via een eigen manifest; op iOS deel-knop → *Zet op beginscherm*
vanaf de `?app=…`-pagina.)

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
src/App.jsx                   app-shell: startscherm met tegels + standalone-modus (?app=…)
src/apps.js                   registry van alle mini-apps (naam, kleur, icoon)
src/DagLog.jsx                het daglog-component (UI + logica)
src/Meldingen.jsx              het meldingen-component (ongevallenmeldingsformulier)
src/meldingen.js               opslag (IndexedDB), instellingen & mailto-opbouw voor meldingen
src/Agenda.jsx                het agenda/planner-component (UI + logica)
src/agenda.js                 opslag & helpers voor agenda-items
src/TimeLog.jsx               het tijdregistratie-component (UI + logica)
src/timelog.js                opslag, sessies & daganalyse voor tijdregistratie
src/Vakantie.jsx               het vakantie-component (fototijdlijn + lightbox)
src/vakantie.js                opslag (IndexedDB) & verkleinen/comprimeren van foto's
src/Flitsers.jsx               het flitsers-component (kaart, GPS, waarschuwing)
src/flitsers.js                opslag, OSM-databron (Overpass) & geo-berekeningen
src/Cabrio.jsx                  de cabrio-tab (weeradvies kap open/dicht)
src/cabrio.js                   instellingen, Open-Meteo-databron & advieslogica
src/Images3D.jsx                de afbeeldingen-tab (prompt → 3D-afbeelding, galerij)
src/images3d.js                 opslag (IndexedDB) van gegenereerde afbeeldingen
src/images3dApi.js              client voor Pollinations.ai (gratis, geen key nodig)
src/Voice.jsx                   de stem-tab (opnemen, klonen, voorlezen, geschiedenis)
src/voice.js                    instellingen (API-key, voice-id) + opslag (IndexedDB) van fragmenten
src/voiceApi.js                 client voor Fish Audio (eigen API-key nodig)
src/Secretary.jsx              de secretaresse-tab (mail, agenda, meldingen)
src/msAuth.js                  Microsoft-inloggen (OAuth2 + PKCE)
src/secretaryApi.js            client voor de Secretaresse-endpoints op de Worker
src/graph.js                   Microsoft Graph-aanroepen (mail/agenda)
src/notify.js                 meldingen (Notification Triggers + in-app fallback)
src/theme.js                  gedeelde CSS/design-tokens
src/storage.js                localStorage-persistentie (daglog)
src/sync.js                   client voor de Cloudflare-backend (sync)
src/index.css                 Tailwind
public/manifest.webmanifest   PWA-manifest van het verzamel-startscherm
public/manifest-*.webmanifest per-app manifesten (losse installatie, gegenereerd)
public/icons/*.svg            per-app iconen (gegenereerd)
scripts/generate-app-assets.mjs  genereert per-app manifesten + iconen (npm run gen:apps)
public/sw.js                  service worker (offline caching + melding-clicks)
public/icon-*.png, icon.svg   app-iconen
worker/                       Cloudflare Worker backend (+ DEPLOY.md)
```
