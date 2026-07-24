import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { normalizeE164Phone } from "@/lib/security";

export const runtime = "nodejs";

type Application = {
  service_id?: string;
  full_name?: string;
  phone?: string;
  birth_date?: string | null;
  current_location?: string | null;
  needs_housing?: boolean;
  languages?: string[];
  is_non_smoker?: boolean;
  has_health_certificate?: boolean;
  has_experience?: boolean;
  last_workplace?: string | null;
  desired_salary?: number | null;
};

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(`job-application:${getClientIp(req)}`, 5, 60 * 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Application | null;
  const phone = normalizeE164Phone(body?.phone);
  if (!body || typeof body.service_id !== "string" || !isUuid(body.service_id) || !body.full_name?.trim() || body.full_name.trim().length > 120 || !phone ||
    !Array.isArray(body.languages) || body.languages.length > 12 ||
    (body.desired_salary != null && (!Number.isFinite(body.desired_salary) || body.desired_salary < 0 || body.desired_salary > 1_000_000))) {
    return Response.json({ error: "invalid_application" }, { status: 400 });
  }
  const serviceId = body.service_id as string;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const db = createServiceClient();
  const { data: service } = await db.from("services").select("id").eq("id", serviceId).eq("category", "employment").eq("status", "active").maybeSingle();
  if (!service) return Response.json({ error: "listing_not_found" }, { status: 404 });
  const { error } = await db.from("job_applications").insert({
    service_id: serviceId,
    applicant_user_id: user?.id ?? null,
    full_name: body.full_name.trim(), phone,
    birth_date: body.birth_date || null,
    current_location: body.current_location?.trim().slice(0, 120) || null,
    needs_housing: body.needs_housing === true,
    languages: body.languages.map((value) => value.trim().slice(0, 40)).filter(Boolean),
    is_non_smoker: body.is_non_smoker === true,
    has_health_certificate: body.has_health_certificate === true,
    has_experience: body.has_experience === true,
    last_workplace: body.has_experience ? body.last_workplace?.trim().slice(0, 240) || null : null,
    desired_salary: body.desired_salary ?? null,
    cv_path: null,
  });
  if (error) {
    console.error("job application submission failed", error);
    return Response.json({ error: "submission_unavailable" }, { status: 503 });
  }
  return Response.json({ submitted: true }, { status: 201 });
}
