import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildCorsHeaders, jsonResponse } from "../_shared/guards.ts";

serve((req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return jsonResponse({ error: "Payments are disabled", code: "PAYMENTS_DISABLED" }, 503, cors);
});
