import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";

dotenv.config({ path: ".env.local", override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await supabase
  .from("properties")
  .select("id, photos")
  .not("photos", "is", null)
  .order("updated_at", { ascending: false })
  .limit(5);

if (error) throw error;

let saved = 0;
for (const row of data ?? []) {
  for (const photo of row.photos ?? []) {
    if (typeof photo !== "string" || !photo.startsWith("data:image/")) continue;
    const comma = photo.indexOf(",");
    const mimeMatch = /^data:([^;]+);/.exec(photo);
    const mime = mimeMatch?.[1] ?? "image/jpeg";
    const ext =
      mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const buf = Buffer.from(photo.slice(comma + 1), "base64");
    const out = `/tmp/sample-${row.id.slice(0, 8)}-${saved}.${ext}`;
    writeFileSync(out, buf);
    console.log(`Wrote ${out}  ${buf.length} bytes  (mime: ${mime})`);
    saved++;
    if (saved >= 2) break;
  }
  if (saved >= 2) break;
}
console.log(`Saved ${saved} sample(s)`);
