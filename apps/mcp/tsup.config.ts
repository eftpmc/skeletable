import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  // Bundle workspace packages; they ship as TypeScript source.
  noExternal: [/^@skeleton\//],
});
