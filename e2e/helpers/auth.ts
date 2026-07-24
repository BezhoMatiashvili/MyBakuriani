import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";
import { supabaseAdmin } from "./supabase";
import { configureIsolatedE2E } from "./env";
import type { Database } from "../../src/lib/types/database";

type UserRole = Database["public"]["Enums"]["user_role"];

export interface TestUser {
  id: string;
  email: string;
  phone: string;
  role: UserRole;
  accessToken: string;
  refreshToken: string;
}

const createdUserIds: string[] = [];
const E2E_PASSWORD = "test-password-e2e-12345";

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of value.replace(/=|\s/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error("Invalid TOTP secret returned by Supabase");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

export async function createTestUser(opts: {
  id: string;
  phone: string;
  displayName: string;
  role: UserRole;
}): Promise<TestUser> {
  const email = `test-${opts.role}-${opts.id.slice(0, 8)}@e2e.mybakuriani.test`;

  let { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      id: opts.id,
      email,
      email_confirm: true,
      user_metadata: { display_name: opts.displayName, role: opts.role },
    });

  if (authError?.message?.includes("already been registered")) {
    // Force-delete existing user — must delete in FK order
    try {
      await supabaseAdmin
        .from("cleaning_tasks")
        .delete()
        .eq("owner_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin
        .from("cleaning_tasks")
        .delete()
        .eq("cleaner_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("verifications").delete().eq("user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin
        .from("smart_match_requests")
        .delete()
        .eq("guest_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("blog_posts").delete().eq("author_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("notifications").delete().eq("user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("transactions").delete().eq("user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin
        .from("sms_messages")
        .delete()
        .eq("from_user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin
        .from("sms_messages")
        .delete()
        .eq("to_user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("reviews").delete().eq("guest_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("bookings").delete().eq("guest_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("bookings").delete().eq("owner_id", opts.id);
    } catch {}
    // Delete calendar_blocks via properties owned by this user
    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("owner_id", opts.id);
    if (props) {
      for (const p of props) {
        try {
          await supabaseAdmin
            .from("calendar_blocks")
            .delete()
            .eq("property_id", p.id);
        } catch {}
      }
    }
    try {
      await supabaseAdmin.from("services").delete().eq("owner_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("properties").delete().eq("owner_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("balances").delete().eq("user_id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.from("profiles").delete().eq("id", opts.id);
    } catch {}
    try {
      await supabaseAdmin.auth.admin.deleteUser(opts.id);
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
    const retry = await supabaseAdmin.auth.admin.createUser({
      id: opts.id,
      email,
      email_confirm: true,
      user_metadata: { display_name: opts.displayName, role: opts.role },
    });
    authData = retry.data;
    authError = retry.error;
  }

  if (authError)
    throw new Error(`Failed to create auth user: ${authError.message}`);

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: opts.id,
    phone: opts.phone,
    display_name: opts.displayName,
    role: opts.role,
    is_verified: true,
  });
  if (profileError)
    throw new Error(`Failed to create profile: ${profileError.message}`);

  // Get session tokens
  await supabaseAdmin.auth.admin.updateUserById(authData!.user.id, {
    password: E2E_PASSWORD,
  });
  const { createClient } = await import("@supabase/supabase-js");
  const WebSocket = (await import("ws")).default;
  const e2e = configureIsolatedE2E();
  const anonClient = createClient(
    e2e.supabaseUrl,
    e2e.anonKey,
    {
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
  const {
    data: { session },
    error: signInError,
  } = await anonClient.auth.signInWithPassword({
    email,
    password: E2E_PASSWORD,
  });
  if (signInError)
    throw new Error(`Failed to sign in test user: ${signInError.message}`);

  createdUserIds.push(opts.id);
  return {
    id: opts.id,
    email,
    phone: opts.phone,
    role: opts.role,
    accessToken: session?.access_token ?? "",
    refreshToken: session?.refresh_token ?? "",
  };
}

/**
 * Completes real TOTP enrollment and verification for an isolated test user.
 * The returned access token is AAL2 and can therefore exercise admin pages
 * without weakening their production MFA guard.
 */
export async function elevateTestUserToAal2(user: TestUser): Promise<TestUser> {
  const { createClient } = await import("@supabase/supabase-js");
  const e2e = configureIsolatedE2E();
  const client = createClient(e2e.supabaseUrl, e2e.anonKey);
  const { error: setSessionError } = await client.auth.setSession({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });
  if (setSessionError) {
    throw new Error(`Failed to restore test session: ${setSessionError.message}`);
  }

  const { data: enrollment, error: enrollmentError } =
    await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "E2E administrator",
      issuer: "MyBakuriani E2E",
    });
  if (enrollmentError || !enrollment) {
    throw new Error(
      `Failed to enroll test TOTP factor: ${enrollmentError?.message ?? "no data"}`,
    );
  }

  const { data: challenge, error: challengeError } =
    await client.auth.mfa.challenge({ factorId: enrollment.id });
  if (challengeError || !challenge) {
    throw new Error(
      `Failed to challenge test TOTP factor: ${challengeError?.message ?? "no data"}`,
    );
  }

  const { error: verifyError } = await client.auth.mfa.verify({
    factorId: enrollment.id,
    challengeId: challenge.id,
    code: generateTotpCode(enrollment.totp.secret),
  });
  if (verifyError) {
    throw new Error(`Failed to verify test TOTP factor: ${verifyError.message}`);
  }

  const {
    data: { session },
    error: refreshError,
  } = await client.auth.refreshSession();
  if (refreshError || !session) {
    throw new Error(
      `Failed to refresh AAL2 test session: ${refreshError?.message ?? "no session"}`,
    );
  }

  return {
    ...user,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

export async function authenticateAsRole(
  user: TestUser,
  page: Page,
): Promise<void> {
  const projectRef = new URL(
    configureIsolatedE2E().supabaseUrl,
  ).hostname.split(".")[0];
  const cookieBase = `sb-${projectRef}-auth-token`;
  const sessionPayload = JSON.stringify({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      user_metadata: { role: user.role },
    },
  });
  // @supabase/ssr uses a base64url value prefixed with "base64-". This is the
  // same serialization used by the browser client and understood by server
  // middleware; a raw base64 cookie is intentionally rejected.
  const encoded =
    "base64-" +
    Buffer.from(sessionPayload)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const cookieDefaults = {
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
  await page.context().addCookies([
    { name: cookieBase, value: encoded, ...cookieDefaults },
  ]);
}

export async function deleteTestUser(userId: string): Promise<void> {
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
}

export async function cleanupAllTestUsers(): Promise<void> {
  for (const id of createdUserIds) await deleteTestUser(id);
  createdUserIds.length = 0;
}
