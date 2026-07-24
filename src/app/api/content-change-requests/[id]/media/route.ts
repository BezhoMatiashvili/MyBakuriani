import { getCurrentProfile, getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function containsPath(value: unknown, path: string): boolean {
  if (typeof value === "string") return value === path;
  if (Array.isArray(value)) return value.some((item) => containsPath(item, path));
  return !!value && typeof value === "object" && Object.values(value as Record<string, unknown>).some((item) => containsPath(item, path));
}

/** Owner/admin-only short-lived preview for media staged in content-change-media. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.includes("..")) return Response.json({ error: "invalid_path" }, { status: 400 });
  const profile = await getCurrentProfile();
  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: change, error } = await (db as any).from("content_change_requests").select("requester_id, proposed_values").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!change || (change.requester_id !== user.id && profile?.role !== "admin")) return Response.json({ error: "forbidden" }, { status: 403 });
  if (profile?.role !== "admin" && !path.startsWith(`${user.id}/`)) return Response.json({ error: "invalid_path" }, { status: 400 });
  if (!containsPath(change.proposed_values, path)) return Response.json({ error: "path_not_in_request" }, { status: 404 });
  const { data: signed, error: signedError } = await db.storage.from("content-change-media").createSignedUrl(path, 60);
  if (signedError || !signed) return Response.json({ error: signedError?.message ?? "preview_unavailable" }, { status: 500 });
  return Response.json({ url: signed.signedUrl });
}
