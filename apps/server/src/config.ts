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
  // Set to true when running behind a reverse proxy (Caddy, nginx, Traefik…) that sets X-Forwarded-For.
  TRUST_PROXY: booleanFromEnv.default(false),
  // Let link import reach private network addresses. Leave off unless you need it.
  ALLOW_PRIVATE_FETCH: booleanFromEnv.default(false),
  // Search sources. Each is off until configured.
  // Comma-separated Shopify store domains; add "|used" for secondhand shops, e.g. "shop.example.com|used".
  SHOPIFY_STORES: z.string().optional(),
  SHOPIFY_PROTOCOL: z.enum(["https", "http"]).default("https"),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_MARKETPLACE: z.string().default("EBAY_US"),
  EBAY_API_BASE: z.string().url().optional(),
  BESTBUY_API_KEY: z.string().optional(),
  BESTBUY_API_BASE: z.string().url().optional(),
  // Store logos come from each store's own site. When a site has none we can read, ask Google's
  // favicon service (it only sees the store's domain). "none" keeps every request on the store itself.
  STORE_ICON_FALLBACK: z.enum(["google", "none"]).default("google"),
  // How often saved searches re-run and watched prices are checked. 0 turns it off.
  ALERTS_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(360),
  // Override where migrations are read from (the Docker image sets this).
  MIGRATIONS_DIR: z.string().optional(),
  // A catalog pack (gzipped JSON lines from lab/brands/export.py) to import on start when it's new.
  // The Docker image sets this to the pack it ships.
  CATALOG_PACK: z.string().optional(),
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
