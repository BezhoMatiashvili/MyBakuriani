import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const notFound = () =>
  Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

/**
 * Marks a job application "processed" for the vacancy's owner (the CV inbox's
 * "მიღება"). Browsers hold no UPDATE on job_applications (revoked in
 * 20260723000000, so an owner cannot point cv_path at another vacancy's CV),
 * so the status changes only here. Anyone else gets the same 404 as a missing
 * application, so the response never reveals that one exists.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }
  if (
    !(await checkRateLimit(
      `job-application-status:${user.id}`,
      120,
      10 * 60_000,
    ))
  ) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: NO_STORE },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (body?.status !== "processed") {
    return Response.json(
      { error: "invalid_status" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isUuid(id)) return notFound();

  // The owner as actor, so the audit log records who changed the status.
  const db = createServiceClient(user.id);
  const { data: application } = await db
    .from("job_applications")
    .select("service_id")
    .eq("id", id)
    .maybeSingle();
  if (!application) return notFound();

  const { data: service } = await db
    .from("services")
    .select("owner_id")
    .eq("id", application.service_id)
    .maybeSingle();
  if (service?.owner_id !== user.id) return notFound();

  const { error } = await db
    .from("job_applications")
    .update({ status: "processed" })
    .eq("id", id);
  if (error) {
    console.error("job application status update failed", error);
    return Response.json(
      { error: "update_failed" },
      { status: 503, headers: NO_STORE },
    );
  }
  return Response.json({ status: "processed" }, { headers: NO_STORE });
}
