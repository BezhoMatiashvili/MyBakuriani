import { GoogleGenAI, Type } from "@google/genai";

// Preferred Gemini 3.1 Flash-Lite is in preview and occasionally returns 503
// (capacity). Fall back to stable models so admin AI features don't break
// when the preview model is unavailable.
const MODEL_CHAIN = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenAI({ apiKey });
}

type GenConfig = Parameters<
  ReturnType<typeof getClient>["models"]["generateContent"]
>[0];

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED/i.test(
    msg,
  );
}

async function generateWithFallback(
  configFactory: (model: string) => GenConfig,
): Promise<{ text: string; model: string }> {
  const ai = getClient();
  let lastErr: unknown = null;
  for (const model of MODEL_CHAIN) {
    try {
      const response = await ai.models.generateContent(configFactory(model));
      return { text: response.text ?? "", model };
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "all models failed"));
}

export type ReviewAnalysis = {
  sentiment: "positive" | "neutral" | "negative";
  risk_tags: string[];
  summary_ka: string;
};

/**
 * Analyze a guest review for sentiment + risk tags (legal risk, slander, harassment, spam, off-topic).
 * Returns structured JSON. Callers must catch — no silent fallback.
 */
export async function analyzeReview(params: {
  rating: number;
  comment: string;
}): Promise<ReviewAnalysis> {
  const { text } = await generateWithFallback((model) => ({
    model,
    contents: `შეაფასე სტუმრის მიმოხილვა მესაკუთრის ბინაზე. რეიტინგი: ${params.rating}/5. კომენტარი: "${params.comment.replace(/"/g, '\\"')}". დააბრუნე JSON.`,
    config: {
      systemInstruction:
        "You moderate guest reviews for a Georgian rental marketplace. Output strict JSON matching the schema. Keep summary_ka short (≤120 chars) and in Georgian. Risk tags from: LEGAL_RISK, SLANDER, HARASSMENT, SPAM, OFF_TOPIC, PROFANITY, FAKE.",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: {
            type: Type.STRING,
            enum: ["positive", "neutral", "negative"],
          },
          risk_tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          summary_ka: { type: Type.STRING },
        },
        propertyOrdering: ["sentiment", "risk_tags", "summary_ka"],
        required: ["sentiment", "risk_tags", "summary_ka"],
      },
    },
  }));
  const parsed = JSON.parse(text || "{}") as ReviewAnalysis;
  if (!parsed.sentiment || !Array.isArray(parsed.risk_tags)) {
    throw new Error("gemini returned malformed review analysis");
  }
  return parsed;
}

/**
 * Polish or generate a marketing broadcast body in Georgian.
 */
export async function draftBroadcast(params: {
  audience: string;
  tone: string;
  prompt: string;
  channel: "push" | "sms" | "email";
}): Promise<{ subject: string | null; body: string }> {
  const charBudget = params.channel === "sms" ? 160 : 600;
  const { text } = await generateWithFallback((model) => ({
    model,
    contents: `აუდიტორია: ${params.audience}. ტონი: ${params.tone}. არხი: ${params.channel}. მოთხოვნა: ${params.prompt}`,
    config: {
      systemInstruction: `შენ ხარ კოპირაიტერი Georgian rental marketplace-ისთვის. დაწერე მკაფიო, ქოქვითი ტექსტი ქართულად. მაქსიმუმ ${charBudget} სიმბოლო body-სთვის. Subject მხოლოდ email-ზე.`,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          body: { type: Type.STRING },
        },
        propertyOrdering: ["subject", "body"],
        required: ["body"],
      },
    },
  }));
  const parsed = JSON.parse(text || "{}") as {
    subject?: string;
    body: string;
  };
  return { subject: parsed.subject ?? null, body: parsed.body };
}

/**
 * Draft a SEO article in Georgian given a topic + keywords.
 */
export async function draftBlogArticle(params: {
  topic: string;
  keywords: string[];
}): Promise<{ title: string; excerpt: string; body_markdown: string }> {
  const { text } = await generateWithFallback((model) => ({
    model,
    contents: `თემა: ${params.topic}. საკვანძო სიტყვები: ${params.keywords.join(", ")}.`,
    config: {
      systemInstruction:
        "შენ ხარ SEO კონტენტის ავტორი Bakuriani-ს ტურიზმის ბლოგზე. დაწერე სტატია ქართულად: სათაური (≤70 სიმბოლო), excerpt (≤160), body markdown ფორმატში (≥400 სიტყვა, ქვესათაურებით).",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          excerpt: { type: Type.STRING },
          body_markdown: { type: Type.STRING },
        },
        propertyOrdering: ["title", "excerpt", "body_markdown"],
        required: ["title", "excerpt", "body_markdown"],
      },
    },
  }));
  const parsed = JSON.parse(text || "{}") as {
    title: string;
    excerpt: string;
    body_markdown: string;
  };
  if (!parsed.title || !parsed.body_markdown) {
    throw new Error("gemini returned malformed blog draft");
  }
  return parsed;
}
