import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { FAQ_CONTENT_SETTING_KEY, sanitizeFaqContent } from "@/lib/faq";
import { FAQ_CONTENT_CACHE_TAG, loadFaqDefaults } from "@/lib/faq-content";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// The /faq page's editable copy (C40). GET hands the admin page the saved set
// (or the catalog text when nothing is saved) and the catalog text as the
// original; PUT replaces the whole set.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await createServiceClient()
    .from("site_settings")
    .select("value, updated_at")
    .eq("key", FAQ_CONTENT_SETTING_KEY)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // A stored set that no longer passes is shown as the catalog text; the next
  // save replaces it.
  const defaults = await loadFaqDefaults();
  const stored = data ? sanitizeFaqContent(data.value) : null;
  const valid = stored !== null && stored.problems.length === 0;
  return Response.json({
    content: valid ? stored.content : defaults,
    defaults,
    custom: valid,
    updatedAt: valid ? data?.updated_at : null,
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

  const { content, problems } = sanitizeFaqContent(body.content);
  if (problems.length > 0) {
    return Response.json({ error: "invalid_text", problems }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await createServiceClient(guard.admin.userId)
    .from("site_settings")
    .upsert(
      {
        key: FAQ_CONTENT_SETTING_KEY,
        value: content,
        updated_at: updatedAt,
        updated_by: guard.admin.userId,
      },
      { onConflict: "key" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // /faq is ISR; drop the cached row and the rendered pages.
  revalidateTag(FAQ_CONTENT_CACHE_TAG);
  revalidatePath("/[locale]/faq", "page");

  return Response.json({ content, custom: true, updatedAt });
}
