import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function copyLibarchiveRuntime() {
  return {
    name: "copy-libarchive-runtime",
    configResolved(config: { root: string; publicDir: string | false }) {
      if (!config.publicDir) return;
      const packageDist = resolve(
        config.root,
        "node_modules/libarchive.js/dist",
      );
      const target = resolve(config.publicDir, "libarchive");
      mkdirSync(target, { recursive: true });
      copyFileSync(
        resolve(packageDist, "worker-bundle.js"),
        resolve(target, "worker-bundle.js"),
      );
      copyFileSync(
        resolve(packageDist, "libarchive.wasm"),
        resolve(target, "libarchive.wasm"),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyLibarchiveRuntime(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Kage Reader",
        short_name: "Kage",
        description: "Offline manga, comic, and novel reader",
        theme_color: "#0b1210",
        background_color: "#0b1210",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,wasm}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  worker: { format: "es" },
});
