import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Client-detail page data: profile + owned properties + this seller's own
// manual bookings (public.bookings has no writers anywhere in the repo — see
// memory-bank/contracts.md C25 / the no-online-booking-flow memory note).
export async function GET(_req: Request, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient();
  const [
    { data: profile, error: profileError },
    { data: properties, error: propertiesError },
    { data: bookings, error: bookingsError },
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db
      .from("properties")
      .select("*")
      .eq("owner_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("manual_bookings")
      .select("*")
      .eq("owner_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (propertiesError || bookingsError) {
    return Response.json(
      { error: (propertiesError ?? bookingsError)?.message },
      { status: 500 },
    );
  }

  return Response.json({
    profile,
    properties: properties ?? [],
    bookings: bookings ?? [],
  });
}
