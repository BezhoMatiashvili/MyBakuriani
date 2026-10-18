import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const notFound = () =>
  Response.json(
    { error: "not_found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

/**
 * Hands a job application's CV to the vacancy's owner (or an admin) as a
 * 60-second signed download URL. The cv-documents bucket has no browser
 * policies, so this is the only read path. Anyone else gets the same 404 as a
 * missing application, so the response never reveals that one exists.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    !(await checkRateLimit(`job-application-cv:${user.id}`, 60, 10 * 60_000))
  ) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isUuid(id)) return notFound();

  const db = createServiceClient();
  const { data: application } = await db
    .from("job_applications")
    .select("service_id, cv_path")
    .eq("id", id)
    .maybeSingle();
  if (!application) return notFound();

  const { data: service } = await db
    .from("services")
    .select("owner_id")
    .eq("id", application.service_id)
    .maybeSingle();
  const allowed = service?.owner_id === user.id || (await isAdminViewer());
  if (!allowed) return notFound();

  // Only paths this app wrote ("<service_id>/<uuid>.pdf|docx") are served, and
  // the download name comes from that whitelisted extension alone.
  const ext = application.cv_path?.match(/\.(pdf|docx)$/)?.[1];
  if (!application.cv_path || !ext) return notFound();

  const { data: signed, error } = await db.storage
    .from("cv-documents")
    .createSignedUrl(application.cv_path, 60, { download: `CV.${ext}` });
  if (error || !signed) {
    console.error("job application CV signing failed", error);
    return notFound();
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
