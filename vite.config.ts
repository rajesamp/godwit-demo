import { defineConfig } from "vite";

// Frontend lives in web/. The dev server proxies API calls to the thin TS
// backend so the browser never talks to Vertex (or holds a credential) directly.
export default defineConfig({
  root: "web",
  server: {
    port: 5173,
    proxy: {
      "/run": { target: "http://localhost:8787", changeOrigin: true },
      "/health": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
