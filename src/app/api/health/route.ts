export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness probe for DigitalOcean App Platform's HTTP health check.
//
// Deliberately checks NOTHING but the Node process: no Supabase call, no env
// reads. A liveness probe that touches a downstream dependency turns a Supabase
// blip into a container restart loop, which is strictly worse than the degraded
// reads the app already handles. "Can this process still answer HTTP?" is the
// only question DO needs answered here.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
