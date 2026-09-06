// Secrets at rest: AES-256-GCM with a server-held key (KEY_ENCRYPTION_KEY, 32 bytes base64).
// Layout of the stored string: base64(iv 12 | tag 16 | ciphertext).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
  const raw = process.env.KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("KEY_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("KEY_ENCRYPTION_KEY must be 32 bytes base64");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const b = Buffer.from(stored, "base64");
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), ct = b.subarray(28);
  const d = createDecipheriv("aes-256-gcm", masterKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export const hintOf = (secret: string) => (secret.length > 8 ? `…${secret.slice(-4)}` : "…");
