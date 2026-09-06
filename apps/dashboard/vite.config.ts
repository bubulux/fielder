import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    // Local dev: proxy API calls to `wrangler dev` (apps/worker, ACCESS_DEV_BYPASS on).
    proxy: { "/api": "http://localhost:8787", "/health": "http://localhost:8787" },
  },
});
