// One-off seed helper: uploads the sample menu PDF to the public
// `restaurant-menus` bucket so demo food venues can link to it.
// Usage: node supabase/seed/upload-sample-menu.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function loadEnv(file) {
  try {
    const txt = readFileSync(resolve(repoRoot, file), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      // Fill from file when the var is unset OR present-but-empty (the dev
      // shell exports some of these as empty strings).
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file optional */
  }
}

loadEnv(".env.local");
loadEnv(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const BUCKET = "restaurant-menus";
const OBJECT_PATH = "demo/sample-menu.pdf";

const pdf = readFileSync(resolve(__dirname, "sample-menu.pdf"));
const base = url.replace(/\/$/, "");

// Upload via the Storage REST API (avoids the SDK; x-upsert overwrites if present).
const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/pdf",
    "x-upsert": "true",
  },
  body: pdf,
});

if (!res.ok) {
  console.error("Upload failed:", res.status, await res.text());
  process.exit(1);
}

console.log("Uploaded OK. Public URL:");
console.log(`${base}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`);
