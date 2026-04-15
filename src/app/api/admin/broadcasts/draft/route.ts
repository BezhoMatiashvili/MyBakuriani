import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { draftBroadcast } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    audience?: string;
    tone?: string;
    prompt?: string;
    channel?: "push" | "email" | "sms";
  } | null;
  if (!body?.prompt?.trim() || !body.channel) {
    return Response.json(
      { error: "prompt, channel required" },
      { status: 400 },
    );
  }
  try {
    const draft = await draftBroadcast({
      audience: body.audience ?? "all users",
      tone: body.tone ?? "friendly-professional",
      prompt: body.prompt,
      channel: body.channel,
    });
    return Response.json(draft);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "draft failed" },
      { status: 502 },
    );
  }
}
