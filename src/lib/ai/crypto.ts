import crypto from "crypto";

// AES-256-GCM encryption for user-supplied API keys at rest. The key column in
// ai_credentials only ever holds this ciphertext; decryption happens exclusively
// in server routes that hold AI_ENCRYPTION_KEY.
const ALGO = "aes-256-gcm";

function key(): Buffer {
  // sha256 of the env secret → always a valid 32-byte key regardless of format.
  return crypto.createHash("sha256").update(process.env.AI_ENCRYPTION_KEY || "focusspace-dev-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivb, tagb, datab] = payload.split(".");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(datab, "base64")), decipher.final()]).toString("utf8");
}
