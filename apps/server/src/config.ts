import { deploymentSchema } from "@skeleton/shared";
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
  // Anyone can create an account. The first account (the owner) can always be created.
  // Defaults to on in the cloud, off when self-hosting.
  SIGNUPS_ENABLED: booleanFromEnv.optional(),
  // Signed-out visitors can search and open products. Defaults to on in the cloud, off when self-hosting.
  PUBLIC_SEARCH: booleanFromEnv.optional(),
  SERVER_NAME: z.string().default("skeleton"),
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
  OPENAI_API_KEY: z.string().optional(),
  SEARCH_INTENT_MODEL: z.string().default("gpt-5.6-luna"),
  SEARCH_INTENT_ENABLED: booleanFromEnv.default(false),
  SEARCH_INTENT_DAILY_LIMIT: z.coerce.number().int().min(0).default(1000),
  // Store logos come from each store's own site. When a site has none we can read, ask Google's
  // favicon service (it only sees the store's domain). "none" keeps every request on the store itself.
  STORE_ICON_FALLBACK: z.enum(["google", "none"]).default("google"),
  // How often saved searches re-run and watched prices are checked. 0 turns it off.
  ALERTS_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(360),
  // Email for the morning alert digest. Set EMAIL_FROM and one way to send: an SMTP URL
  // (smtp://user:pass@host:587) or a Resend API key (works where outbound SMTP is blocked).
  EMAIL_FROM: z.string().optional(),
  SMTP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Local hour (in each person's time zone) the digest goes out.
  DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  // Override where migrations are read from (the Docker image sets this).
  MIGRATIONS_DIR: z.string().optional(),
  // A catalog pack (gzipped JSON lines from lab/brands/export.py) to import on start when it's new.
  // The Docker image sets this to the pack it ships.
  // Or an https URL to download it from, for a catalog too big to ship in the image.
  CATALOG_PACK: z.string().optional(),
  // The pack's SHA-256, to refuse a download that isn't the one expected.
  CATALOG_PACK_SHA256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  // The Meilisearch server holding the catalog's text search (rebuilt from the database as needed).
  MEILI_URL: z.string().url().default("http://localhost:7700"),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_INDEX: z.string().regex(/^[A-Za-z0-9_-]+$/).default("catalog_items"),
});

// Settings whose default depends on the deployment.
const resolvedSchema = configSchema.transform((config) => ({
  ...config,
  SIGNUPS_ENABLED: config.SIGNUPS_ENABLED ?? config.DEPLOYMENT === "cloud",
  PUBLIC_SEARCH: config.PUBLIC_SEARCH ?? config.DEPLOYMENT === "cloud",
}));

export type Config = z.infer<typeof resolvedSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = resolvedSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${issues.join("\n")}`);
  }
  return result.data;
}
