/**
 * Watermark Backfill Script
 *
 * Adds the MyBakuriani logo watermark (bottom-right, medium transparency) to
 * existing user-uploaded listing images:
 *   - properties.photos / services.photos TEXT[] (supabase storage URLs)
 *
 * The `db` target (default) is NON-DESTRUCTIVE: each un-watermarked photo is
 * re-rendered to a NEW `<name>-wm.jpg` object and the row is repointed at it;
 * the original object is left intact. The `storage` target overwrites objects
 * IN PLACE (a local copy is written to .watermark-backups first). Dry-run by
 * default. `--apply` writes; requires `--i-have-a-backup`.
 *
 * Idempotent: a photo is skipped when its object path already ends in
 * `-wm.<ext>` (written by PhotoUploader and prior runs) OR carries the EXIF
 * UserComment marker `MB-WM-v1`.
 *
 * Usage:
 *   npx tsx scripts/watermark-backfill.ts --target=db --limit=3
 *   npx tsx scripts/watermark-backfill.ts --target=db --apply --i-have-a-backup
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import {
  readFileSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import sharp from "sharp";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
  override: true,
});

const MARKER = "MB-WM-v1";
const MARKER_BUF = Buffer.from(MARKER, "utf8");

const args = parseArgs(process.argv.slice(2));
const TARGET = (args.target as string) ?? "db";
const BUCKET_ARG = (args.bucket as string) ?? null;
const APPLY = !!args.apply;
const HAS_BACKUP = !!args["i-have-a-backup"];
const LIMIT = args.limit ? Number(args.limit) : Number.POSITIVE_INFINITY;
const BATCH = args.batch ? Number(args.batch) : 50;
const CONCURRENCY = 4;

if (!["db", "storage", "all"].includes(TARGET)) {
  console.error(`❌ Invalid --target=${TARGET}. Expected db|storage|all`);
  process.exit(1);
}
if (APPLY && !HAS_BACKUP) {
  console.error(
    "❌ --apply requires --i-have-a-backup. Take a DB snapshot + storage mirror first.",
  );
  process.exit(1);
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BACKUP_DIR = APPLY
  ? path.resolve(
      process.cwd(),
      ".watermark-backups",
      `run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    )
  : null;
if (BACKUP_DIR) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`✓ Backup dir: ${path.relative(process.cwd(), BACKUP_DIR)}`);
}

function backupDbRow(
  table: string,
  id: string,
  originalPhotos: string[],
): void {
  if (!BACKUP_DIR) return;
  const line =
    JSON.stringify({
      table,
      id,
      photos: originalPhotos,
      ts: new Date().toISOString(),
    }) + "\n";
  appendFileSync(path.join(BACKUP_DIR, `${table}.ndjson`), line);
}

function backupStorageObject(
  bucket: string,
  objectPath: string,
  buf: Buffer,
): void {
  if (!BACKUP_DIR) return;
  const target = path.join(BACKUP_DIR, "storage", bucket, objectPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buf);
}

const WATERMARK_PATH = path.resolve(process.cwd(), "public/watermark.png");
const WATERMARK_PATH_SVG = path.resolve(process.cwd(), "public/watermark.svg");
let watermarkSource: Buffer;
try {
  watermarkSource = readFileSync(WATERMARK_PATH);
  console.log(`✓ Watermark source: public/watermark.png`);
} catch {
  try {
    watermarkSource = readFileSync(WATERMARK_PATH_SVG);
    console.log(
      `⚠ public/watermark.png not found; falling back to public/watermark.svg (text rendering may vary)`,
    );
  } catch {
    console.error(
      "❌ No watermark asset in public/ (need watermark.png or .svg)",
    );
    process.exit(1);
  }
}

const overlayCache = new Map<number, Buffer>();
async function getOverlay(width: number): Promise<Buffer> {
  const cached = overlayCache.get(width);
  if (cached) return cached;
  const resized = await sharp(watermarkSource, { density: 300 })
    .resize({ width })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = resized;
  for (let i = 3; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] * 0.5);
  }
  const png = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels as 4,
    },
  })
    .png()
    .toBuffer();
  overlayCache.set(width, png);
  return png;
}

async function isAlreadyMarked(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf).metadata();
    if (meta.exif && meta.exif.includes(MARKER_BUF)) return true;
    return false;
  } catch {
    return false;
  }
}

async function applyWatermark(input: Buffer): Promise<{
  buffer: Buffer;
  skipped: "tiny" | "already-marked" | null;
}> {
  if (await isAlreadyMarked(input)) {
    return { buffer: input, skipped: "already-marked" };
  }
  const meta = await sharp(input, { failOn: "none" }).metadata();
  // `.rotate()` below auto-orients via EXIF; orientations 5–8 are 90°/270°
  // rotations that swap width/height. Measure the post-rotation dimensions so
  // the overlay lands in the visible bottom-right corner.
  const swap = (meta.orientation ?? 1) >= 5;
  const w = (swap ? meta.height : meta.width) ?? 0;
  const h = (swap ? meta.width : meta.height) ?? 0;
  if (w < 200) {
    return { buffer: input, skipped: "tiny" };
  }
  const wmW = Math.max(60, Math.round(w * 0.13));
  const pad = Math.max(12, Math.round(w * 0.025));
  const overlay = await getOverlay(wmW);
  const overlayMeta = await sharp(overlay).metadata();
  const wmH = overlayMeta.height ?? Math.round(wmW * 0.2);
  const left = Math.max(0, w - wmW - pad);
  const top = Math.max(0, h - wmH - pad);
  const out = await sharp(input, { failOn: "none" })
    .rotate()
    .composite([{ input: overlay, left, top }])
    .jpeg({ quality: 85, mozjpeg: true })
    .withExif({ IFD0: { UserComment: MARKER } })
    .toBuffer();
  return { buffer: out, skipped: null };
}

interface Stats {
  processed: number;
  skippedTiny: number;
  skippedMarked: number;
  failed: number;
  errors: { id: string; error: string }[];
}

function newStats(): Stats {
  return {
    processed: 0,
    skippedTiny: 0,
    skippedMarked: 0,
    failed: 0,
    errors: [],
  };
}

async function pool<T>(
  items: T[],
  workers: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < workers; i++) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          await worker(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

function isDataUrl(s: string): boolean {
  return s.startsWith("data:image/");
}

function bufferFromDataUrl(s: string): Buffer {
  const comma = s.indexOf(",");
  return Buffer.from(s.slice(comma + 1), "base64");
}

function dataUrlFromBuffer(buf: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function isOurStorageUrl(s: string): {
  bucket: string;
  objectPath: string;
} | null {
  try {
    const u = new URL(s);
    if (!u.host.includes("supabase")) return null;
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], objectPath: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

// A photo whose object path already ends in `-wm.<ext>` is watermarked — both
// PhotoUploader and prior backfill runs write this marker.
function isWatermarkedPath(objectPath: string): boolean {
  return /-wm\.(jpe?g|png|webp)$/i.test(objectPath);
}

// The watermarked copy lives at a NEW path so the original is never touched.
// applyWatermark always re-encodes to JPEG, so the copy is `<base>-wm.jpg`.
function watermarkedObjectPath(objectPath: string): string {
  const dot = objectPath.lastIndexOf(".");
  const base = dot > 0 ? objectPath.slice(0, dot) : objectPath;
  return `${base}-wm.jpg`;
}

async function processDbTable(
  table: "properties" | "services",
): Promise<Stats> {
  console.log(`\n=== Target: ${table}.photos ===`);
  const stats = newStats();
  let from = 0;
  let totalSeen = 0;
  while (totalSeen < LIMIT) {
    const to = Math.min(from + BATCH - 1, from + (LIMIT - totalSeen) - 1);
    const { data: rows, error } = await supabase
      .from(table)
      .select("id, photos")
      .not("photos", "is", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      console.error(`Failed to fetch ${table}:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (totalSeen >= LIMIT) break;
      totalSeen++;
      const photos = (row.photos as string[] | null) ?? [];
      if (photos.length === 0) continue;

      let changed = false;
      const newPhotos: string[] = [];
      for (const photo of photos) {
        try {
          if (isDataUrl(photo)) {
            const buf = bufferFromDataUrl(photo);
            const res = await applyWatermark(buf);
            if (res.skipped === "already-marked") {
              stats.skippedMarked++;
              newPhotos.push(photo);
              continue;
            }
            if (res.skipped === "tiny") {
              stats.skippedTiny++;
              newPhotos.push(photo);
              continue;
            }
            newPhotos.push(dataUrlFromBuffer(res.buffer));
            changed = true;
            stats.processed++;
          } else {
            const loc = isOurStorageUrl(photo);
            if (!loc) {
              newPhotos.push(photo);
              continue;
            }
            // Skip already-watermarked copies without downloading — the `-wm`
            // marker means PhotoUploader or a prior run already handled it.
            if (isWatermarkedPath(loc.objectPath)) {
              stats.skippedMarked++;
              newPhotos.push(photo);
              continue;
            }
            const { data: blob, error: dlErr } = await supabase.storage
              .from(loc.bucket)
              .download(loc.objectPath);
            if (dlErr || !blob) {
              newPhotos.push(photo);
              stats.failed++;
              stats.errors.push({
                id: `${row.id}:${loc.objectPath}`,
                error: dlErr?.message ?? "download failed",
              });
              continue;
            }
            const buf = Buffer.from(await blob.arrayBuffer());
            const res = await applyWatermark(buf);
            if (res.skipped === "already-marked") {
              stats.skippedMarked++;
              newPhotos.push(photo);
              continue;
            }
            if (res.skipped === "tiny") {
              stats.skippedTiny++;
              newPhotos.push(photo);
              continue;
            }
            // Non-destructive: write the watermarked image to a NEW `-wm`
            // object and repoint the row at it. The original is left intact.
            const newPath = watermarkedObjectPath(loc.objectPath);
            const { data: pub } = supabase.storage
              .from(loc.bucket)
              .getPublicUrl(newPath);
            if (APPLY) {
              const { error: upErr } = await supabase.storage
                .from(loc.bucket)
                .upload(newPath, res.buffer, {
                  upsert: true,
                  contentType: "image/jpeg",
                });
              if (upErr) {
                stats.failed++;
                stats.errors.push({
                  id: `${row.id}:${loc.objectPath}`,
                  error: upErr.message,
                });
                newPhotos.push(photo);
                continue;
              }
            } else {
              console.log(
                `[DRY] would upload ${loc.bucket}/${newPath} and repoint ${loc.objectPath}`,
              );
            }
            newPhotos.push(pub.publicUrl);
            changed = true;
            stats.processed++;
          }
        } catch (err) {
          stats.failed++;
          stats.errors.push({
            id: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
          newPhotos.push(photo);
        }
      }

      if (changed) {
        if (APPLY) {
          backupDbRow(table, row.id, photos);
          const { error: updErr } = await supabase
            .from(table)
            .update({
              photos: newPhotos,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (updErr) {
            stats.failed++;
            stats.errors.push({ id: row.id, error: updErr.message });
          }
        } else {
          console.log(
            `[DRY] would update ${table}.id=${row.id} (${photos.length} photos)`,
          );
        }
      }

      if (totalSeen % 10 === 0) {
        console.log(
          `  ${totalSeen} rows scanned — processed:${stats.processed} marked-skip:${stats.skippedMarked} tiny:${stats.skippedTiny} failed:${stats.failed}`,
        );
      }
    }
    from += rows.length;
    if (rows.length < BATCH) break;
  }
  return stats;
}

async function listAllObjects(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error || !data) break;
    for (const entry of data) {
      if (entry.id === null) {
        const child = await listAllObjects(
          bucket,
          prefix ? `${prefix}/${entry.name}` : entry.name,
        );
        out.push(...child);
      } else {
        out.push(prefix ? `${prefix}/${entry.name}` : entry.name);
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function processStorageBucket(bucket: string): Promise<Stats> {
  console.log(`\n=== Target: storage bucket "${bucket}" ===`);
  const stats = newStats();
  const paths = await listAllObjects(bucket);
  const capped = paths.slice(0, LIMIT);
  console.log(`  found ${paths.length} objects, processing ${capped.length}`);

  await pool(capped, CONCURRENCY, async (objectPath) => {
    try {
      // Skip already-watermarked objects (the `-wm` marker) without download.
      if (isWatermarkedPath(objectPath)) {
        stats.skippedMarked++;
        return;
      }
      const { data: blob, error: dlErr } = await supabase.storage
        .from(bucket)
        .download(objectPath);
      if (dlErr || !blob) {
        stats.failed++;
        stats.errors.push({
          id: `${bucket}:${objectPath}`,
          error: dlErr?.message ?? "download failed",
        });
        return;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      if (!buf.length) return;
      // Skip non-image content types up front by extension hint.
      if (!/\.(jpe?g|png|webp)$/i.test(objectPath)) return;
      const res = await applyWatermark(buf);
      if (res.skipped === "already-marked") {
        stats.skippedMarked++;
        return;
      }
      if (res.skipped === "tiny") {
        stats.skippedTiny++;
        return;
      }
      if (APPLY) {
        backupStorageObject(bucket, objectPath, buf);
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(objectPath, res.buffer, {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (upErr) {
          stats.failed++;
          stats.errors.push({
            id: `${bucket}:${objectPath}`,
            error: upErr.message,
          });
          return;
        }
      } else {
        console.log(
          `[DRY] would overwrite ${bucket}/${objectPath} (${buf.length}B → ${res.buffer.length}B)`,
        );
      }
      stats.processed++;
      if (stats.processed % 25 === 0) {
        console.log(
          `  ${stats.processed} processed / ${stats.skippedMarked} already-marked / ${stats.failed} failed`,
        );
      }
    } catch (err) {
      stats.failed++;
      stats.errors.push({
        id: `${bucket}:${objectPath}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  return stats;
}

function summarize(label: string, s: Stats): void {
  console.log(`\n── ${label} summary`);
  console.log(`   processed:        ${s.processed}`);
  console.log(`   skipped (marked): ${s.skippedMarked}`);
  console.log(`   skipped (tiny):   ${s.skippedTiny}`);
  console.log(`   failed:           ${s.failed}`);
  if (s.errors.length) {
    console.log("   first 5 errors:");
    for (const e of s.errors.slice(0, 5)) {
      console.log(`     - ${e.id}: ${e.error}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("================================================");
  console.log(" MyBakuriani Watermark Backfill");
  console.log("================================================");
  console.log(
    `Mode:       ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}`,
  );
  console.log(`Target:     ${TARGET}`);
  console.log(
    `Limit:      ${LIMIT === Number.POSITIVE_INFINITY ? "∞" : LIMIT}`,
  );
  console.log(`Batch:      ${BATCH}`);
  if (BUCKET_ARG) console.log(`Bucket:     ${BUCKET_ARG}`);
  if (APPLY) {
    console.log(
      "\n⚠ BACKUP CHECKLIST (already confirmed via --i-have-a-backup):",
    );
    console.log(
      "   1. Supabase Dashboard → Database → Backups → on-demand snapshot",
    );
    console.log(
      "   2. pg_dump -t properties -t services --data-only > listings-pre-wm.sql",
    );
    console.log(
      "   3. Storage: no native versioning — manual rclone mirror recommended\n",
    );
  }

  const t0 = Date.now();

  if (TARGET === "db" || TARGET === "all") {
    for (const table of ["properties", "services"] as const) {
      const s = await processDbTable(table);
      summarize(`${table}.photos`, s);
    }
  }
  if (TARGET === "storage" || TARGET === "all") {
    const buckets = BUCKET_ARG ? [BUCKET_ARG] : ["property-photos"];
    for (const b of buckets) {
      const s = await processStorageBucket(b);
      summarize(`bucket:${b}`, s);
    }
  }

  console.log(`\n✓ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) {
      out[a.slice(2)] = true;
    } else {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }
  return out;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
