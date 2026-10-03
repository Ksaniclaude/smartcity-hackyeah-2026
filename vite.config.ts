import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Konfiguracja PostCSS podana wprost, żeby Vite nie szukał plików konfiguracyjnych po starej aplikacji.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { host: true, port: 5173 },
});
