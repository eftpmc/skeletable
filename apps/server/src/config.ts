import { deploymentSchema } from "@closet/shared";
import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  PUBLIC_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  DEPLOYMENT: deploymentSchema.default("selfhost"),
  SIGNUPS_ENABLED: booleanFromEnv.default(true),
  SERVER_NAME: z.string().default("Closet"),
  APP_VERSION: z.string().default("0.0.0-dev"),
  DATA_DIR: z.string().default("./data"),
  // Directory with the built web app. When set, the server also serves the UI.
  WEB_DIST: z.string().optional(),
  // Override where migrations are read from (the Docker image sets this).
  MIGRATIONS_DIR: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${issues.join("\n")}`);
  }
  return result.data;
}
