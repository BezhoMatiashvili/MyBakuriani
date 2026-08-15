import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

function statusForCode(code: string | undefined) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    serviceId?: unknown;
    orderedIds?: unknown;
  } | null;
  if (
    !body ||
    typeof body.serviceId !== "string" ||
    !isUuid(body.serviceId) ||
    !Array.isArray(body.orderedIds) ||
    body.orderedIds.length === 0 ||
    !body.orderedIds.every((id) => typeof id === "string" && isUuid(id))
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).rpc("self_service_reorder_menu_items", {
    p_actor_id: user.id,
    p_service_id: body.serviceId,
    p_ordered_ids: body.orderedIds,
  });
  if (error) {
    const message = error.message?.split("\n")[0] || "request_failed";
    return Response.json(
      { error: message, code: error.code },
      { status: statusForCode(error.code) },
    );
  }
  revalidateTag(listingTag("service", body.serviceId));
  return Response.json({ ok: true });
}
