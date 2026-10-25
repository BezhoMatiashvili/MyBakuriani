import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  projectRef,
  recipientAllowed,
  recipientPolicy,
} from "./sms-recipients.ts";

const PROD = "https://wlkmyxyaocvgqomrrbfs.supabase.co";
const STAGING = "https://laxwtegxpemuuyxluqsi.supabase.co";

Deno.test("projectRef reads only https://<ref>.supabase.co", () => {
  assertEquals(projectRef(PROD), "wlkmyxyaocvgqomrrbfs");
  assertEquals(projectRef(`${PROD}/`), "wlkmyxyaocvgqomrrbfs");
  assertEquals(projectRef(STAGING), "laxwtegxpemuuyxluqsi");
  for (const url of [
    undefined,
    "",
    "not a url",
    "https://wlkmyxyaocvgqomrrbfs.supabase.co.evil.test",
    "https://evil.test/wlkmyxyaocvgqomrrbfs.supabase.co",
    "http://localhost:54321",
  ])
    assertEquals(projectRef(url), null, String(url));
});

Deno.test("no list: everyone on prod only, nobody anywhere else", () => {
  assertEquals(recipientPolicy(undefined, PROD).mode, "everyone");
  assertEquals(recipientPolicy("  ", PROD).mode, "everyone");
  for (const url of [STAGING, undefined, "http://localhost:54321"]) {
    const policy = recipientPolicy(undefined, url);
    assertEquals(recipientAllowed(policy, "995599123456"), false, String(url));
  }
});

Deno.test("a list allows exactly its numbers, on any project", () => {
  for (const url of [PROD, STAGING]) {
    const policy = recipientPolicy("+995 599 12 34 56, 555000099", url);
    assertEquals(recipientAllowed(policy, "995599123456"), true);
    assertEquals(recipientAllowed(policy, "995555000099"), true);
    assertEquals(recipientAllowed(policy, "995599123457"), false);
  }
  // A list of nothing valid lets nobody through, never everyone.
  assertEquals(
    recipientAllowed(recipientPolicy("x, 123", PROD), "995599123456"),
    false,
  );
});
