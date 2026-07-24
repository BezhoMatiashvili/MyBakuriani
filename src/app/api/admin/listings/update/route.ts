import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import type { Database } from "@/lib/types/database";

export const runtime = "nodejs";

type Kind = "property" | "service";

const PROPERTY_FIELDS = new Set<string>([
  "title",
  "description",
  "location",
  "location_lat",
  "location_lng",
  "type",
  "rooms",
  "bathrooms",
  "area_sqm",
  "capacity",
  "photos",
  "amenities",
  "house_rules",
  "cadastral_code",
  "is_for_sale",
  "price_per_night",
  "sale_price",
  "currency",
  "discount_percent",
  "cleaning_fee",
  "min_booking_days",
  "status",
  "admin_notes",
  "is_vip",
  "is_super_vip",
  "vip_expires_at",
  "is_b2b_partner",
  "room_type",
  "renovation_status",
  "construction_status",
  "construction_progress_percent",
  "completion_year",
  "progress_note",
  "developer",
  "hotel_stars",
  "distance_to_slope_m",
  "roi_percent",
]);

const SERVICE_FIELDS = new Set<string>([
  "title",
  "description",
  "location",
  "phone",
  "photos",
  "price",
  "price_unit",
  "currency",
  "discount_percent",
  "is_vip",
  "status",
  "admin_notes",
  "category",
  "cuisine_type",
  "has_delivery",
  "operating_hours",
  "menu",
  "menu_url",
  "avg_check",
  "accommodation",
  "meals",
  "has_kids_area",
  "has_live_music",
  "has_lounge",
  "driver_name",
  "vehicle_capacity",
  "vehicle_make",
  "route",
  "routes",
  "transport_type",
  "position",
  "salary_range",
  "salary_min",
  "salary_max",
  "salary_daily",
  "salary_type",
  "experience_required",
  "employment_type",
  "employment_schedule",
  "work_schedule",
  "requirements",
  "schedule",
  "languages",
  "equipment",
  "is_new",
]);

const NUMERIC_FIELDS = new Set<string>([
  "location_lat",
  "location_lng",
  "rooms",
  "bathrooms",
  "area_sqm",
  "capacity",
  "price_per_night",
  "sale_price",
  "discount_percent",
  "cleaning_fee",
  "min_booking_days",
  "construction_progress_percent",
  "completion_year",
  "hotel_stars",
  "distance_to_slope_m",
  "roi_percent",
  "price",
  "vehicle_capacity",
  "salary_min",
  "salary_max",
  "salary_daily",
]);

const BOOLEAN_FIELDS = new Set<string>([
  "is_for_sale",
  "is_vip",
  "is_super_vip",
  "is_b2b_partner",
  "has_delivery",
  "has_kids_area",
  "has_live_music",
  "has_lounge",
  "is_new",
]);

const STRING_ARRAY_FIELDS = new Set<string>([
  "photos",
  "routes",
  "languages",
  "equipment",
]);

const STATUS_VALUES = new Set(["active", "blocked", "pending", "draft"]);
const PROPERTY_TYPE_VALUES = new Set([
  "apartment",
  "cottage",
  "hotel",
  "studio",
  "villa",
  "land",
]);
const SERVICE_CATEGORY_VALUES = new Set([
  "cleaning",
  "transport",
  "food",
  "entertainment",
  "employment",
  "handyman",
]);

type CleanError = { field: string; reason: string };

function coerceValue(
  field: string,
  value: unknown,
  errors: CleanError[],
): unknown {
  if (value === null) return null;

  if (NUMERIC_FIELDS.has(field)) {
    if (value === "" || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      errors.push({ field, reason: "not a number" });
      return undefined;
    }
    return n;
  }

  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "" || value === undefined) return null;
    errors.push({ field, reason: "not a boolean" });
    return undefined;
  }

  if (STRING_ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      errors.push({ field, reason: "expected array" });
      return undefined;
    }
    return value.filter((v): v is string => typeof v === "string");
  }

  if (field === "status") {
    if (value === "" || value === undefined) return null;
    if (typeof value !== "string" || !STATUS_VALUES.has(value)) {
      errors.push({ field, reason: "invalid status" });
      return undefined;
    }
    return value;
  }

  if (field === "type") {
    if (typeof value !== "string" || !PROPERTY_TYPE_VALUES.has(value)) {
      errors.push({ field, reason: "invalid property type" });
      return undefined;
    }
    return value;
  }

  if (field === "category") {
    if (typeof value !== "string" || !SERVICE_CATEGORY_VALUES.has(value)) {
      errors.push({ field, reason: "invalid service category" });
      return undefined;
    }
    return value;
  }

  if (field === "amenities") {
    if (!Array.isArray(value)) {
      errors.push({ field, reason: "expected array" });
      return undefined;
    }
    return value.filter((v): v is string => typeof v === "string");
  }

  if (field === "house_rules" || field === "menu") {
    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push({ field, reason: "expected object" });
      return undefined;
    }
    return value;
  }

  if (field === "vip_expires_at") {
    if (value === "" || value === undefined) return null;
    if (typeof value !== "string") {
      errors.push({ field, reason: "expected ISO date string" });
      return undefined;
    }
    const t = Date.parse(value);
    if (!Number.isFinite(t)) {
      errors.push({ field, reason: "invalid date" });
      return undefined;
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      if (field === "title" || field === "location") {
        errors.push({ field, reason: "cannot be empty" });
        return undefined;
      }
      return null;
    }
    return trimmed;
  }

  if (typeof value === "number") return value;

  errors.push({ field, reason: "unsupported value" });
  return undefined;
}

function cleanPatch(
  kind: Kind,
  patch: Record<string, unknown>,
): { clean: Record<string, unknown>; errors: CleanError[] } {
  const allowed = kind === "property" ? PROPERTY_FIELDS : SERVICE_FIELDS;
  const clean: Record<string, unknown> = {};
  const errors: CleanError[] = [];

  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) continue;
    const coerced = coerceValue(key, patch[key], errors);
    if (coerced === undefined) continue;
    clean[key] = coerced;
  }

  return { clean, errors };
}

type Body = {
  kind?: Kind;
  id?: string;
  patch?: Record<string, unknown>;
};

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.kind || !body.patch) {
    return Response.json(
      { error: "kind + id + patch required" },
      { status: 400 },
    );
  }
  if (body.kind !== "property" && body.kind !== "service") {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }

  const { clean, errors } = cleanPatch(body.kind, body.patch);
  if (errors.length > 0) {
    return Response.json(
      { error: "invalid fields", details: errors },
      { status: 400 },
    );
  }
  if (Object.keys(clean).length === 0) {
    return Response.json({ ok: true, updated: 0 });
  }

  const db = createServiceClient(guard.admin.userId);
  const table: "properties" | "services" =
    body.kind === "property" ? "properties" : "services";

  const { error } = await db
    .from(table)
    .update(clean as Database["public"]["Tables"][typeof table]["Update"])
    .eq("id", body.id);

  if (error) {
    if (
      error.code === "23505" &&
      `${error.message} ${error.details ?? ""}`
        .toLowerCase()
        .includes("cadastral")
    ) {
      return Response.json(
        { error: "cadastral_already_used" },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Field edits change the cached public listing + list pages — invalidate now.
  revalidateTag(listingTag(body.kind, body.id));
  revalidateListingLists(body.kind);

  return Response.json({ ok: true, updated: Object.keys(clean).length });
}
