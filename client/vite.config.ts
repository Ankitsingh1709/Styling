import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + image requests to the Express server on :3001,
// so the browser talks to a single origin (localhost:5173).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/storage": "http://localhost:3001",
    },
  },
});
