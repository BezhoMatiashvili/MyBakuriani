#!/usr/bin/env node
/**
 * One-off / periodic sweep of orphaned listing photos in the `property-photos`
 * bucket — objects left behind when a publish failed after the photos already
 * uploaded (e.g. the notification-guard 403 regression).
 *
 * SAFE by construction: only removes objects that are ALL of
 *   - watermarked listing photos (name contains `-wm.`), i.e. never avatars,
 *   - older than 1 day (won't touch an in-progress upload session), and
 *   - not referenced by properties.photos, services.photos, or
 *     profiles.avatar_url.
 *
 * Dry-run by default. Pass --commit to actually delete via the Storage API
 * (direct DELETE on storage.objects is blocked by Supabase's protect_delete).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/cleanup-orphan-photos.mjs [--commit]
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMMIT = process.argv.includes("--commit");
const BUCKET = "property-photos";

if (!URL || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

function pathsFrom(urls) {
  const out = new Set();
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const i = u.indexOf(`/${BUCKET}/`);
    if (i >= 0) out.add(u.slice(i + BUCKET.length + 2));
  }
  return out;
}

// 1. Collect every path referenced by a listing or avatar.
const referenced = new Set();
for (const [table, col] of [
  ["properties", "photos"],
  ["services", "photos"],
]) {
  const { data, error } = await db.from(table).select(col);
  if (error) throw error;
  for (const row of data)
    for (const p of pathsFrom(row[col] ?? [])) referenced.add(p);
}
{
  const { data, error } = await db.from("profiles").select("avatar_url");
  if (error) throw error;
  for (const p of pathsFrom(data.map((r) => r.avatar_url))) referenced.add(p);
}

// 2. Walk the bucket (top-level folders are user ids) and collect orphans.
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const orphans = [];
const { data: folders, error: fErr } = await db.storage
  .from(BUCKET)
  .list("", { limit: 1000 });
if (fErr) throw fErr;
for (const folder of folders) {
  if (!folder.id && !folder.name) continue;
  const prefix = folder.name;
  let offset = 0;
  for (;;) {
    const { data: files, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset });
    if (error) throw error;
    if (!files.length) break;
    for (const f of files) {
      const name = `${prefix}/${f.name}`;
      const created = f.created_at ? Date.parse(f.created_at) : 0;
      if (name.includes("-wm.") && created < cutoff && !referenced.has(name)) {
        orphans.push(name);
      }
    }
    if (files.length < 100) break;
    offset += 100;
  }
}

console.log(
  `Found ${orphans.length} orphaned watermarked photos (>1 day old, unreferenced).`,
);
orphans.forEach((n) => console.log("  " + n));

if (!COMMIT) {
  console.log("\nDry run. Re-run with --commit to delete.");
  process.exit(0);
}
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100);
  const { error } = await db.storage.from(BUCKET).remove(batch);
  if (error) throw error;
  console.log(`Deleted ${batch.length}.`);
}
console.log("Done.");
