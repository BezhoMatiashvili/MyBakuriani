/**
 * Keepz hybrid encryption: AES-256-CBC for the payload, RSA-OAEP (SHA-256 for
 * both the digest and MGF1) for the "base64(key).base64(iv)" string. Byte-for-
 * byte the scheme of the Node example in Keepz's docs
 * (developers.keepz.me → eCommerce → Cryptography → Node.js).
 *
 * Requests are encrypted to KEEPZ's public key; Keepz encrypts its responses to
 * OUR public key, which we open with our private key. Encryption to our public
 * key does not authenticate the sender — only a response to a request we sent
 * over TLS to the fixed Keepz base URL is trusted (see client.ts).
 *
 * Pure module (node:crypto only, no `@/` imports) so scripts/unit can load it.
 */
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from "node:crypto";

export interface KeepzEnvelope {
  encryptedData: string;
  encryptedKeys: string;
}

/** Thrown for any key or envelope that cannot be used. Carries no payload data. */
export class KeepzCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeepzCryptoError";
  }
}

const OAEP = {
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
} as const;

// Standard base64 alphabet only; the caps bound the work done on untrusted input.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_ENCRYPTED_DATA_CHARS = 64 * 1024;
const MAX_ENCRYPTED_KEYS_CHARS = 2048;

/** Keepz's public key, as issued: single-line base64 of a DER SPKI structure. */
export function importKeepzPublicKey(base64Der: string): KeyObject {
  try {
    return createPublicKey({
      key: Buffer.from(base64Der.trim(), "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new KeepzCryptoError("invalid Keepz public key");
  }
}

/** Our private key: single-line base64 of a DER PKCS#8 structure. */
export function importOwnPrivateKey(base64Der: string): KeyObject {
  try {
    return createPrivateKey({
      key: Buffer.from(base64Der.trim(), "base64"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    throw new KeepzCryptoError("invalid private key");
  }
}

export function isKeepzEnvelope(value: unknown): value is KeepzEnvelope {
  if (!value || typeof value !== "object") return false;
  const { encryptedData, encryptedKeys } = value as Record<string, unknown>;
  return (
    typeof encryptedData === "string" &&
    typeof encryptedKeys === "string" &&
    encryptedData.length > 0 &&
    encryptedKeys.length > 0 &&
    encryptedData.length <= MAX_ENCRYPTED_DATA_CHARS &&
    encryptedKeys.length <= MAX_ENCRYPTED_KEYS_CHARS &&
    BASE64_RE.test(encryptedData) &&
    BASE64_RE.test(encryptedKeys)
  );
}

export function encryptEnvelope(
  payload: unknown,
  keepzPublicKey: KeyObject,
): KeepzEnvelope {
  // Fresh key and IV per message, as the Keepz guide requires.
  const aesKey = randomBytes(32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
  const encryptedData = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const keyBlock = `${aesKey.toString("base64")}.${iv.toString("base64")}`;
  const encryptedKeys = publicEncrypt(
    { key: keepzPublicKey, ...OAEP },
    Buffer.from(keyBlock, "utf8"),
  );
  return {
    encryptedData: encryptedData.toString("base64"),
    encryptedKeys: encryptedKeys.toString("base64"),
  };
}

export function decryptEnvelope(
  envelope: KeepzEnvelope,
  ownPrivateKey: KeyObject,
): unknown {
  if (!isKeepzEnvelope(envelope)) {
    throw new KeepzCryptoError("malformed envelope");
  }
  try {
    const keyBlock = privateDecrypt(
      { key: ownPrivateKey, ...OAEP },
      Buffer.from(envelope.encryptedKeys, "base64"),
    ).toString("utf8");
    const parts = keyBlock.split(".");
    if (parts.length !== 2) throw new Error("key block");
    const aesKey = Buffer.from(parts[0], "base64");
    const iv = Buffer.from(parts[1], "base64");
    if (aesKey.length !== 32 || iv.length !== 16) throw new Error("key size");
    const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
    const plain = Buffer.concat([
      decipher.update(Buffer.from(envelope.encryptedData, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    // One generic error: never echo key material or plaintext fragments.
    throw new KeepzCryptoError("envelope could not be decrypted");
  }
}
