import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { buildCorsHeaders, jsonResponse } from "../_shared/guards.ts";

// Retired: browser/server multipart uploads did not prove ownership or inspect
// image bytes. New uploads must use a short-lived, server-issued upload intent.
serve((req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return jsonResponse(
    { error: "Direct uploads are disabled", code: "UPLOAD_INTENT_REQUIRED" },
    410,
    cors,
  );
});
