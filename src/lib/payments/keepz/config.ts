import "server-only";
import type { KeyObject } from "node:crypto";
import { isUuid } from "@/lib/utils/uuid";
import { importKeepzPublicKey, importOwnPrivateKey } from "./crypto";

/**
 * Keepz gateway configuration. Server-only: none of these may ever be
 * NEXT_PUBLIC_, logged, or returned to a client.
 *
 * KEEPZ_ENV picks one of two FIXED base URLs — there is deliberately no URL
 * variable, so a misconfiguration cannot send signed requests to an arbitrary
 * host. Missing or invalid values return null and every payment route answers
 * 503: a wallet is never credited without a verified Keepz payment. Not listed
 * in scripts/check-production-config.mjs on purpose (C16 — optional variables
 * turned required once broke the production build).
 */
const BASE_URLS = {
  test: "https://gateway.dev.keepz.me/ecommerce-service",
  production: "https://gateway.keepz.me/ecommerce-service",
} as const;

export type KeepzEnv = keyof typeof BASE_URLS;

export interface KeepzConfig {
  env: KeepzEnv;
  baseUrl: string;
  /** Sent both as the envelope `identifier` and the payload `integratorId`. */
  integratorId: string;
  /** The BRANCH that receives the money. */
  receiverId: string;
  keepzPublicKey: KeyObject;
  ownPrivateKey: KeyObject;
}

let cached: KeepzConfig | null | undefined;

export function getKeepzConfig(): KeepzConfig | null {
  if (cached !== undefined) return cached;

  const env = process.env.KEEPZ_ENV?.trim();
  const integratorId = process.env.KEEPZ_INTEGRATOR_ID?.trim() ?? "";
  const receiverId = process.env.KEEPZ_RECEIVER_ID?.trim() ?? "";
  const publicKey = process.env.KEEPZ_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.KEEPZ_PRIVATE_KEY?.trim() ?? "";

  const problems: string[] = [];
  if (env !== "test" && env !== "production") problems.push("KEEPZ_ENV");
  if (!isUuid(integratorId)) problems.push("KEEPZ_INTEGRATOR_ID");
  if (!isUuid(receiverId)) problems.push("KEEPZ_RECEIVER_ID");
  if (!publicKey) problems.push("KEEPZ_PUBLIC_KEY");
  if (!privateKey) problems.push("KEEPZ_PRIVATE_KEY");

  let keepzPublicKey: KeyObject | null = null;
  let ownPrivateKey: KeyObject | null = null;
  if (publicKey) {
    try {
      keepzPublicKey = importKeepzPublicKey(publicKey);
    } catch {
      problems.push("KEEPZ_PUBLIC_KEY");
    }
  }
  if (privateKey) {
    try {
      ownPrivateKey = importOwnPrivateKey(privateKey);
    } catch {
      problems.push("KEEPZ_PRIVATE_KEY");
    }
  }

  if (problems.length || !keepzPublicKey || !ownPrivateKey) {
    // Names only — never values.
    console.warn(
      `[keepz] payments disabled: missing or invalid ${[...new Set(problems)].join(", ")}`,
    );
    cached = null;
    return cached;
  }

  cached = {
    env: env as KeepzEnv,
    baseUrl: BASE_URLS[env as KeepzEnv],
    integratorId,
    receiverId,
    keepzPublicKey,
    ownPrivateKey,
  };
  return cached;
}
