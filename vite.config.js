import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Een leesbaar versiestempel in de app zelf, zodat je op een telefoon kunt
// zien of een nieuwe versie er al op staat.
const stempel = new Date().toLocaleString("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(stempel) },
  // Relative base so the built app works when served from a GitHub Pages
  // project subpath (e.g. /test-app/) as well as from a domain root.
  base: "./",
  plugins: [react()],
});
