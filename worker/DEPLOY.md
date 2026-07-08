# Daglog backend op Cloudflare zetten

Deze Worker slaat je aantekeningen op in Cloudflare KV, zodat je telefoon, je
Wear OS-horloge en elke browser dezelfde daglog delen. Gratis-tier is ruim
voldoende.

Er zijn drie manieren:

- **Eén knop (aanbevolen, werkt op de telefoon)** — de "Deploy to Cloudflare"-
  knop hieronder. Cloudflare bouwt de Worker vanuit deze repo en maakt de opslag
  automatisch aan. Geen code plakken.
- **Zonder computer, handmatig** — via de Cloudflare-website. Zie "Zonder
  computer".
- **Met een computer** — via de `wrangler` command line. Zie "Met een computer".

---

## Eén knop: Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/richardwoestenburg-sketch/test-app/tree/main/worker)

1. Tik de knop hierboven (of open:
   `https://deploy.workers.cloudflare.com/?url=https://github.com/richardwoestenburg-sketch/test-app/tree/main/worker`).
2. Log in bij Cloudflare en geef toestemming om met je GitHub te verbinden
   (er wordt een kopie van de repo op je GitHub gezet).
3. De wizard toont de Worker `daglog-api` en de KV-binding `DAGLOG_KV`. Laat
   Cloudflare de KV-namespace **aanmaken/provisionen** (dat gaat vanzelf).
4. Tik **Deploy** / **Create and deploy**.
5. **Zet daarna de sleutel**: open de Worker → **Settings** → **Variables and
   Secrets** → **Add** → naam exact `DAGLOG_TOKEN`, waarde = een zelfgekozen lang
   wachtwoord, type **Secret** → opslaan. (Zonder deze sleutel weigert de API
   alle verzoeken — dat is de bedoeling.)
6. Noteer het Worker-adres (`https://daglog-api.<jouwnaam>.workers.dev`) en
   koppel de app: tandwiel ⚙️ → Worker-URL + je `DAGLOG_TOKEN` →
   **Opslaan & verbinden**.

Ga daarna verder bij "Vanaf je Wear OS-horloge inspreken" onderaan.

---

## Zonder computer (alleen je telefoon)

Fiddly op een klein scherm, maar het werkt. Je hoeft niets te installeren.

### 1. Account
Ga in je browser naar https://dash.cloudflare.com/sign-up en maak een gratis
account (of log in).

### 2. Maak de Worker
Menu **Workers & Pages** → **Create** → **Create Worker** → naam `daglog-api` →
**Deploy** (de standaard "hello world" is prima).

### 3. Plak de code
Open deze link en kopieer **alle** tekst:

```
https://raw.githubusercontent.com/richardwoestenburg-sketch/test-app/main/worker/src/worker.js
```

Terug bij je Worker → **Edit code** → wis alles → plak → **Deploy**.

### 4. Opslag (KV) aanmaken en koppelen
- Menu **Storage & Databases** → **KV** → **Create namespace** → naam `DAGLOG`.
- Terug naar je Worker → **Settings** → **Bindings** (of "Variables") →
  **Add binding** → type **KV namespace** → *Variable name* exact `DAGLOG_KV` →
  kies de namespace `DAGLOG` → opslaan.

### 5. Geheime sleutel
Worker → **Settings** → **Variables and Secrets** → **Add** → naam exact
`DAGLOG_TOKEN`, waarde = een zelfgekozen lang wachtwoord, type **Secret /
Encrypt** → opslaan.

### 6. URL ophalen
Bovenaan je Worker staat het adres, iets als
`https://daglog-api.<jouwnaam>.workers.dev`.

### 7. App koppelen
Open Daglog → tandwiel ⚙️ → **Worker-URL** = die workers.dev-URL, **Sleutel** =
je `DAGLOG_TOKEN` → **Opslaan & verbinden**. Bij "Verbonden ✓" staat de sync.

Ga daarna verder bij "Vanaf je Wear OS-horloge inspreken" onderaan.

---

## Met een computer (wrangler)

Je doet dit één keer, op een computer met Node.js. Alle commando's draai je in
de map `worker/`.

## 1. Cloudflare-account + inloggen

1. Maak (gratis) een account op https://dash.cloudflare.com/sign-up.
2. In de map `worker/`:

   ```bash
   npm install
   npx wrangler login
   ```

   Er opent een browser om de toegang te bevestigen.

## 2. Opslag (KV)

`wrangler.toml` bindt `DAGLOG_KV` zonder id, dus `wrangler deploy` (stap 4)
maakt de KV-namespace automatisch aan. Je hoeft hier niets te doen.

