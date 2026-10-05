import "server-only";

// Minimal OpenRouter chat-completions client for the support assistant (C43).
// OPENROUTER_API_KEY is server-only and must never be NEXT_PUBLIC_.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }

  /** The key's credit or spending limit is used up: retrying cannot help. */
  get isBudget(): boolean {
    return (
      this.status === 402 ||
      (this.status === 403 && /limit|credit/i.test(this.message))
    );
  }
}

export type ToolCall = {
  function?: { name?: string; arguments?: unknown };
};

export type ChatMessage = {
  content?: string | null;
  tool_calls?: ToolCall[];
};

export type ChatResult = {
  message: ChatMessage | null;
  model: string;
  cost: number | null;
};

type ChatResponse = {
  model?: string;
  error?: { message?: string; code?: number };
  usage?: { cost?: number };
  choices?: { message?: ChatMessage; error?: { message?: string } }[];
};

export function isSupportConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

/**
 * One chat completion. Throws OpenRouterError for a missing key (503), a
 * timeout (504), a network failure (502) or any error OpenRouter reports,
 * with its HTTP status (402 = credits or key limit used up).
 */
export async function openRouterChat(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new OpenRouterError("OPENROUTER_API_KEY is not set", 503);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_SITE_URL || "https://mybakuriani.ge",
        "X-Title": "MyBakuriani",
      },
      body: JSON.stringify({ ...body, usage: { include: true } }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    throw new OpenRouterError(
      timedOut ? "timeout" : "network error",
      timedOut ? 504 : 502,
    );
  }

  const data = (await response.json().catch(() => null)) as ChatResponse | null;
  const choice = data?.choices?.[0];
  if (!response.ok || !data || data.error || choice?.error) {
    const message =
      data?.error?.message ??
      choice?.error?.message ??
      `HTTP ${response.status}`;
    const status = response.ok
      ? Number(data?.error?.code) || 502
      : response.status;
    throw new OpenRouterError(String(message).slice(0, 300), status);
  }

  return {
    message: choice?.message ?? null,
    model: String(data.model ?? ""),
    cost: typeof data.usage?.cost === "number" ? data.usage.cost : null,
  };
}
