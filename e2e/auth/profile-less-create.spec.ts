import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  authenticateAsRole,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../helpers/auth";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";

// An account that signed in but never finished /auth/register has no profile,
// so no membership or free period (C53) can reach it, and /create/rental asked
// it for a membership it could never get. /create sends it to the wizard,
// which comes back to /create once the profile exists (C8).

const randomGePhone = () =>
  `+9955${Math.floor(Math.random() * 100_000_000)
    .toString()
    .padStart(8, "0")}`;

// Signed in, with a confirmed phone as a phone sign-up has, and no profile row.
async function createUserWithoutProfile(phone: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `test-noprofile-${id.slice(0, 8)}@e2e.mybakuriani.test`;
  const password = `noprofile-${randomUUID()}`;
  const { error } = await supabaseAdmin.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    phone,
    phone_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const e2e = configureIsolatedE2E();
  const anon = createClient(e2e.supabaseUrl, e2e.anonKey, {
    auth: { persistSession: false },
  });
  const { data, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !data.session)
    throw new Error(`sign-in failed: ${signInError?.message}`);
  return {
    id,
    email,
    phone,
    role: "guest",
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

async function removeUser(user: TestUser | undefined) {
  if (!user) return;
  await supabaseAdmin.from("balances").delete().eq("user_id", user.id);
  await supabaseAdmin.from("profiles").delete().eq("id", user.id);
  await deleteTestUser(user.id);
}

test("an account without a profile finishes the wizard, then returns to /create", async ({
  page,
}) => {
  const phone = randomGePhone();
  let user: TestUser | undefined;
  try {
    user = await createUserWithoutProfile(phone);
    await authenticateAsRole(user, page);

    await page.goto("/create/rental");
    await expect(page).toHaveURL(/\/auth\/register\?next=(%2F|\/)create$/);

    await page
      .locator("form input[type='text']")
      .first()
      .fill("Unfinished Signup");
    await page.locator("form input[type='checkbox']").nth(0).check();
    await page.locator("form input[type='checkbox']").nth(1).check();
    await page.getByRole("button", { name: "შემდეგი", exact: true }).click();
    await page
      .getByRole("button", { name: "გამქირავებელი", exact: true })
      .click();
    await page.getByRole("button", { name: "დასრულება", exact: true }).click();

    // The path itself, not "?next=/create" on the wizard's own URL.
    await expect(page).toHaveURL(/^[^?]*\/create$/);
    // The wizard stored the sign-up's phone, as for a phone sign-up.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, phone")
      .eq("id", user.id)
      .single();
    expect(profile).toEqual({ role: "renter", phone });
  } finally {
    await removeUser(user);
  }
});

test("an account with a profile still opens /create/rental", async ({
  page,
}) => {
  let user: TestUser | undefined;
  try {
    user = await createTestUser({
      id: randomUUID(),
      phone: randomGePhone(),
      displayName: "Profile Create",
      role: "renter",
    });
    await authenticateAsRole(user, page);
    await page.goto("/create/rental");
    await expect(page).toHaveURL(/\/create\/rental$/);
  } finally {
    await removeUser(user);
  }
});
