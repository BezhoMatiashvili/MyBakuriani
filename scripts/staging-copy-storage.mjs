#!/usr/bin/env node
/**
 * One-off copy of Storage object bytes from prod to the staging project
 * (Phase 4 of the staging-replica plan). Bucket *definitions* already come
 * over via `supabase db pull`/`db push` (Storage metadata lives in Postgres);
 * this script copies the actual files, which a pg_dump never includes.
 *
 * Dry-run by default (lists what would copy, no writes). Pass --commit to
 * actually download+upload. Idempotent: re-running with --commit upserts,
 * so an interrupted run can just be re-run.
 *
 * Usage:
 *   SOURCE_SUPABASE_URL=https://<prod-ref>.supabase.co \
 *   SOURCE_SERVICE_ROLE_KEY=... \
 *   DEST_SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   DEST_SERVICE_ROLE_KEY=... \
 *     node scripts/staging-copy-storage.mjs [--commit] [--bucket=property-photos]
 */
import { createClient } from "@supabase/supabase-js";

const SRC_URL = process.env.SOURCE_SUPABASE_URL;
const SRC_KEY = process.env.SOURCE_SERVICE_ROLE_KEY;
const DEST_URL = process.env.DEST_SUPABASE_URL;
const DEST_KEY = process.env.DEST_SERVICE_ROLE_KEY;
const COMMIT = process.argv.includes("--commit");
const ONLY_BUCKET = process.argv
  .find((a) => a.startsWith("--bucket="))
  ?.split("=")[1];

const BUCKETS = [
  "property-photos",
  "avatars",
  "landing-media",
  "restaurant-menus",
  "content-change-media",
];

if (!SRC_URL || !SRC_KEY || !DEST_URL || !DEST_KEY) {
  console.error(
    "Set SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, DEST_SUPABASE_URL, DEST_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}
if (SRC_URL === DEST_URL) {
  console.error("SOURCE and DEST point at the same project — refusing to run.");
  process.exit(1);
}

const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false } });
const dest = createClient(DEST_URL, DEST_KEY, {
  auth: { persistSession: false },
});

// Supabase Storage's .list() is one level deep; walk folders recursively to
// find every real object (a row with no `id` is a folder placeholder).
async function walk(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await src.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw error;
    if (!data.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        paths.push(full);
      } else {
        paths.push(...(await walk(bucket, full)));
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return paths;
}

async function copyOne(bucket, path) {
  const { data: blob, error: dlErr } = await src.storage
    .from(bucket)
    .download(path);
  if (dlErr) throw new Error(`download ${bucket}/${path}: ${dlErr.message}`);
  const { error: upErr } = await dest.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType: blob.type || undefined });
  if (upErr) throw new Error(`upload ${bucket}/${path}: ${upErr.message}`);
}

const buckets = ONLY_BUCKET ? [ONLY_BUCKET] : BUCKETS;
let totalCopied = 0;
let totalFailed = 0;

for (const bucket of buckets) {
  const paths = await walk(bucket);
  console.log(`${bucket}: ${paths.length} object(s) found on source.`);
  if (!COMMIT) continue;

  const CONCURRENCY = 5;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((p) => copyOne(bucket, p)),
    );
    for (const [idx, r] of results.entries()) {
      if (r.status === "fulfilled") {
        totalCopied++;
      } else {
        totalFailed++;
        console.error(`  FAILED ${bucket}/${batch[idx]}: ${r.reason.message}`);
      }
    }
    console.log(
      `  ${bucket}: ${Math.min(i + CONCURRENCY, paths.length)}/${paths.length}`,
    );
  }
}

if (!COMMIT) {
  console.log("\nDry run. Re-run with --commit to actually copy object bytes.");
} else {
  console.log(`\nDone. Copied ${totalCopied}, failed ${totalFailed}.`);
  if (totalFailed > 0) process.exitCode = 1;
}
