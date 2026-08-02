export const runtime = "nodejs";

export async function POST() {
  return Response.json({ error: "free_text_sms_retired" }, { status: 410 });
}
