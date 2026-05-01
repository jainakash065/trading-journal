import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "client",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4174",
      "/uploads": "http://127.0.0.1:4174"
    }
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true
  }
});
