import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

function statusForCode(code: string | undefined) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const serviceId = new URL(request.url).searchParams.get("serviceId") ?? "";
  if (!isUuid(serviceId)) {
    return Response.json({ error: "invalid_service_id" }, { status: 400 });
  }

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: service, error: serviceError } = await (db as any)
    .from("services")
    .select("id, owner_id, category")
    .eq("id", serviceId)
    .eq("owner_id", user.id)
    .eq("category", "food")
    .maybeSingle();
  if (serviceError) {
    return Response.json({ error: serviceError.message }, { status: 500 });
  }
  if (!service) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error } = await (db as any)
    .from("service_menu_items")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(
    { items: items ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    serviceId?: unknown;
    name?: unknown;
    description?: unknown;
    price?: unknown;
    photoUrl?: unknown;
  } | null;
  if (
    !body ||
    typeof body.serviceId !== "string" ||
    !isUuid(body.serviceId) ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0 ||
    typeof body.price !== "number" ||
    !Number.isFinite(body.price) ||
    body.price < 0
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description : null;
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl : null;

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc(
    "self_service_create_menu_item",
    {
      p_actor_id: user.id,
      p_service_id: body.serviceId,
      p_name: body.name,
      p_description: description,
      p_price: body.price,
      p_photo_url: photoUrl,
    },
  );
  if (error) {
    const message = error.message?.split("\n")[0] || "request_failed";
    return Response.json(
      { error: message, code: error.code },
      { status: statusForCode(error.code) },
    );
  }
  return Response.json({ item: data }, { status: 201 });
}
