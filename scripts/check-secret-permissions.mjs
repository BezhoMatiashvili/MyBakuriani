import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

let gitOutput = "";
try {
  gitOutput = execFileSync("git", ["ls-files"], { encoding: "utf8" });
} catch (error) {
  // Some sandboxed runners report EPERM after a successful child process.
  // Preserve its output; a real git failure still leaves no trusted result.
  if (error?.status === 0 && typeof error.stdout === "string") gitOutput = error.stdout;
  else throw error;
}
const tracked = gitOutput
  .split("\n")
  .filter(Boolean)
  .filter((file) => /(^|\/)\.env($|\.)/.test(file) && !/\.example$/.test(file));
if (tracked.length) {
  console.error(`Tracked environment files are forbidden: ${tracked.join(", ")}`);
  process.exit(1);
}
for (const file of [".env.local", ".env.production", ".env.development", ".env.staging"]) {
  if (!existsSync(file)) continue;
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    console.error(`${file} must not be group/world-readable (current ${mode.toString(8)})`);
    process.exit(1);
  }
}
