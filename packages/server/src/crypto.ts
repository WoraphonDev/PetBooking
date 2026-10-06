// AES-256-GCM for stored secrets (line_channel.channel_secret_enc / channel_access_token_enc, 01 §6).
// Format: `v1:<iv>:<tag>:<cipher>` (base64 parts), random 12-byte iv per value.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function loadKey(key?: string): Buffer {
  const raw = key ?? process.env.APP_ENCRYPTION_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes base64");
  return buf;
}

export function encryptSecret(plain: string, key?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(key), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(value: string, key?: string): string {
  const [version, iv, tag, enc] = value.split(":");
  if (version !== VERSION || !iv || !tag || enc === undefined) throw new Error("Unsupported encrypted value");
  try {
    const decipher = createDecipheriv("aes-256-gcm", loadKey(key), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // never echo the ciphertext or key
    throw new Error("Decryption failed");
  }
}
