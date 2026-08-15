import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";

export const runtime = "nodejs";

function statusForCode(code: string | undefined) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    price?: unknown;
    photoUrl?: unknown;
    isAvailable?: unknown;
  } | null;
  if (
    !body ||
    typeof body.price !== "number" ||
    !Number.isFinite(body.price) ||
    body.price < 0
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : null;
  const description =
    typeof body.description === "string" ? body.description : null;
  const isAvailable =
    typeof body.isAvailable === "boolean" ? body.isAvailable : null;

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: menuItem, error: lookupError } = await (db as any)
    .from("service_menu_items")
    .select("service_id")
    .eq("id", id)
    .single();
  if (lookupError || !menuItem) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc(
    "self_service_update_menu_item",
    {
      p_actor_id: user.id,
      p_menu_item_id: id,
      p_name: name,
      p_description: description,
      p_price: body.price,
      p_photo_url: null,
      p_is_available: isAvailable,
    },
  );
  if (error) {
    const message = error.message?.split("\n")[0] || "request_failed";
    return Response.json(
      { error: message, code: error.code },
      { status: statusForCode(error.code) },
    );
  }
  revalidateTag(listingTag("service", menuItem.service_id));
  return Response.json({ item: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: menuItem, error: lookupError } = await (db as any)
    .from("service_menu_items")
    .select("service_id")
    .eq("id", id)
    .single();
  if (lookupError || !menuItem) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).rpc("self_service_delete_menu_item", {
    p_actor_id: user.id,
    p_menu_item_id: id,
  });
  if (error) {
    const message = error.message?.split("\n")[0] || "request_failed";
    return Response.json(
      { error: message, code: error.code },
      { status: statusForCode(error.code) },
    );
  }
  revalidateTag(listingTag("service", menuItem.service_id));
  return Response.json({ deleted: true });
}
