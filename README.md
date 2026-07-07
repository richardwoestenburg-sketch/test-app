# Daglog

Een journaal van hoe je je uren besteedt — een eenvoudige tijdlijn-app om door de
dag heen korte aantekeningen te maken, optioneel met je locatie.

Gebouwd met **React + Vite** en **Tailwind CSS**. Aantekeningen worden lokaal in je
browser bewaard (`localStorage`), er is geen server of account nodig.

## Functies

- Log activiteiten met een tijdstip en korte omschrijving
- Voeg optioneel je GPS-locatie toe aan een aantekening
- Aantekeningen gegroepeerd per dag ("Vandaag", "Gisteren", of de datum)
- Verwijder losse aantekeningen of wis alles in één keer
- Alles blijft lokaal opgeslagen op je apparaat

## Aan de slag

```bash
npm install      # dependencies installeren
npm run dev      # ontwikkelserver starten (http://localhost:5173)
npm run build    # productie-build maken in dist/
npm run preview  # de productie-build lokaal bekijken
```

## Structuur

```
index.html            entrypoint
src/main.jsx          React root
src/DagLog.jsx        het hoofdcomponent (UI + logica)
src/storage.js        localStorage-persistentie
src/index.css         Tailwind
```
