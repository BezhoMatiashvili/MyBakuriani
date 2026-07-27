import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !body ||
    !isStringArray(body.stages) ||
    (body.photos !== undefined && !isStringArray(body.photos)) ||
    (body.status !== undefined &&
      body.status !== null &&
      typeof body.status !== "string") ||
    (body.note !== undefined && body.note !== null && typeof body.note !== "string") ||
    (body.videoUrl !== undefined &&
      body.videoUrl !== null &&
      typeof body.videoUrl !== "string") ||
    (body.updateDate !== undefined && typeof body.updateDate !== "string")
  )
    return Response.json({ error: "invalid_progress_payload" }, { status: 400 });
  const db = createServiceClient(user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("self_service_publish_property_progress", {
    p_actor_id: user.id,
    p_property_id: id,
    p_stages: body.stages,
    p_status: body.status ?? null,
    p_note: body.note ?? null,
    p_photos: body.photos ?? [],
    p_video_url: body.videoUrl ?? null,
    p_update_date: body.updateDate ?? null,
  });
  if (error)
    return Response.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400 },
    );
  revalidateTag(listingTag("property", id));
  revalidateListingLists("property");
  return Response.json(data);
}
