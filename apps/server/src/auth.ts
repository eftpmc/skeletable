import { type Db, schema } from "@closet/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Config } from "./config.js";

export function createAuth(config: Config, db: Db) {
  return betterAuth({
    appName: config.SERVER_NAME,
    baseURL: config.PUBLIC_URL,
    basePath: "/api/auth",
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.PUBLIC_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.SIGNUPS_ENABLED,
      minPasswordLength: 8,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
