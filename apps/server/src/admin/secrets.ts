import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// API keys the owner enters are kept encrypted in the database, under a key derived from AUTH_SECRET:
// a copy of the database alone (a backup, a dump) doesn't give them away. Rotating AUTH_SECRET means
// entering them again.

const PREFIX = "v1:";

const keyFrom = (secret: string) => createHash("sha256").update(`server-settings:${secret}`).digest();

export function encryptSecret(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** Null when it can't be read: written under a different AUTH_SECRET, or not one of ours. */
export function decryptSecret(sealed: string, secret: string): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The last few characters, so the owner can tell which key is in use without seeing it. */
export const hintOf = (value: string) => `…${value.slice(-4)}`;
