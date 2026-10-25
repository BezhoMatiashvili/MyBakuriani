import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { optOutToken, sha256Hex } from "./opt-out.ts";

Deno.test(
  "an opt-out token is 22 base64url characters, fresh every time",
  () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const token = optOutToken();
      assertEquals(/^[A-Za-z0-9_-]{22}$/.test(token), true, token);
      seen.add(token);
    }
    assertEquals(seen.size, 200);
  },
);

// Same vector as scripts/unit/sms-opt-out.test.mjs (src/lib/sms/opt-out.ts).
Deno.test(
  "the stored hash is the hex SHA-256 of the token string",
  async () => {
    assertEquals(
      await sha256Hex("AAAAAAAAAAAAAAAAAAAAAA"),
      "8a5bdb4cc15164126c6ef2668de9dd240d299ce6397a42c95a9411b93d080ed8",
    );
  },
);
