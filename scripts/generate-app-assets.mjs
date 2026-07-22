// Genereert per mini-app een PWA-manifest (public/manifest-<key>.webmanifest)
// en een icoon (public/icons/<key>.svg) vanuit de registry in src/apps.js.
// Draai `npm run gen:apps` na een wijziging in src/apps.js en commit de
// gegenereerde bestanden mee.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { APPS } from "../src/apps.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(join(pub, "icons"), { recursive: true });

for (const app of APPS) {
  // Icoon: afgeronde tegel met de app-gradient en de beginletter.
  // De letter blijft binnen de veilige zone van maskable icons.
  const letter = app.name[0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${app.bright}"/>
      <stop offset="1" stop-color="${app.accent}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#g)"/>
  <text x="256" y="278" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="250" font-weight="700"
    fill="#ffffff">${letter}</text>
</svg>
`;
  writeFileSync(join(pub, "icons", `${app.key}.svg`), svg);

  // Manifest: eigen id/start_url per app, zodat de browser elke module als
  // aparte installeerbare app ziet — met eigen naam, kleur en icoon.
  const manifest = {
    id: `./?app=${app.key}`,
    name: app.name,
    short_name: app.name,
    description: app.tagline,
    lang: "nl",
    start_url: `./?app=${app.key}`,
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fc",
    theme_color: app.accent,
    icons: [
      { src: `icons/${app.key}.svg`, sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(
    join(pub, `manifest-${app.key}.webmanifest`),
    JSON.stringify(manifest, null, 2) + "\n"
  );
}

console.log(`Gegenereerd: ${APPS.length} manifesten + iconen in public/`);
