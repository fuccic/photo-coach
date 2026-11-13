import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";

const { exifrForHermes } = createRequire(import.meta.url)("./scripts/exifr-hermes.js");

export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("../src/lib", import.meta.url)),
      // The same exifr copy the app uses (see metro.config.js).
      exifr: exifrForHermes(),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
