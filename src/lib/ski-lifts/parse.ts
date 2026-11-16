// Pure reader for MTA's live lift feed, plus the overlay that turns it into the
// landing "lifts" status card. Kept ALIAS-FREE (no `@/` runtime imports; the
// type-only import below is erased) so scripts/unit/ski-lifts-parse.test.mjs
// and scripts/check-ski-lifts.mjs run it under node with type stripping. The
// fetch half is src/lib/ski-lifts/server.ts.
//
// Source (2026-11-14): MTA's public site mta.ski. Its resort page polls
// GET /api/operations-inventory?slug=<resort>&locale=<ka|en> every 30 s and
// gets { state, areas: [{ area, state, liftsTotal, trailsTotal }], assets:
// [{ assetId, name, type: "lift" | "trail", effectiveStatus, reason,
// lastVerifiedAt, operatingFrom, operatingTo, ... }], generatedAt }. The
// endpoint is undocumented and needs no key. MTA works out effectiveStatus
// itself, so there is no open/closed rule to replay here (the old
// status.mta.ski pages needed one; that host no longer resolves). The checks
// below copy MTA's own client: whatever it would refuse to show, we refuse
// too, and the admin-editable card shows instead.

import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
  StatusKind,
} from "../status-cards/types";

export const MTA_INVENTORY_URL =
  "https://mta.ski/api/operations-inventory?slug=bakuriani&locale=ka";
// Courtesy: identify the app so the operator can see who is reading.
export const MTA_USER_AGENT =
  "MyBakuriani/1.0 (+https://mybakuriani.ge; lift status card)";
// When MTA's backend last read its operations source.
export const MTA_FETCHED_AT_HEADER = "x-mta-operations-fetched-at";

