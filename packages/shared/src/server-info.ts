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
  signupsEnabled: z.boolean(),
});
export type ServerInfo = z.infer<typeof serverInfoSchema>;