Wil je een bestaande namespace gebruiken? Maak 'm dan zo aan en zet de `id`
in `wrangler.toml`:

```bash
npx wrangler kv namespace create DAGLOG_KV
```

## 3. Een geheime sleutel instellen

Kies zelf een lang, willekeurig wachtwoord (dit is je "sleutel" — je gebruikt
'm straks in de app en op je horloge). Bijvoorbeeld met:

```bash
# genereer iets willekeurigs (of verzin zelf een lange reeks):
openssl rand -hex 24
```

Zet die als secret:

```bash
npx wrangler secret put DAGLOG_TOKEN
# plak de sleutel als daarom gevraagd wordt
```

## 4. Deployen

```bash
npx wrangler deploy
```

Aan het eind zie je de URL, bijvoorbeeld:

```
https://daglog-api.<jouw-subdomein>.workers.dev
```

Bewaar die URL.

## 5. De app koppelen

Open Daglog (https://richardwoestenburg-sketch.github.io/test-app/) →
tik op het tandwiel ⚙️ rechtsboven → vul in:

- **Worker-URL:** de URL uit stap 4
- **Sleutel:** je `DAGLOG_TOKEN` uit stap 3

Tik **Opslaan & verbinden**. Vanaf nu synct de app met je backend — zowel je
**Daglog** als je **Agenda** worden via dezelfde koppeling tussen je apparaten
gedeeld. (Draaide je al een oudere Worker? Deploy `worker/` opnieuw zodat de
nieuwe `/agenda`-endpoints meekomen.)

## 6. Vanaf je Wear OS-horloge inspreken

De Worker heeft een simpel eindpunt speciaal voor het horloge:

```
GET  https://<jouw-worker>/log?key=<SLEUTEL>&text=<wat je zei>
```

Roep dat aan met een gesproken tekst. De makkelijkste manier zonder
programmeren:

**Optie A — HTTP Shortcuts (aanbevolen, gratis)**
1. Installeer **HTTP Shortcuts** (Android, ook een Wear OS-tegel).
2. Nieuwe shortcut → Methode **GET** → URL:
   `https://<jouw-worker>/log`
3. Voeg query-parameters toe:
   - `key` = je sleutel
   - `text` = kies **"Vraag om invoer"** (dan kun je bij het starten inspreken
     via de microfoon van je toetsenbord)
4. Zet de shortcut op je Wear OS-tegels. Eén tik op je horloge → inspreken →
   klaar; de aantekening staat meteen in je Daglog.

**Optie B — Tasker + AutoWear**
Voor wie al Tasker gebruikt: laat AutoWear een spraakcommando opvangen en met
een *HTTP Request*-actie de bovenstaande URL aanroepen (`text` = de herkende
spraak).

## 7. Tijd registreren vanaf je horloge (OnePlus Watch 2 / Wear OS)

De Worker heeft een tweede horloge-eindpunt voor **tijdregistratie**. Eén tik
start (of wisselt naar) een activiteit; de lopende activiteit stopt automatisch.
Het verschijnt meteen in het **Tijd**-tabblad op je telefoon en laptop.

```
GET  https://<jouw-worker>/track?key=<SLEUTEL>&label=<activiteit>   # start/wissel
GET  https://<jouw-worker>/track?key=<SLEUTEL>&stop=1               # stop
```

**Instellen met HTTP Shortcuts (aanbevolen):**
1. Installeer **HTTP Shortcuts** (Android) — die heeft Wear OS-tegels.
2. Maak per vaste activiteit een shortcut → Methode **GET** → URL:
   `https://<jouw-worker>/track` met parameters `key` = je sleutel en
   `label` = de activiteit (bijv. `Bellen`, `Overleg`, `Administratie`).
3. Maak nog één shortcut **Stop**: URL `https://<jouw-worker>/track` met
   `key` = je sleutel en `stop` = `1`.
4. Zet die shortcuts als **tegels** op je OnePlus Watch 2. Eén tik op de tegel
   → de activiteit loopt; tik een andere tegel om te wisselen, of **Stop**.

> Deze tijdregistratie-endpoints (`/track`, `/sessions`) zijn nieuw — draaide je
> al een oudere Worker, deploy `worker/` dan opnieuw zodat ze meekomen.

## Beheer / opmerkingen

- **Kosten:** blijft normaal €0 (Cloudflare gratis-tier: 100k requests/dag).
- **Privacy:** je aantekeningen staan nu op je eigen Cloudflare-account.
- **Sleutel kwijt of gelekt?** Zet een nieuwe met `npx wrangler secret put
  DAGLOG_TOKEN` en werk 'm bij in de app en op je horloge.
- **Logs bekijken:** `npx wrangler tail`.
