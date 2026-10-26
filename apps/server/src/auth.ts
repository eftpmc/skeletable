import { type Db, schema } from "@closet/db";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { CLIENT_IP_HEADER } from "./client-ip.js";
import type { Config } from "./config.js";

/** True once the server has an account. Until then, the first sign-up sets it up whatever SIGNUPS_ENABLED says. */
export async function hasAccounts(db: Db) {
  const [row] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  return row !== undefined;
}

export function createAuth(config: Config, db: Db) {
  return betterAuth({
    appName: config.SERVER_NAME,
    baseURL: config.PUBLIC_URL,
    basePath: "/api/auth",
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.PUBLIC_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    advanced: {
      // Set by our server from the connection (see client-ip.ts), so rate limits are per client.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            if (!config.SIGNUPS_ENABLED && (await hasAccounts(db))) {
              throw new APIError("FORBIDDEN", { message: "Sign-ups are closed on this server." });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
