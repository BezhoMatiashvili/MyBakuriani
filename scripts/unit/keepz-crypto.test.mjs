import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  decryptEnvelope,
  encryptEnvelope,
  importKeepzPublicKey,
  importOwnPrivateKey,
  isKeepzEnvelope,
  KeepzCryptoError,
} from "../../src/lib/payments/keepz/crypto.ts";

// Two throwaway key pairs in the formats Keepz exchanges: base64 DER SPKI /
// PKCS#8. "keepz" plays the gateway, "ours" plays MyBakuriani.
function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicB64: publicKey.toString("base64"),
    privateB64: privateKey.toString("base64"),
  };
}
const keepz = keyPair();
const ours = keyPair();

// Verbatim port of the class in Keepz's docs (developers.keepz.me →
// eCommerce → Cryptography → Node.js example). Interop with it in both
// directions is what proves our envelopes will be readable by Keepz.
class KeepzDocsExample {
  constructor(rsaPublicKey, rsaPrivateKey) {
    this.rsaPublicKey = rsaPublicKey;
    this.rsaPrivateKey = rsaPrivateKey;
  }
  encrypt(data) {
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
    const encryptedData = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(data), "utf8")),
      cipher.final(),
    ]);
    const concat = `${aesKey.toString("base64")}.${iv.toString("base64")}`;
    const rsaPublicKey = crypto.createPublicKey({
      key: Buffer.from(this.rsaPublicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const encryptedKeys = crypto.publicEncrypt(
      {
        key: rsaPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(concat, "utf8"),
    );
    return {
      encryptedData: encryptedData.toString("base64"),
      encryptedKeys: encryptedKeys.toString("base64"),
    };
  }
  decrypt(encryptedDataB64, encryptedKeysB64) {
    const rsaPrivateKey = crypto.createPrivateKey({
      key: Buffer.from(this.rsaPrivateKey, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const decryptedConcat = crypto
      .privateDecrypt(
        {
          key: rsaPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(encryptedKeysB64, "base64"),
      )
      .toString("utf8");
    const [encodedKey, encodedIV] = decryptedConcat.split(".");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(encodedKey, "base64"),
      Buffer.from(encodedIV, "base64"),
    );
    const decryptedData = Buffer.concat([
      decipher.update(Buffer.from(encryptedDataB64, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(decryptedData.toString("utf8"));
  }
}

const order = {
  amount: 12.5,
  receiverId: "90434fa9-46df-4c44-a4d1-da742ac815da",
  receiverType: "BRANCH",
  integratorId: "ce3a3476-a542-4e5d-a957-72fcd0e35d2c",
  integratorOrderId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  currency: "GEL",
  language: "KA",
};

test("our request envelope is readable by the Keepz reference implementation", () => {
  const envelope = encryptEnvelope(
    order,
    importKeepzPublicKey(keepz.publicB64),
  );
  // Keepz decrypts requests with ITS private key.
  const gateway = new KeepzDocsExample(keepz.publicB64, keepz.privateB64);
  assert.deepEqual(
    gateway.decrypt(envelope.encryptedData, envelope.encryptedKeys),
    order,
  );
});

test("a response from the Keepz reference implementation opens with our key", () => {
  // Keepz encrypts responses to OUR public key.
  const gateway = new KeepzDocsExample(ours.publicB64, ours.privateB64);
  const response = {
    integratorOrderId: order.integratorOrderId,
    urlForQR: "https://x.keepz.me/p/1",
  };
  const envelope = gateway.encrypt(response);
  assert.deepEqual(
    decryptEnvelope(envelope, importOwnPrivateKey(ours.privateB64)),
    response,
  );
});

test("each envelope uses a fresh key and IV", () => {
  const pub = importKeepzPublicKey(keepz.publicB64);
  const a = encryptEnvelope(order, pub);
  const b = encryptEnvelope(order, pub);
  assert.notEqual(a.encryptedData, b.encryptedData);
  assert.notEqual(a.encryptedKeys, b.encryptedKeys);
});

test("the wrong private key cannot open an envelope", () => {
  const envelope = encryptEnvelope(
    order,
    importKeepzPublicKey(keepz.publicB64),
  );
  assert.throws(
    () => decryptEnvelope(envelope, importOwnPrivateKey(ours.privateB64)),
    KeepzCryptoError,
  );
});

test("tampered ciphertext is rejected without leaking details", () => {
  const gateway = new KeepzDocsExample(ours.publicB64, ours.privateB64);
  const envelope = gateway.encrypt({ status: "SUCCESS" });
  const bytes = Buffer.from(envelope.encryptedData, "base64");
  bytes[bytes.length - 1] ^= 0xff;
  const tampered = { ...envelope, encryptedData: bytes.toString("base64") };
  assert.throws(
    () => decryptEnvelope(tampered, importOwnPrivateKey(ours.privateB64)),
    (err) =>
      err instanceof KeepzCryptoError &&
      err.message === "envelope could not be decrypted",
  );
});

test("malformed envelopes and keys are rejected up front", () => {
  assert.equal(isKeepzEnvelope(null), false);
  assert.equal(isKeepzEnvelope({ encryptedData: "AA==" }), false);
  assert.equal(
    isKeepzEnvelope({ encryptedData: "", encryptedKeys: "AA==" }),
    false,
  );
  assert.equal(
    isKeepzEnvelope({ encryptedData: "not base64!", encryptedKeys: "AA==" }),
    false,
  );
  assert.equal(
    isKeepzEnvelope({
      encryptedData: "A".repeat(70_000),
      encryptedKeys: "AA==",
    }),
    false,
  );
  assert.equal(
    isKeepzEnvelope({ encryptedData: "AA==", encryptedKeys: "AA==" }),
    true,
  );
  assert.throws(() => importKeepzPublicKey("bm90IGEga2V5"), KeepzCryptoError);
  assert.throws(() => importOwnPrivateKey("bm90IGEga2V5"), KeepzCryptoError);
  assert.throws(
    () =>
      decryptEnvelope(
        { encryptedData: "!!", encryptedKeys: "AA==" },
        importOwnPrivateKey(ours.privateB64),
      ),
    KeepzCryptoError,
  );
});
