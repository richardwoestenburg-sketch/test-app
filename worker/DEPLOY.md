# Daglog backend op Cloudflare zetten

Deze Worker slaat je aantekeningen op in Cloudflare KV, zodat je telefoon, je
Wear OS-horloge en elke browser dezelfde daglog delen. Gratis-tier is ruim
voldoende.

Er zijn twee manieren:

- **Zonder computer** — helemaal via de Cloudflare-website in je telefoonbrowser
  (geen terminal). Zie hieronder: "Zonder computer".
- **Met een computer** — via de `wrangler` command line. Zie verderop: "Met een
  computer (wrangler)".

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

## 2. Opslag (KV) aanmaken

```bash
npx wrangler kv namespace create DAGLOG_KV
```

Dit print een `id`. Zet die in **`wrangler.toml`** op de plek van
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

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

Tik **Opslaan & verbinden**. Vanaf nu synct de app met je backend.

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

## Beheer / opmerkingen

- **Kosten:** blijft normaal €0 (Cloudflare gratis-tier: 100k requests/dag).
- **Privacy:** je aantekeningen staan nu op je eigen Cloudflare-account.
- **Sleutel kwijt of gelekt?** Zet een nieuwe met `npx wrangler secret put
  DAGLOG_TOKEN` en werk 'm bij in de app en op je horloge.
- **Logs bekijken:** `npx wrangler tail`.
