/**
 * One-off migration: move legacy base64 `data:` photos out of the DB and into
 * the `property-photos` Storage bucket, replacing each row's `photos` entry with
 * the public Storage URL.
 *
 * Why: a few listings stored multi-MB base64 data-URLs in `properties.photos` /
 * `services.photos`. The detail page embeds them in the SSR HTML + RSC payload +
 * og:image, blowing past Vercel's serverless response limit → a hard 500.
 * (See plan: fix base64-photo 500s.)
 *
 * Safe to re-run: rows with no `data:` entries are skipped, and uploads upsert to
 * a deterministic path. Reads two env vars (no secrets in this file):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   export SUPABASE_SERVICE_ROLE_KEY=$(supabase projects api-keys \
 *     --project-ref <ref> -o env | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d'"' -f2)
 *   export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *   npx tsx scripts/migrate-base64-photos.ts
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-photos";
const TABLES = ["properties", "services"] as const;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function parseDataUrl(value: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const [, mime, b64] = match;
  return { mime, buffer: Buffer.from(b64, "base64") };
}

async function migrateRow(
  table: (typeof TABLES)[number],
  id: string,
  photos: string[],
): Promise<string[] | null> {
  let changed = false;
  const next: string[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const parsed = typeof photo === "string" ? parseDataUrl(photo) : null;
    if (!parsed) {
      next.push(photo); // already a URL (or unparseable) — leave untouched
      continue;
    }
    const ext = EXT_BY_MIME[parsed.mime] ?? "png";
    const path = `migrated/${table}/${id}/${i}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, parsed.buffer, {
        contentType: parsed.mime,
        upsert: true,
        cacheControl: "31536000",
      });
    if (uploadErr) {
      console.error(
        `  ✗ upload failed (${table} ${id} #${i}): ${uploadErr.message}`,
      );
      return null;
    }
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path)
      .data.publicUrl;
    console.log(
      `  ✓ #${i}: ${(parsed.buffer.length / 1024).toFixed(0)} KB → ${publicUrl}`,
    );
    next.push(publicUrl);
    changed = true;
  }

  return changed ? next : null;
}

async function run() {
  let migratedRows = 0;
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("id, photos");
    if (error) {
      console.error(`Failed to read ${table}: ${error.message}`);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const photos: string[] = Array.isArray(row.photos) ? row.photos : [];
      if (!photos.some((p) => typeof p === "string" && p.startsWith("data:"))) {
        continue;
      }
      console.log(`\n${table} ${row.id}: migrating ${photos.length} photo(s)…`);
      const next = await migrateRow(table, row.id as string, photos);
      if (!next) {
        console.error(
          `  ! skipped DB update for ${table} ${row.id} (upload error)`,
        );
        continue;
      }
      const { error: updateErr } = await supabase
        .from(table)
        .update({ photos: next })
        .eq("id", row.id);
      if (updateErr) {
        console.error(`  ✗ DB update failed: ${updateErr.message}`);
        continue;
      }
      console.log(`  ✓ ${table} ${row.id} updated.`);
      migratedRows++;
    }
  }
  console.log(`\nDone. Migrated ${migratedRows} row(s).`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
