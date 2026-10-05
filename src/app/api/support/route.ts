import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { OpenRouterError, isSupportConfigured } from "@/lib/support/openrouter";
import {
  SUPPORT_LIMITS,
  parseSupportRequest,
  type SupportResponse,
} from "@/lib/support/plan";
import { answerQuestion, planGuide } from "@/lib/support/server";

// The support assistant on every page (C43): "ask" goes to Gemini Flash Lite,
// "plan" to Flash Lite with the Jev router (Google only) as backup.
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

  // Signed-out visitors (home page, listings, registration) are served too,
  // under tighter per-IP brakes and a shared daily allowance.
  const user = await getCurrentUser();

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
  // the key's own spending limit on OpenRouter is the hard cap. A plan costs
  // more than an answer, so its hourly allowance is lower.
  const plan = parsed.mode === "plan";
  const allowed = await Promise.all(
    user
      ? [
          checkRateLimit(
            `support:${parsed.mode}:user:${user.id}`,
            plan ? 30 : 40,
            HOUR,
          ),
          checkRateLimit(`support:day:user:${user.id}`, 200, DAY),
          checkRateLimit("support:day:all", 5000, DAY),
        ]
      : [
          checkRateLimit(
            `support:${parsed.mode}:ip:${getClientIp(request)}`,
            plan ? 15 : 20,
            HOUR,
          ),
          checkRateLimit(`support:day:ip:${getClientIp(request)}`, 60, DAY),
          checkRateLimit("support:day:anon", 1500, DAY),
          checkRateLimit("support:day:all", 5000, DAY),
        ],
  );
  if (allowed.includes(false))
    return reply({ type: "error", error: "rate_limited" }, 429);

  try {
    return reply(
      parsed.mode === "ask"
        ? await answerQuestion(parsed, Boolean(user))
        : await planGuide(parsed, Boolean(user)),
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
