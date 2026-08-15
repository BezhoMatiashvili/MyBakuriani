// Retired companion to ai-respond. Facebook webhooks cannot present a Supabase
// JWT, so the gateway remains open while the handler is an inert tombstone.
// It reads no secrets, accepts no data, and performs no database/network work.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "endpoint_retired" }), {
    status: 410,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
);
