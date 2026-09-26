import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { normalizeE164Phone } from "@/lib/security";
import {
  CV_CONTENT_TYPES,
  MAX_CV_BYTES,
  sniffCvType,
} from "@/lib/employment/cv-file";

export const runtime = "nodejs";

// Room for the multipart boundaries and the JSON payload part next to a
// maximum-size CV. next.config.ts raises middlewareClientMaxBodySize above
// this, or Next would silently truncate the body before this route runs.
const MAX_BODY_BYTES = MAX_CV_BYTES + 256 * 1024;

// Private bucket; no storage.objects policy grants browser access, so every
// read and write goes through service-role routes (this one and [id]/cv).
const CV_BUCKET = "cv-documents";

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

/**
 * JSON body, or multipart/form-data with the same JSON object in a "payload"
 * part and an optional "cv" file part. Returns null for anything unreadable.
 */
async function readSubmission(
  req: NextRequest,
): Promise<{ body: Application | null; cv: File | null } | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return {
      body: (await req.json().catch(() => null)) as Application | null,
      cv: null,
    };
  }
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const payload = form.get("payload");
  const cv = form.get("cv");
  if (typeof payload !== "string" || (cv !== null && !(cv instanceof File))) {
    return null;
  }
  let body: Application | null = null;
  try {
    body = JSON.parse(payload) as Application | null;
  } catch {
    return null;
  }
  return { body, cv };
}

export async function POST(req: NextRequest) {
  if (
    !(await checkRateLimit(
      `job-application:${getClientIp(req)}`,
      5,
      60 * 60_000,
    ))
  ) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "cv_too_large" }, { status: 413 });
  }
  const submission = await readSubmission(req);
  const body = submission?.body ?? null;
  const cv = submission?.cv ?? null;
  const phone = normalizeE164Phone(body?.phone);
  // Every field the insert below calls a string method on is type-checked
  // here: a TypeError there would come after the CV upload, skip its cleanup
  // and leave an orphaned file.
  const optionalText = (value: unknown) =>
    value == null || typeof value === "string";
  if (
    !body ||
    typeof body.service_id !== "string" ||
    !isUuid(body.service_id) ||
    typeof body.full_name !== "string" ||
    !body.full_name.trim() ||
    body.full_name.trim().length > 120 ||
    !phone ||
    !Array.isArray(body.languages) ||
    body.languages.length > 12 ||
    !body.languages.every((value) => typeof value === "string") ||
    !optionalText(body.birth_date) ||
    !optionalText(body.current_location) ||
    !optionalText(body.last_workplace) ||
    (body.desired_salary != null &&
      (!Number.isFinite(body.desired_salary) ||
        body.desired_salary < 0 ||
        body.desired_salary > 1_000_000))
  ) {
    return Response.json({ error: "invalid_application" }, { status: 400 });
  }

  // The file is identified by its bytes; its name and declared type are
  // ignored, and it is stored under a server-chosen path and content type.
  let cvFile: { bytes: Uint8Array; ext: "pdf" | "docx" } | null = null;
  if (cv) {
    if (cv.size > MAX_CV_BYTES) {
      return Response.json({ error: "cv_too_large" }, { status: 413 });
    }
    const bytes = new Uint8Array(await cv.arrayBuffer());
    const ext = sniffCvType(bytes);
    if (!ext) return Response.json({ error: "invalid_cv" }, { status: 400 });
    cvFile = { bytes, ext };
  }

  const serviceId = body.service_id as string;
  const user = await getCurrentUser();
  const db = createServiceClient();
  const { data: service } = await db
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("category", "employment")
    .eq("status", "active")
    .maybeSingle();
  if (!service)
    return Response.json({ error: "listing_not_found" }, { status: 404 });

  const applicationId = crypto.randomUUID();
  let cvPath: string | null = null;
  if (cvFile) {
    cvPath = `${serviceId}/${applicationId}.${cvFile.ext}`;
    const { error: uploadError } = await db.storage
      .from(CV_BUCKET)
      .upload(cvPath, cvFile.bytes, {
        contentType: CV_CONTENT_TYPES[cvFile.ext],
        upsert: false,
      });
    if (uploadError) {
      console.error("job application CV upload failed", uploadError);
      return Response.json({ error: "cv_upload_failed" }, { status: 503 });
    }
  }

  const { error } = await db.from("job_applications").insert({
    id: applicationId,
    service_id: serviceId,
    applicant_user_id: user?.id ?? null,
    full_name: body.full_name.trim(),
    phone,
    birth_date: body.birth_date || null,
    current_location: body.current_location?.trim().slice(0, 120) || null,
    needs_housing: body.needs_housing === true,
    languages: body.languages
      .map((value) => value.trim().slice(0, 40))
      .filter(Boolean),
    is_non_smoker: body.is_non_smoker === true,
    has_health_certificate: body.has_health_certificate === true,
    has_experience: body.has_experience === true,
    last_workplace: body.has_experience
      ? body.last_workplace?.trim().slice(0, 240) || null
      : null,
    desired_salary: body.desired_salary ?? null,
    cv_path: cvPath,
  });
  if (error) {
    console.error("job application submission failed", error);
    if (cvPath) {
      // Best effort: an application that was never recorded keeps no file.
      const { error: removeError } = await db.storage
        .from(CV_BUCKET)
        .remove([cvPath]);
      if (removeError) {
        console.error("orphaned job application CV", cvPath, removeError);
      }
    }
    return Response.json({ error: "submission_unavailable" }, { status: 503 });
  }
  return Response.json({ submitted: true }, { status: 201 });
}
