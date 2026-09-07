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
    "self_service_activate_menu_item_discount",
    {
      p_actor_id: user.id,
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
  return Response.json({ result: data }, { status: 200 });
}
