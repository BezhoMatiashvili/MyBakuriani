import type { Page } from "@playwright/test";
import { supabaseAdmin } from "./supabase";
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
    password: "test-password-e2e-12345",
  });
  const { createClient } = await import("@supabase/supabase-js");
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const {
    data: { session },
    error: signInError,
  } = await anonClient.auth.signInWithPassword({
    email,
    password: "test-password-e2e-12345",
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

export async function authenticateAsRole(
  user: TestUser,
  page: Page,
): Promise<void> {
  const projectRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
  const encoded = Buffer.from(sessionPayload).toString("base64");
  const cookieDefaults = {
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
  await page.context().addCookies([
    { name: cookieBase, value: encoded, ...cookieDefaults },
    { name: `${cookieBase}.0`, value: encoded, ...cookieDefaults },
  ]);
}

export async function deleteTestUser(userId: string): Promise<void> {
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
}

export async function cleanupAllTestUsers(): Promise<void> {
  for (const id of createdUserIds) await deleteTestUser(id);
  createdUserIds.length = 0;
}
