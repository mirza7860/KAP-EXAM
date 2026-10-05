import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The student app is a PWA because the exam must survive a flaky classroom
// network. Integrity rule: NEVER cache exam/answer API responses — only the
// app shell. A stale cached paper after close would be a correctness bug.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "KAP Exam",
        short_name: "KAP Exam",
        description: "Take your exam",
        theme_color: "#241d18",
        background_color: "#fdf9f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        // Chrome derives the app id from start_url when this is absent, so
        // moving the app under a different path later would strand every
        // existing install as a "new" app - second icon, lost storage. Pinned
        // to "/" (what Chrome is already using) to make the identity stable.
        id: "/",
        // PNGs first: installability on Android wants a real 192/512 raster,
        // and iOS ignores SVG entirely. The maskable tile is opaque edge to
        // edge because the launcher crops it over the wallpaper.
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // App shell only. API traffic is network-only, by design.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
