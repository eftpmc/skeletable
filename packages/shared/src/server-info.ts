import { z } from "zod";

export const deploymentSchema = z.enum(["cloud", "selfhost"]);
export type Deployment = z.infer<typeof deploymentSchema>;

/**
 * Public, unauthenticated description of a server. Clients read this first
 * (for example, the native app's server picker) to decide how to talk to it.
 */
export const serverInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  deployment: deploymentSchema,
  /** Anyone can create an account (always true while the server has no accounts yet). */
  signupsEnabled: z.boolean(),
  /** Sign-ups are closed and there are no accounts yet: the first one to sign up owns the server. */
  needsSetup: z.boolean(),
  /** Signed-out visitors can search and open products. */
  publicSearch: z.boolean(),
});
export type ServerInfo = z.infer<typeof serverInfoSchema>;
