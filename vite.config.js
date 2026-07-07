import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the built app works when served from a GitHub Pages
  // project subpath (e.g. /test-app/) as well as from a domain root.
  base: "./",
  plugins: [react()],
});
