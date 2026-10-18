import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  GUIDE_CONTENT_CACHE_TAG,
  GUIDE_LINK_TAGS,
  loadGuideDefaults,
  sanitizeGuideInput,
} from "@/lib/guide-content";
import { GUIDE_CONTENT_SETTING_KEY } from "@/lib/guide-overrides";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// The resort guide's editable copy (C40). GET hands the admin page the catalog
// text of every locale (the page cannot import the message files) and the
// stored edits; PUT replaces the whole set of edits.

async function readStored(db: ReturnType<typeof createServiceClient>) {
  return db
    .from("site_settings")
    .select("value, updated_at")
    .eq("key", GUIDE_CONTENT_SETTING_KEY)
    .maybeSingle();
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await readStored(createServiceClient());
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Stored texts that no longer pass are shown as the catalog text; the next
  // save drops them.
  const { overrides } = await sanitizeGuideInput(data?.value ?? null);
  return Response.json({
    defaults: await loadGuideDefaults(),
    overrides,
    tags: GUIDE_LINK_TAGS,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    overrides?: unknown;
  } | null;
  if (!body || !body.overrides || typeof body.overrides !== "object") {
    return Response.json({ error: "overrides required" }, { status: 400 });
  }

  const { overrides, problems } = await sanitizeGuideInput(body.overrides);
  if (problems.length > 0) {
    return Response.json({ error: "invalid_text", problems }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await createServiceClient(guard.admin.userId)
    .from("site_settings")
    .upsert(
      {
        key: GUIDE_CONTENT_SETTING_KEY,
        value: overrides,
        updated_at: updatedAt,
        updated_by: guard.admin.userId,
      },
      { onConflict: "key" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The guide pages are ISR; drop the cached row and the rendered pages.
  revalidateTag(GUIDE_CONTENT_CACHE_TAG);
  revalidatePath("/[locale]/bakuriani", "layout");

  return Response.json({ overrides, updatedAt });
}
