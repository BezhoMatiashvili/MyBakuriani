import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const values = await request.json().catch(() => null);
  if (!isObject(values) || Object.keys(values).length === 0)
    return Response.json({ error: "invalid_profile_payload" }, { status: 400 });
  const db = createServiceClient(user.id);
  // The database function rechecks both actor identity and the complete allowlist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("self_service_update_profile", {
    p_actor_id: user.id,
    p_values: values,
  });
  if (error)
    return Response.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 400 },
    );
  return Response.json(data);
}
