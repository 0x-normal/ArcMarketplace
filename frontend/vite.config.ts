import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Output to repo-root `dist/` so Vercel's default outputDirectory resolves correctly.
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3220",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3220",
        changeOrigin: true,
      },
    },
  },
});
