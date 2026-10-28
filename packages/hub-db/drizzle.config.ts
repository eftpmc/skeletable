import { defineConfig } from "drizzle-kit";

// The hub has its own database, apart from the app's.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.HUB_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hub",
  },
});
