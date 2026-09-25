import { buildCorsHeaders, jsonResponse } from "../_shared/guards.ts";

// Retired 2026-09-25: this was half of the sandbox card flow (a fake card form
// in our own UI plus a TEST_PAYMENTS_ENABLED kill switch — the only thing
// standing between a signed-in account and free wallet credit). Real money now
// enters only through Keepz (src/app/api/payments/keepz/*, contract C32), and a
// wallet is credited only after our own Keepz status check. Kept as a
// tombstone so a bulk deploy cannot resurrect the sandbox handler.
Deno.serve((request) => {
  const headers = buildCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  return jsonResponse(
    { error: "This endpoint has been retired", code: "GONE" },
    410,
    headers,
  );
});
