import { type ServerInfo, serverInfoSchema } from "@closet/shared";

export async function getServerInfo(): Promise<ServerInfo> {
  const response = await fetch("/api/info");
  if (!response.ok) throw new Error(`Failed to load server info (${response.status})`);
  return serverInfoSchema.parse(await response.json());
}
