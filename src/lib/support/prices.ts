import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { formatGelAmount } from "@/lib/utils/pricing";

// The live price list for the support assistant's facts (C43), read the same
// way the public /pricing page reads it (enabled pricing_packages, anon
// client). Kept 10 minutes in memory; a failure falls back to pointing at the
// price list instead of guessing.

type PackageRow = {
  code: string;
  category: string;
  name: string;
  amount_gel: number;
  meta: Record<string, unknown> | null;
};

const TTL_MS = 10 * 60_000;
const FALLBACK =
  'PRICES: not available right now. Do not state any amount: point to the public price list /pricing and to the package cards on "ბალანსი და VIP".';

let memo: { at: number; text: string } | null = null;

const metaOf = (row: PackageRow) => row.meta ?? {};
const gel = (row: PackageRow) => formatGelAmount(Number(row.amount_gel));
const quoted = (text: string) => `"${text.replace(/\s+/g, " ").trim()}"`;

function formatPrices(rows: PackageRow[]): string {
  const lines: string[] = [];

  const membership = (season: string, tier: string) =>
    rows.find(
      (row) =>
        row.category === "subscription" &&
        metaOf(row).subscription_scope === "renter" &&
        metaOf(row).season === season &&
        metaOf(row).price_tier === tier,
    );
  for (const [season, label] of [
    ["winter", "winter season (November-March)"],
    ["summer", "summer season (April-October)"],
  ] as const) {
    const standard = membership(season, "standard");
    const fbGroup = membership(season, "fb_group_vip");
    if (!standard && !fbGroup) continue;
    const parts = [
      standard ? `${gel(standard)} for everyone` : "",
      fbGroup
        ? `${gel(fbGroup)} for VIP members of the site's Facebook group (the admin checks this before activating)`
        : "",
    ].filter(Boolean);
    lines.push(`- Seasonal rental membership, ${label}: ${parts.join("; ")}.`);
  }

  for (const [tier, label] of [
    ["super", "SUPER VIP"],
    ["standard", "VIP"],
    ["discount", "Discount badge"],
  ] as const) {
    const row = rows.find(
      (candidate) =>
        candidate.category === "vip" && metaOf(candidate).tier === tier,
    );
    if (!row) continue;
    const hours = Number(metaOf(row).duration_hours ?? 24);
    lines.push(
      `- ${label} (package card ${quoted(row.name)}): ${gel(row)} per listing for ${hours} hours.`,
    );
  }

  for (const row of rows.filter((candidate) => candidate.category === "sms")) {
    const count = Number(metaOf(row).sms_count);
    lines.push(
      `- SMS package ${quoted(row.name)}${Number.isFinite(count) && count > 0 ? ` (${count} SMS)` : ""}: ${gel(row)}.`,
    );
  }

  for (const row of rows.filter(
    (candidate) =>
      candidate.category === "subscription" &&
      metaOf(candidate).subscription_scope === "organization",
  )) {
    const limit = Number(metaOf(row).listing_limit);
    lines.push(
      `- Company (developer) plan ${quoted(row.name)}${Number.isFinite(limit) && limit > 0 ? ` (up to ${limit} listings)` : ""}: ${gel(row)}.`,
    );
  }

  if (lines.length === 0) return FALLBACK;
  return `PRICES (the live price list, as on /pricing and the "ბალანსი და VIP" package cards; quote amounts exactly as written here and never any other amount):\n${lines.join("\n")}`;
}

export async function loadPriceFacts(): Promise<string> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.text;
  try {
    const { data, error } = await createPublicClient()
      .from("pricing_packages")
      .select("code, category, name, amount_gel, meta")
      .eq("is_enabled", true)
      .in("category", ["vip", "sms", "subscription"])
      .order("sort_order", { ascending: true });
    if (error || !data) return FALLBACK;
    const text = formatPrices(data as PackageRow[]);
    memo = { at: Date.now(), text };
    return text;
  } catch {
    return FALLBACK;
  }
}
