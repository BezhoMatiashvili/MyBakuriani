import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  DEFAULT_STATUS_CARDS,
  MAX_CARDS,
  MAX_ITEMS_PER_CARD,
  isStatusIcon,
  isStatusKind,
  type LocalizedText,
  type StatusCard,
  type StatusCardItem,
} from "@/lib/status-cards/types";
import { safeHttpsUrl } from "@/lib/security";

export const runtime = "nodejs";

const SETTING_KEY = "status_cards";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Coerces arbitrary input into a LocalizedText. `requireKa` rejects when the
// Georgian value is empty (used for labels, which must never be blank).
function sanitizeLocalized(
  value: unknown,
  requireKa: boolean,
): LocalizedText | null {
  const obj = (value ?? {}) as Record<string, unknown>;
  const ka = str(obj.ka);
  if (requireKa && !ka) return null;
  const out: LocalizedText = { ka };
  const en = str(obj.en);
  const ru = str(obj.ru);
  if (en) out.en = en;
  if (ru) out.ru = ru;
  return out;
}

function sanitizeItem(value: unknown): StatusCardItem | null {
  const obj = (value ?? {}) as Record<string, unknown>;
  const label = sanitizeLocalized(obj.label, true);
  if (!label) return null;
  const itemValue = sanitizeLocalized(obj.value, false);
  const rawUrl = str(obj.url);
  const url = rawUrl ? safeHttpsUrl(rawUrl) : null;
  if (rawUrl && !url) return null;
  return {
    id: str(obj.id) || randomUUID(),
    label,
    value: itemValue && itemValue.ka ? itemValue : null,
    status: isStatusKind(obj.status) ? obj.status : "none",
    url,
  };
}

function sanitizeCard(value: unknown): StatusCard | null {
  const obj = (value ?? {}) as Record<string, unknown>;
  const label = sanitizeLocalized(obj.label, true);
  if (!label) return null;
  const items = Array.isArray(obj.items)
    ? obj.items
        .slice(0, MAX_ITEMS_PER_CARD)
        .map(sanitizeItem)
        .filter((it): it is StatusCardItem => it !== null)
    : [];
  const subValue = sanitizeLocalized(obj.subValue, false);
  return {
    id: str(obj.id) || randomUUID(),
    icon: isStatusIcon(obj.icon) ? obj.icon : "none",
    label,
    value: sanitizeLocalized(obj.value, false) ?? { ka: "" },
    subValue: subValue && subValue.ka ? subValue : null,
    redDot: obj.redDot === true,
    expandable: obj.expandable === true,
    active: obj.active !== false,
    items,
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const value = data?.value as { cards?: unknown } | null;
  const cards = Array.isArray(value?.cards)
    ? (value!.cards as StatusCard[])
    : DEFAULT_STATUS_CARDS;

  return Response.json({ cards });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    cards?: unknown;
  } | null;
  if (!body || !Array.isArray(body.cards)) {
    return Response.json({ error: "cards array required" }, { status: 400 });
  }
  if (body.cards.length > MAX_CARDS) {
    return Response.json(
      { error: `too many cards (max ${MAX_CARDS})` },
      { status: 400 },
    );
  }

  const cards = body.cards
    .map(sanitizeCard)
    .filter((c): c is StatusCard => c !== null);

  if (cards.length === 0 && body.cards.length > 0) {
    return Response.json(
      { error: "every card needs a Georgian label" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);
  const { error } = await db.from("site_settings").upsert(
    {
      key: SETTING_KEY,
      value: { cards },
      updated_at: new Date().toISOString(),
      updated_by: guard.admin.userId,
    },
    { onConflict: "key" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Public pages cache status cards (revalidate = 60/120); bust them now.
  revalidatePath("/", "layout");

  return Response.json({ cards });
}
