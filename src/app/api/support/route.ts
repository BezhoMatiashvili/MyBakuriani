import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getActiveZones } from "@/lib/zones/server";
import { CONTACT_EMAIL, CONTACT_PHONE_E164 } from "@/lib/site-contact";
import { OpenRouterError, isSupportConfigured } from "@/lib/support/openrouter";
import {
  ACCOUNT_QUESTION,
  SUPPORT_LIMITS,
  parseSupportRequest,
  type SupportAskRequest,
  type SupportButton,
  type SupportPlanRequest,
  type SupportReply,
  type SupportResponse,
} from "@/lib/support/plan";
import {
  actionHref,
  availableActionIds,
  normalizeAction,
  type ActionContext,
} from "@/lib/support/actions";
import { answerCache, cacheKey, planCache } from "@/lib/support/cache";
import { loadPriceFacts } from "@/lib/support/prices";
import { loadAccountFacts } from "@/lib/support/account";
import {
  answerQuestion,
  answerRequestBody,
  planGuide,
  planRequestBody,
  type AnswerContext,
} from "@/lib/support/server";

// The support assistant on every page (C43): "ask" goes to Gemini Flash Lite
// through the forced reply tool, "plan" to Flash Lite with the Jev router
// (Google only) as backup, "feedback" is one log line. Identical requests are
// answered from an in-memory cache before any limit or model is touched.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function reply(body: SupportResponse, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function log(event: Record<string, unknown>) {
  console.info(`[support] ${JSON.stringify(event)}`);
}

/** Ties a log line to the 👍/👎 sent back for it; carries nothing else. */
function newRef(): string {
  return Array.from(randomBytes(10), (byte) => REF_ALPHABET[byte % 36]).join(
    "",
  );
}

function tbilisiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Every button's link is built here, from the checked id and params and the
// request's full context (zones, contact details): the browser never builds
// one from model output.
function answer(
  result: SupportReply,
  ref: string,
  ctx: ActionContext,
): SupportResponse {
  const actions: SupportButton[] = [];
  for (const action of result.actions) {
    const href = actionHref(action, ctx);
    if (href) actions.push({ ...action, href });
  }
  return {
    type: "answer",
    text: result.text,
    actions,
    guide: result.guide,
    guideNow: result.guideNow,
    suggestions: result.suggestions,
    ref,
  };
}

// checkRateLimit fails open (C16), so these are abuse brakes, not a budget:
// the key's own spending limit on OpenRouter is the hard cap. A plan costs
// more than an answer, so its hourly allowance is lower. A denied check still
// counts, so the shared daily allowances are checked only after the caller's
// own limits pass: one caller past its cap cannot use up everyone's.
async function withinLimits(
  parsed: SupportAskRequest | SupportPlanRequest,
  userId: string | null,
  request: Request,
): Promise<boolean> {
  const plan = parsed.mode === "plan";
  const own = await Promise.all(
    userId
      ? [
          checkRateLimit(
            `support:${parsed.mode}:user:${userId}`,
            plan ? 30 : 40,
            HOUR,
          ),
          checkRateLimit(`support:day:user:${userId}`, 200, DAY),
        ]
      : [
          checkRateLimit(
            `support:${parsed.mode}:ip:${getClientIp(request)}`,
            plan ? 15 : 20,
            HOUR,
          ),
          checkRateLimit(`support:day:ip:${getClientIp(request)}`, 60, DAY),
        ],
  );
  if (own.includes(false)) return false;
  // Narrowest shared allowance first, for the same reason: a full
  // signed-out allowance must not keep spending the site-wide one.
  if (!userId && !(await checkRateLimit("support:day:anon", 1500, DAY)))
    return false;
  return checkRateLimit("support:day:all", 5000, DAY);
}

