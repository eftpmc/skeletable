import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  // Bundle workspace packages; they ship as TypeScript source.
  noExternal: [/^@skeleton\//],
});
