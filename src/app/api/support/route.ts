import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/rateLimit";
import { OpenRouterError, isSupportConfigured } from "@/lib/support/openrouter";
import {
  SUPPORT_LIMITS,
  parseSupportRequest,
  type SupportResponse,
} from "@/lib/support/plan";
import { answerQuestion, planGuide } from "@/lib/support/server";

// The dashboard support assistant (C43): "ask" goes to Gemini, "plan" to Jev.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

function reply(body: SupportResponse, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSupportConfigured())
    return reply({ type: "error", error: "unavailable" }, 503);

  const user = await getCurrentUser();
  if (!user) return reply({ type: "error", error: "unauthenticated" }, 401);

  const raw = await request.text().catch(() => "");
  if (raw.length > SUPPORT_LIMITS.body)
    return reply({ type: "error", error: "invalid" }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // falls through to the invalid reply below
  }
  const parsed = parseSupportRequest(json);
  if (!parsed) return reply({ type: "error", error: "invalid" }, 400);

  // checkRateLimit fails open (C16), so these are abuse brakes, not a budget:
  // the key's own spending limit on OpenRouter is the hard cap. Jev costs
  // more per call than Gemini, so its hourly allowance is lower.
  const allowed = await Promise.all([
    checkRateLimit(
      `support:${parsed.mode}:user:${user.id}`,
      parsed.mode === "plan" ? 30 : 40,
      HOUR,
    ),
    checkRateLimit(`support:day:user:${user.id}`, 200, DAY),
    checkRateLimit("support:day:all", 5000, DAY),
  ]);
  if (allowed.includes(false))
    return reply({ type: "error", error: "rate_limited" }, 429);

  try {
    return reply(
      parsed.mode === "ask"
        ? await answerQuestion(parsed)
        : await planGuide(parsed),
    );
  } catch (err) {
    if (err instanceof OpenRouterError && err.isBudget) {
      console.error("[support] OpenRouter credit or key limit reached");
      return reply({ type: "error", error: "budget" }, 503);
    }
    console.error(
      "[support] request failed:",
      err instanceof Error ? err.message : err,
    );
    return reply({ type: "error", error: "failed" }, 502);
  }
}
