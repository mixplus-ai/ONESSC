import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// OCR language data for reading SNs from photos, served from our own site (no CDN at run time)
const require = createRequire(import.meta.url);
const ENG = require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz");
const tesseractLang = (): Plugin => ({
  name: "tesseract-lang",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "tesseract/eng.traineddata.gz", source: readFileSync(ENG) });
  },
  configureServer(server) {
    server.middlewares.use("/tesseract/eng.traineddata.gz", (_req, res) => res.end(readFileSync(ENG)));
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), tesseractLang()],
});
