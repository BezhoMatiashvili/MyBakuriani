import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SALE_RESEARCH_CACHE_TAG,
  SALE_RESEARCH_DEFAULT_VALUES,
  SALE_RESEARCH_SETTING_KEY,
  SALE_RESEARCH_TEXT_LIMITS,
  SALE_RESEARCH_VALUE_MAX,
  sanitizeSaleResearch,
} from "@/lib/sale-research";
import { loadSaleResearchDefaults } from "@/lib/sale-research-server";

export const runtime = "nodejs";

// The home page's sale-mode research section (src/lib/sale-research.ts). GET
// hands the admin page every locale's catalog text, the built-in figures and
// the stored edits; PUT replaces the whole set of edits.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await createServiceClient()
    .from("site_settings")
    .select("value, updated_at")
    .eq("key", SALE_RESEARCH_SETTING_KEY)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Stored fields that no longer pass show as the default; the next save
  // drops them.
  const { content } = sanitizeSaleResearch(data?.value ?? null);
  return Response.json({
    content,
    defaults: await loadSaleResearchDefaults(),
    defaultValues: SALE_RESEARCH_DEFAULT_VALUES,
    limits: SALE_RESEARCH_TEXT_LIMITS,
    valueMax: SALE_RESEARCH_VALUE_MAX,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    content?: unknown;
  } | null;
  if (!body || !body.content || typeof body.content !== "object") {
    return Response.json({ error: "content required" }, { status: 400 });
  }

  const { content, problems } = sanitizeSaleResearch(body.content);
  if (problems.length > 0) {
    return Response.json({ error: "invalid", problems }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await createServiceClient(guard.admin.userId)
    .from("site_settings")
    .upsert(
      {
        key: SALE_RESEARCH_SETTING_KEY,
        value: content,
        updated_at: updatedAt,
        updated_by: guard.admin.userId,
      },
      { onConflict: "key" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The home page is ISR; drop the cached row and every locale's page.
  revalidateTag(SALE_RESEARCH_CACHE_TAG);
  revalidatePath("/[locale]", "page");

  return Response.json({ content, updatedAt });
}
