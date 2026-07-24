import { buildCorsHeaders, jsonResponse } from "../_shared/guards.ts";

Deno.serve((request) => {
  const headers = buildCorsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  return jsonResponse(
    { error: "This endpoint has been retired", code: "GONE" },
    410,
    headers,
  );
});