export const OPERATION_STATUSES = [
  "OPEN",
  "CLOSED",
  "DISRUPTED",
  "PENDING_CONFIRMATION",
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export type LiftStatus = {
  id: string;
  nameKa: string;
  nameEn: string;
  status: OperationStatus;
};

export type LiftsSummary = {
  lifts: LiftStatus[];
  openCount: number;
  total: number;
  // Newest lastVerifiedAt among the lifts, as toISOString(), or null.
  verifiedAt: string | null;
};

// MTA's own freshness rule (operationalResponseFresh in its bundle): the
// answer is usable only if the fetched-at time is at most 75 s old (60 s in
// the future, for clock skew) and any cache Age is 0..75 s.
const FRESH_MAX_AGE_SECONDS = 75;
const FRESH_MAX_SKEW_MS = 60_000;

export function inventoryResponseFresh(
  fetchedAt: string | null,
  age: string | null,
  now: number = Date.now(),
): boolean {
  const at = Date.parse(fetchedAt ?? "");
  const ageSeconds = Number(age ?? 0);
  return (
    Number.isFinite(at) &&
    Number.isFinite(ageSeconds) &&
    ageSeconds >= 0 &&
    ageSeconds <= FRESH_MAX_AGE_SECONDS &&
    now - at <= FRESH_MAX_AGE_SECONDS * 1000 &&
    at - now <= FRESH_MAX_SKEW_MS
  );
}

// MTA sends one Latin, upper-case name per lift in every locale. These are
// the Georgian names MTA itself published, on the old status.mta.ski /ka/
// Didveli page (archived 2025-12-31), keyed by the feed's asset id. A lift
// without one shows MTA's name.
const LIFT_NAMES_KA: Readonly<Record<string, string>> = {
  "c583938f-26fc-48a4-821b-07c0c24956c5": "სლალომი", // SLALOM
  "e940de13-a228-4463-86de-498b7dfad273": "ნოდო", // NODO
  "386bc251-9144-42db-bf31-91d8662ebe53": "დეკა", // DEKA
  "4d8db4cf-fc15-4d2a-b799-2e3f42320638": "ჰალფ პაიპი", // HALF PIPE
  "daa1eee5-a36b-4726-b287-ed2e449b9821": "სკი კროსი", // SKI CROSS
  "4b292330-626f-4284-9a0a-8ad89af92259": "პანორამა", // PANORAMA
};

// "KOKHTA-PLATO" -> "Kokhta-Plato". Only all-caps Latin is recased; any other
// name is shown as sent (upper-casing Georgian would turn it into Mtavruli).
export function liftDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!/^[A-Z0-9 .'-]+$/.test(trimmed)) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(
      /(^|[ -])([a-z])/g,
      (_, sep: string, letter: string) => sep + letter.toUpperCase(),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperationStatus(value: unknown): value is OperationStatus {
  return OPERATION_STATUSES.includes(value as OperationStatus);
}

export type InventoryReading =
  { ok: true; summary: LiftsSummary } | { ok: false; reason: string };

// Reads one feed answer. All or nothing, like MTA's client: one malformed
// asset (any type), a duplicate id or an unknown status rejects the whole
// answer, so a format change shows the admin card, never a shrunken or wrong
// "N/M ღია". `reason` is for scripts/check-ski-lifts.mjs.
export function readInventory(body: unknown): InventoryReading {
  const fail = (reason: string): InventoryReading => ({ ok: false, reason });
  if (!isRecord(body)) return fail("answer is not an object");
  if (body.state !== "ready") return fail(`state is ${String(body.state)}`);
  const { areas, assets } = body;
  if (!Array.isArray(areas) || areas.length === 0) return fail("no areas");
  if (!Array.isArray(assets)) return fail("no assets");

  let liftsTotal = 0;
  for (const area of areas) {
    if (!isRecord(area) || area.state !== "ready") {
      return fail("an area is not ready");
    }
    if (typeof area.liftsTotal !== "number") return fail("no liftsTotal");
    liftsTotal += area.liftsTotal;
  }

  const seen = new Set<string>();
  const lifts: LiftStatus[] = [];
  let verifiedMs: number | null = null;
  for (const asset of assets) {
    if (!isRecord(asset)) return fail("an asset is not an object");
    const { assetId, name, effectiveStatus } = asset;
    if (typeof assetId !== "string" || !assetId)
      return fail("an asset has no id");
    if (seen.has(assetId)) return fail(`duplicate asset ${assetId}`);
    seen.add(assetId);
    if (typeof name !== "string" || !name.trim()) {
      return fail(`asset ${assetId} has no name`);
    }
    if (!isOperationStatus(effectiveStatus)) {
      return fail(`asset ${assetId} has status ${String(effectiveStatus)}`);
    }
    if (asset.type !== "lift") continue;

    const verified =
      typeof asset.lastVerifiedAt === "string"
        ? Date.parse(asset.lastVerifiedAt)
        : NaN;
    if (
      Number.isFinite(verified) &&
      (verifiedMs === null || verified > verifiedMs)
    ) {
      verifiedMs = verified;
    }
    lifts.push({
      id: assetId,
      nameKa: LIFT_NAMES_KA[assetId] ?? liftDisplayName(name),
      nameEn: liftDisplayName(name),
      status: effectiveStatus,
    });
  }

  if (lifts.length === 0) return fail("no lifts");
  if (lifts.length !== liftsTotal) {
    return fail(`${lifts.length} lifts listed, liftsTotal says ${liftsTotal}`);
  }
  // MTA shows no open count while every lift awaits confirmation.
  if (lifts.every((lift) => lift.status === "PENDING_CONFIRMATION")) {
    return fail("every lift is PENDING_CONFIRMATION");
  }
  return {
    ok: true,
    summary: {
      lifts,
      // Only OPEN counts as open, as on MTA's own page.
      openCount: lifts.filter((lift) => lift.status === "OPEN").length,
      total: lifts.length,
      // Normalized: MTA sends 7 fractional digits, and the card's date
      // formatter also runs in the browser.
      verifiedAt:
        verifiedMs === null ? null : new Date(verifiedMs).toISOString(),
    },
  };
}

export function parseInventory(body: unknown): LiftsSummary | null {
  const reading = readInventory(body);
  return reading.ok ? reading.summary : null;
}

export const LIFTS_CARD_ID = "lifts";

// "ღია" / "დაკეტილი" are the admin dropdown's words (status-cards/lifts.ts);
// the other two are MTA's own ka/en wording from its status badge.
const LIFT_STATUS_VIEW: Record<
  OperationStatus,
  { status: StatusKind; text: LocalizedText }
> = {
  OPEN: { status: "ok", text: { ka: "ღია", en: "Open", ru: "Открыт" } },
  CLOSED: {
    status: "closed",
    text: { ka: "დაკეტილი", en: "Closed", ru: "Закрыт" },
  },
  DISRUPTED: {
    status: "warn",
    text: { ka: "შეფერხებულია", en: "Disrupted", ru: "С перебоями" },
  },
  PENDING_CONFIRMATION: {
    status: "none",
    text: { ka: "დაუდასტურებელია", en: "Unconfirmed", ru: "Не подтверждён" },
  },
};

// The collapsed card's preview: the first two open lifts, else the first two.
function buildSubtitle(summary: LiftsSummary): LocalizedText {
  const open = summary.lifts.filter((lift) => lift.status === "OPEN");
  const source = open.length > 0 ? open : summary.lifts;
  const pick = (key: "nameKa" | "nameEn") => {
    const names = source.map((lift) => lift[key]);
    const shown = names.slice(0, 2).join(", ");
    return names.length > 2 ? `${shown}…` : shown;
  };
  return { ka: pick("nameKa"), en: pick("nameEn"), ru: pick("nameEn") };
}

// Lays the live lifts over the admin's lifts card: count, preview, one row per
// lift, and the date MTA last verified a lift (the card face prints it in
// place of the admin's date). The card's presence, label, icon and redDot stay
// the admin's. No summary (feed down, stale or unreadable): cards unchanged.
export function withLiveLifts(
  cards: StatusCard[],
  summary: LiftsSummary | null,
): StatusCard[] {
  if (!summary) return cards;
  const count = `${summary.openCount}/${summary.total}`;
  const items = summary.lifts.map((lift): StatusCardItem => ({
    id: `lift-${lift.id}`,
    label: { ka: lift.nameKa, en: lift.nameEn, ru: lift.nameEn },
    value: LIFT_STATUS_VIEW[lift.status].text,
    status: LIFT_STATUS_VIEW[lift.status].status,
    url: null,
  }));
  return cards.map((card) =>
    card.id === LIFTS_CARD_ID
      ? {
          ...card,
          value: {
            ka: `${count} ღია`,
            en: `${count} open`,
            ru: `${count} открыты`,
          },
          subValue: buildSubtitle(summary),
          expandable: true,
          items,
          updatedAt: summary.verifiedAt,
        }
      : card,
  );
}
