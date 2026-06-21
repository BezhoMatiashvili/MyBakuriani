import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { ZONE_ICON_VALUES, type ZoneIconValue } from "@/lib/zones/icon";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isValidIcon(v: unknown): v is ZoneIconValue {
  return (
    typeof v === "string" && (ZONE_ICON_VALUES as readonly string[]).includes(v)
  );
}

// null / undefined → null (auto-compute). A finite number >= 0 is accepted and
// floored to an integer. Anything else is rejected.
function normaliseOverride(
  v: unknown,
): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
    return { ok: true, value: Math.round(v) };
  }
  return { ok: false };
}

function bumpCaches() {
  // Zones flow through SSR everywhere; rebuild every locale route.
  revalidatePath("/", "layout");
}

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const db = createServiceClient();
    const { data, error } = await db
      .from("zones")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ zones: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const body = (await req.json().catch(() => null)) as {
      slug?: string;
      name_ka?: string;
      description_ka?: string;
      lat?: number;
      lng?: number;
      icon?: string;
      sort_order?: number;
      price_per_sqm_override?: number | null;
    } | null;

    if (!body) {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const slug = body.slug?.trim();
    const name_ka = body.name_ka?.trim();
    const description_ka = body.description_ka?.trim() ?? "";
    const { lat, lng, icon, sort_order } = body;

    if (!slug || !SLUG_RE.test(slug)) {
      return Response.json(
        { error: "slug required (a-z, 0-9, '-' '_')" },
        { status: 400 },
      );
    }
    if (!name_ka) {
      return Response.json({ error: "name_ka required" }, { status: 400 });
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return Response.json({ error: "lat/lng required" }, { status: 400 });
    }
    if (!isValidIcon(icon)) {
      return Response.json(
        { error: `icon must be one of ${ZONE_ICON_VALUES.join(", ")}` },
        { status: 400 },
      );
    }
    const override = normaliseOverride(body.price_per_sqm_override);
    if (!override.ok) {
      return Response.json(
        { error: "price_per_sqm_override must be a number >= 0 or null" },
        { status: 400 },
      );
    }

    const db = createServiceClient(guard.admin.userId);
    const { data, error } = await db
      .from("zones")
      .insert({
        slug,
        name_ka,
        description_ka,
        lat,
        lng,
        icon,
        sort_order: typeof sort_order === "number" ? sort_order : 999,
        is_active: true,
        price_per_sqm_override: override.value,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: "slug already exists" }, { status: 409 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    bumpCaches();
    return Response.json({ zone: data });
  } catch (error) {
    console.error("POST /api/admin/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const body = (await req.json().catch(() => null)) as {
      id?: string;
      name_ka?: string;
      description_ka?: string;
      lat?: number;
      lng?: number;
      icon?: string;
      sort_order?: number;
      is_active?: boolean;
      price_per_sqm_override?: number | null;
    } | null;

    if (!body?.id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name_ka === "string") {
      const trimmed = body.name_ka.trim();
      if (!trimmed)
        return Response.json(
          { error: "name_ka cannot be empty" },
          { status: 400 },
        );
      patch.name_ka = trimmed;
    }
    if (typeof body.description_ka === "string") {
      patch.description_ka = body.description_ka.trim();
    }
    if (typeof body.lat === "number") patch.lat = body.lat;
    if (typeof body.lng === "number") patch.lng = body.lng;
    if (body.icon !== undefined) {
      if (!isValidIcon(body.icon)) {
        return Response.json(
          { error: `icon must be one of ${ZONE_ICON_VALUES.join(", ")}` },
          { status: 400 },
        );
      }
      patch.icon = body.icon;
    }
    if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if ("price_per_sqm_override" in body) {
      const override = normaliseOverride(body.price_per_sqm_override);
      if (!override.ok) {
        return Response.json(
          { error: "price_per_sqm_override must be a number >= 0 or null" },
          { status: 400 },
        );
      }
      patch.price_per_sqm_override = override.value;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { error: "no updatable fields supplied" },
        { status: 400 },
      );
    }

    const db = createServiceClient(guard.admin.userId);
    const { error } = await db.from("zones").update(patch).eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    bumpCaches();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/admin/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Soft-delete only: set is_active = false. Historical references to the
  // zone name on properties/smart_match_requests still resolve cleanly.
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const db = createServiceClient(guard.admin.userId);
    const { error } = await db
      .from("zones")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    bumpCaches();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/zones failed", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}
