import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the API runs separately; proxy it so the browser sees one origin.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
