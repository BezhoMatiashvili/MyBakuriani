import { buildCorsHeaders, jsonResponse } from "../_shared/guards.ts";

// Retired alongside booking-create: no code path in src/ ever calls this
// function — the live product books exclusively through offline
// `manual_bookings` rows (see the no-online-booking-flow memory note), never
// the `bookings` table this endpoint managed. Confirmed dead by architecture
// audit on 2026-09-14; kept as a tombstone so a bulk deploy cannot resurrect
// the live handler.
Deno.serve((request) => {
  const headers = buildCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  return jsonResponse(
    { error: "This endpoint has been retired", code: "GONE" },
    410,
    headers,
  );
});
