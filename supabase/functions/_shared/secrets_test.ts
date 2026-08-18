import { assertEquals } from "jsr:@std/assert@1.0.14/equals";
import { secretsEqual } from "./secrets.ts";

Deno.test("secretsEqual accepts only an exact secret", async () => {
  assertEquals(await secretsEqual("correct-secret", "correct-secret"), true);
  assertEquals(await secretsEqual("correct-secreu", "correct-secret"), false);
  assertEquals(await secretsEqual("correct", "correct-secret"), false);
  assertEquals(await secretsEqual("", "correct-secret"), false);
});
