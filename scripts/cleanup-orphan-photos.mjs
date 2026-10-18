#!/usr/bin/env node
/**
 * One-off / periodic sweep of orphaned uploads across every Storage bucket
 * that accepts client uploads — objects left behind when a photo/logo/menu
 * was removed or replaced (the uploader components only ever edited the DB
 * array/column, never deleted the underlying Storage object) or when a
 * publish failed after the upload already completed (e.g. the
 * notification-guard 403 regression).
 *
 * Buckets covered (see BUCKETS below) — all public, authenticated-user
 * uploads under a `<user-id>/...` top-level folder, per `supabase/migrations`:
 *   - property-photos  (properties.photos, services.photos)
 *   - logos            (organizations.logo_url, organizations.cover_url)
 *   - avatars          (profiles.avatar_url)
 *   - restaurant-menus (services.menu_url)
 *
 * Deliberately NOT covered — different addressing schemes that would need
 * bespoke (untested) reference logic rather than reuse of this script's
 * folder-per-user model:
 *   - landing-media       admin-only, folders are `banner|blog|ads`, not a
 *                         user id; referenced from landing_banners /
 *                         blog_posts / ad rows.
 *   - cv-documents        anonymous inserts allowed, referenced by a raw
 *                         storage path column (job_applications.cv_path),
 *                         not a public URL.
 *   - content-change-media referenced from inside a jsonb blob
 *                         (content_change_requests.proposed_values), not a
 *                         plain column.
 *   - chat-media / product-images / service-photos  retired, private,
 *                         empty legacy buckets with no upload policy
 *                         (see 20260815121000_harden_legacy_storage_buckets.sql)
 *                         — nothing to orphan.
 *
 * SAFE by construction: only removes objects that are ALL of
 *   - matched by the bucket's `isCandidate` check (see BUCKETS),
 *   - older than 1 day (won't touch an in-progress upload session), and
 *   - not referenced by any of that bucket's declared DB columns.
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
const CUTOFF = Date.now() - 24 * 60 * 60 * 1000;
// Storage `list()` pages both the top-level folders and each folder's files;
// neither call is allowed to stop at one page or a bucket with >1000 users,
// or a user with >100 uploads, silently drops the rest from the sweep.
const FOLDER_PAGE_SIZE = 1000;
const FILE_PAGE_SIZE = 100;

if (!URL || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// Every referenced-URL column below stores the app's own public Storage URL
// (getPublicUrl() output), so a bucket-relative path can always be recovered
// by slicing after the `/<bucket>/` marker, regardless of which project
// origin the URL happens to be stale against.
function pathsFromUrls(urls, bucketId) {
  const out = new Set();
  const marker = `/${bucketId}/`;
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const i = u.indexOf(marker);
    if (i >= 0) out.add(u.slice(i + marker.length));
  }
  return out;
}

async function collectReferenced(bucketId, refs) {
  const referenced = new Set();
  for (const { table, column } of refs) {
    const { data, error } = await db.from(table).select(column);
    if (error) throw error;
    for (const row of data) {
      const value = row[column];
      const urls = Array.isArray(value) ? value : [value];
      for (const p of pathsFromUrls(urls, bucketId)) referenced.add(p);
    }
  }
  return referenced;
}

async function findOrphans(bucketId, isCandidate, referenced) {
  const orphans = [];
  let folderOffset = 0;
  for (;;) {
    const { data: entries, error: fErr } = await db.storage
      .from(bucketId)
      .list("", { limit: FOLDER_PAGE_SIZE, offset: folderOffset });
    if (fErr) throw fErr;
    if (!entries.length) break;
    for (const folder of entries) {
      if (!folder.name) continue;
      const prefix = folder.name;
      let offset = 0;
      for (;;) {
        const { data: files, error } = await db.storage
          .from(bucketId)
          .list(prefix, { limit: FILE_PAGE_SIZE, offset });
        if (error) throw error;
        if (!files.length) break;
        for (const f of files) {
          const name = `${prefix}/${f.name}`;
          const created = f.created_at ? Date.parse(f.created_at) : 0;
          if (
            isCandidate(f.name) &&
            created < CUTOFF &&
            !referenced.has(name)
          ) {
            orphans.push(name);
          }
        }
        if (files.length < FILE_PAGE_SIZE) break;
        offset += FILE_PAGE_SIZE;
      }
    }
    if (entries.length < FOLDER_PAGE_SIZE) break;
    folderOffset += FOLDER_PAGE_SIZE;
  }
  return orphans;
}

const BUCKETS = [
  {
    id: "property-photos",
    // `-wm.` marks a watermarked listing photo — the only thing this app's
    // upload path ever writes here — so anything else in the bucket is left
    // untouched even if it somehow lacks a DB reference.
    isCandidate: (name) => name.includes("-wm."),
    refs: [
      { table: "properties", column: "photos" },
      { table: "services", column: "photos" },
      // A handful of legacy avatars predate the dedicated `avatars` bucket
      // and still live here — keep excluding them from orphan consideration.
      { table: "profiles", column: "avatar_url" },
    ],
  },
  {
    id: "logos",
    isCandidate: () => true,
    refs: [
      { table: "organizations", column: "logo_url" },
      { table: "organizations", column: "cover_url" },
    ],
  },
  {
    id: "avatars",
    isCandidate: () => true,
    refs: [{ table: "profiles", column: "avatar_url" }],
  },
  {
    id: "restaurant-menus",
    isCandidate: () => true,
    refs: [{ table: "services", column: "menu_url" }],
  },
];

let totalOrphans = 0;
for (const bucket of BUCKETS) {
  const referenced = await collectReferenced(bucket.id, bucket.refs);
  const orphans = await findOrphans(bucket.id, bucket.isCandidate, referenced);
  totalOrphans += orphans.length;

  console.log(
    `\n[${bucket.id}] Found ${orphans.length} orphaned object(s) (>1 day old, unreferenced).`,
  );
  orphans.forEach((n) => console.log("  " + n));

  if (COMMIT && orphans.length > 0) {
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100);
      const { error } = await db.storage.from(bucket.id).remove(batch);
      if (error) throw error;
      console.log(`[${bucket.id}] Deleted ${batch.length}.`);
    }
  }
}

if (!COMMIT) {
  console.log(
    `\nDry run. ${totalOrphans} orphan(s) total across ${BUCKETS.length} bucket(s). Re-run with --commit to delete.`,
  );
} else {
  console.log(`\nDone. ${totalOrphans} orphan(s) processed.`);
}
