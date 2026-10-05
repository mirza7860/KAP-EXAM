import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A plain web app: no service worker, no manifest, no install prompt, no
// offline cache. Exam traffic must never come from a cache, and a stale
// precached shell during an exam is a correctness bug, not a convenience - so
// nothing sits between the browser and the network.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
