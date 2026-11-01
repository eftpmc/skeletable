import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  // In development the data comes from the server on its usual port.
  server: { proxy: { "/api": "http://localhost:4200", "/auth": "http://localhost:4200" } },
});
