import { createHash, timingSafeEqual } from "node:crypto";
import { purgeOwnershipDocuments } from "@/lib/ownership/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bearer check against OWNERSHIP_PURGE_SECRET_SHA256. Only the SHA-256 of the
 * secret lives in the app env; the secret itself is generated inside the
 * database (Vault app.ownership_purge_secret) and never leaves it except in
 * pg_cron's request.
 */
function authorized(request: Request): "ok" | "denied" | "unconfigured" {
  const expected = (process.env.OWNERSHIP_PURGE_SECRET_SHA256 ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return "denied";
  const digest = createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(digest, Buffer.from(expected, "hex"))
    ? "ok"
    : "denied";
}

/**
 * Ownership-document purge (C39, C37), driven hourly by pg_cron
 * (ownership-document-purge-hourly). The routes already purge one owner after
 * every upload, submit and decision; this sweep bounds abandoned uploads and
 * retries what an earlier purge left. Server to server: exempt from the
 * middleware Origin check (server-paths.ts); reads no cookies.
 */
export async function POST(request: Request) {
  const auth = authorized(request);
  if (auth === "unconfigured") {
    return Response.json({ error: "unconfigured" }, { status: 503 });
  }
  if (auth === "denied") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await purgeOwnershipDocuments({
    ownerId: null,
    limit: 50,
    budgetMs: 20_000,
  });
  return Response.json(result);
}
