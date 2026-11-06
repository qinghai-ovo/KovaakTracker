import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    // Rust build output under src-tauri/target is large and never imported by the page.
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      "/evxl-proxy": {
        target: "https://evxl.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/evxl-proxy/, ""),
      },
      "/kovaaks-proxy": {
        target: "https://kovaaks.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kovaaks-proxy/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        react: "react.html",
        app: "app.html",
      },
    },
  },
});
