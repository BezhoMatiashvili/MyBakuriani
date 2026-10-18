import { fetchSlotCreatives } from "@/lib/banner-slots-server";

export const runtime = "nodejs";

/**
 * Every active creative for every placement, in one param-free response.
 *
 * Deliberately takes no `?placement=` filter: the total active set is a few KB,
 * so one URL means one CDN cache key with a maximal hit rate, and a page can
 * mount any number of slots for a single request. Each creative carries its own
 * `placement`, so the client groups them locally and adding a placement later
 * costs no extra round trip.
 *
 * All logic lives in fetchSlotCreatives so the RSC path and this HTTP path can
 * never diverge.
 */
export async function GET() {
  const creatives = await fetchSlotCreatives();

  return Response.json(
    { creatives },
    {
      // revalidatePath (the admin banner and ad routes) refreshes the origin's
      // data at once but does not purge this CDN entry, so an admin edit
      // reaches visitors within about 2 minutes (60 s fresh + 60 s stale).
      // An admin's own browser skips the CDN with `?fresh=` (C47).
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    },
  );
}
