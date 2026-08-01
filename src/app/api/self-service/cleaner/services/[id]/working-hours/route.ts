import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (
    !isObject(body) ||
    typeof body.is24_7 !== "boolean" ||
    typeof body.workingHours !== "string" ||
    Object.keys(body).some(
      (key) => key !== "is24_7" && key !== "workingHours",
    )
  ) {
    return Response.json(
      { error: "invalid_cleaner_working_hours_payload" },
      { status: 400 },
    );
  }

  const db = createServiceClient(user.id);
  const { data, error } = await db.rpc(
    "self_service_set_cleaner_working_hours",
    {
      p_actor_id: user.id,
      p_service_id: id,
      p_is_24_7: body.is24_7,
      p_working_hours: body.workingHours,
    },
  );

  if (error) {
    return Response.json(
      { error: error.message },
      {
        status:
          error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400,
      },
    );
  }

  const result = data as {
    services?: Array<{ id?: unknown }>;
  } | null;
  for (const service of result?.services ?? []) {
    if (typeof service.id === "string") {
      revalidateTag(listingTag("service", service.id));
    }
  }
  revalidateListingLists("service");
  return Response.json({ services: result?.services ?? [] });
}