function failure(err: unknown) {
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

export async function POST(request: Request) {
  if (!isSupportConfigured())
    return reply({ type: "error", error: "unavailable" }, 503);

  // Signed-out visitors (home page, listings, registration) are served too,
  // under tighter per-IP brakes and a shared daily allowance. The body is
  // read while the session is checked.
  const body = request.text().catch(() => "");
  const user = await getCurrentUser();
  const raw = await body;
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
  const userId = user?.id ?? null;
  const signedIn = userId !== null;

  if (parsed.mode === "feedback") {
    const ok = await checkRateLimit(
      userId
        ? `support:feedback:user:${userId}`
        : `support:feedback:ip:${getClientIp(request)}`,
      60,
      HOUR,
    );
    if (!ok) return reply({ type: "error", error: "rate_limited" }, 429);
    log({
      mode: "feedback",
      ref: parsed.ref,
      rating: parsed.rating,
      source: parsed.ref.startsWith("canned:") ? "canned" : "answer",
    });
    return reply({ type: "ok" });
  }

  if (parsed.mode === "plan") {
    const model = planRequestBody(parsed, signedIn);
    const key = cacheKey(model);
    const hit = planCache.get(key);
    if (hit) {
      log({
        mode: "plan",
        source: "cache",
        key: key.slice(0, 10),
        cabinet: parsed.cabinet,
        path: parsed.path,
      });
      return reply({ type: "plan", plan: hit });
    }
    if (!(await withinLimits(parsed, userId, request)))
      return reply({ type: "error", error: "rate_limited" }, 429);
    try {
      const result = await planGuide(parsed, model);
      if (result.type === "plan") planCache.set(key, result.plan);
      return reply(result);
    } catch (err) {
      return failure(err);
    }
  }

  const today = tbilisiToday();
  const [prices, zones] = await Promise.all([
    loadPriceFacts(),
    getActiveZones()
      .then((list) => list.map((zone) => zone.name_ka))
      .catch(() => [] as string[]),
  ]);
  const actionContext: ActionContext = {
    cabinet: parsed.cabinet,
    signedIn,
    today,
    zones,
    contact: { phone: CONTACT_PHONE_E164, email: CONTACT_EMAIL },
  };
  const context: AnswerContext = {
    signedIn,
    prices,
    zones,
    today,
    available: availableActionIds(actionContext),
    account: null,
  };
  const normalize = (id: string, params: unknown) =>
    normalizeAction(id, params, actionContext);
  const ref = newRef();
  const logAnswer = (event: Record<string, unknown>, result: SupportReply) =>
    log({
      mode: "ask",
      ref,
      cabinet: parsed.cabinet,
      path: parsed.path,
      topic: result.topic,
      actions: result.actions.map((action) => action.id),
      guide: result.guide !== "",
      ...event,
    });

  // A question about the user's own situation reads their own status first;
  // such answers are personal, so they never touch the cache.
  const wantsAccount = signedIn && ACCOUNT_QUESTION.test(parsed.message);
  let key: string | null = null;
  if (!wantsAccount) {
    key = cacheKey(answerRequestBody(parsed, context));
    const hit = answerCache.get(key);
    if (hit) {
      logAnswer(
        { source: "cache", model: hit.model, key: key.slice(0, 10) },
        hit.reply,
      );
      return reply(answer(hit.reply, ref, actionContext));
    }
  }
  if (!(await withinLimits(parsed, userId, request)))
    return reply({ type: "error", error: "rate_limited" }, 429);

  try {
    if (wantsAccount && userId)
      context.account = await loadAccountFacts(userId);
    let result = await answerQuestion(
      answerRequestBody(parsed, context),
      parsed,
      normalize,
    );
    // The model says the answer depends on the user's own status: read it
    // and ask once more.
    if (result.reply.needsAccount && userId && context.account === null) {
      const account = await loadAccountFacts(userId);
      if (account) {
        context.account = account;
        result = await answerQuestion(
          answerRequestBody(parsed, context),
          parsed,
          normalize,
        );
      }
    }
    if (key && context.account === null)
      answerCache.set(key, { reply: result.reply, model: result.model });
    logAnswer(
      {
        source: "model",
        model: result.model,
        provider: result.provider,
        ms: result.ms,
        cost: result.cost,
        cached: result.cachedTokens,
        account: context.account !== null,
        key: key?.slice(0, 10),
      },
      result.reply,
    );
    return reply(answer(result.reply, ref, actionContext));
  } catch (err) {
    return failure(err);
  }
}
