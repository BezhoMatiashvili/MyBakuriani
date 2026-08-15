// Retired legacy endpoint. The multi-tenant AI/chat product and its tables do
// not belong to MyBakuriani, but this function remained deployed with public
// access and a service-role client. Keep a versioned tombstone so anonymous
// callers cannot consume the configured model API or revive cross-tenant data
// access, and so future bulk deployments cannot restore the old handler.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "endpoint_retired" }), {
    status: 410,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
);
