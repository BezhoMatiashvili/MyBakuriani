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
  const menuItemId = new URL(request.url).searchParams.get("menuItemId") ?? "";
  if (!isUuid(menuItemId)) {
    return Response.json({ error: "invalid_menu_item_id" }, { status: 400 });
  }

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item, error: itemError } = await (db as any)
    .from("service_menu_items")
    .select("id, discount_percent, discount_expires_at, service_id")
    .eq("id", menuItemId)
    .maybeSingle();
  if (itemError) {
    return Response.json({ error: itemError.message }, { status: 500 });
  }
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: service, error: serviceError } = await (db as any)
    .from("services")
    .select("id, owner_id, category")
    .eq("id", item.service_id)
    .eq("owner_id", user.id)
    .eq("category", "food")
    .maybeSingle();
  if (serviceError) {
    return Response.json({ error: serviceError.message }, { status: 500 });
  }
  if (!service) return Response.json({ error: "not_found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: requestRow, error } = await (db as any)
    .from("content_change_requests")
    .select(
      "id,status,proposed_values,pricing_package_id,quoted_amount_gel,quoted_duration_hours,payment_error,rejection_reason,created_at,reviewed_at,request_metadata",
    )
    .eq("target_menu_item_id", menuItemId)
    .eq("request_kind", "menu_item_discount")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(
    {
      request: requestRow ?? null,
      item: {
        id: item.id,
        discount_percent: item.discount_percent,
        discount_expires_at: item.discount_expires_at,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    menuItemId?: unknown;
    packageId?: unknown;
    discountPercent?: unknown;
    quantity?: unknown;
  } | null;
  if (
    !body ||
    typeof body.menuItemId !== "string" ||
    !isUuid(body.menuItemId) ||
    typeof body.packageId !== "string" ||
    !isUuid(body.packageId) ||
    !Number.isInteger(body.discountPercent) ||
    !Number.isInteger(body.quantity ?? 1)
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc(
    "submit_menu_item_discount_request",
    {
      p_requester_id: user.id,
      p_menu_item_id: body.menuItemId,
      p_package_id: body.packageId,
      p_discount_percent: body.discountPercent,
      p_quantity: body.quantity ?? 1,
    },
  );
  if (error) {
    const message = error.message?.split("\n")[0] || "request_failed";
    return Response.json(
      { error: message, code: error.code },
      { status: statusForCode(error.code) },
    );
  }
  return Response.json({ request: data }, { status: 201 });
}
