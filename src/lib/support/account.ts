import "server-only";
import { createClient } from "@/lib/supabase/server";
import { deriveMembershipState } from "@/lib/membership/plans";
import { deriveAvailableCabinets } from "@/lib/cabinets";
import { withTimeout } from "@/lib/with-timeout";
import { OWNER_VERIFICATION_COLUMNS } from "@/lib/ownership/types";

// The signed-in user's own situation, for answers to "why can't I / where is
// my" questions (C43). Read with the user's own session (RLS: only their own
// rows), only statuses, counts and dates: never a title, a name, a number or a
// balance. Loaded only for such questions, never cached, never logged. A
// table that is missing or slow just leaves its line out.

const TIMEOUT_MS = 1_200;
const LIVE_CLEANING = [
  "pending",
  "accepted",
  "cancellation_requested",
  "in_progress",
];

type Rows<T> = { data: T[] | null };

// In read order, for the log line naming a read that failed.
const READS = [
  "profiles",
  "properties",
  "services",
  "user_subscriptions",
  "content_change_requests",
  "ownership_verifications",
  "smart_match_requests",
  "payments",
  "cleaning_tasks",
] as const;

function counts<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) + 1);
  return map;
}

function statusLine(map: Map<string, number>, labels: Record<string, string>) {
  return Object.entries(labels)
    .map(([status, label]) => `${map.get(status) ?? 0} ${label}`)
    .join(", ");
}

const LISTING_STATUS = {
  active: "published",
  pending: "waiting for admin approval",
  draft: "draft",
  blocked: "blocked by an admin",
};

export async function loadAccountFacts(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - 24 * 60 * 60_000).toISOString();

  const reads = Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("properties")
      .select("is_for_sale, status")
      .eq("owner_id", userId),
    supabase.from("services").select("category, status").eq("owner_id", userId),
    supabase
      .from("user_subscriptions")
      .select("starts_at, expires_at, status")
      .eq("user_id", userId)
      .in("status", ["active", "pending_approval"]),
    supabase
      .from("content_change_requests")
      .select("status")
      .eq("requester_id", userId)
      .eq("status", "pending"),
    supabase
      .from("ownership_verifications")
      // C39: the owner-readable column list; only status is used below.
      .select(OWNER_VERIFICATION_COLUMNS)
      .eq("owner_id", userId),
    supabase
      .from("smart_match_requests")
      .select("status")
      .eq("guest_id", userId)
      .eq("status", "active")
      .or(`check_out.is.null,check_out.gte.${today}`),
    supabase
      .from("payments")
      .select("status")
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("cleaning_tasks")
      .select("status, owner_id, cleaner_id")
      .or(`owner_id.eq.${userId},cleaner_id.eq.${userId}`)
      .in("status", LIVE_CLEANING),
  ]);
  const result = await withTimeout(reads, TIMEOUT_MS, null);
  if (!result) return null;
  // Which read failed and how, never what it returned: a dropped line is
  // otherwise invisible.
  result.forEach((read, index) => {
    if (read.error)
      console.warn(
        `[support] account read failed ${JSON.stringify({ table: READS[index], code: read.error.code })}`,
      );
  });
  const [
    profile,
    properties,
    services,
    memberships,
    changes,
    ownership,
    smartMatch,
    payments,
    cleaning,
  ] = result;

  const props =
    (properties as Rows<{ is_for_sale: boolean | null; status: string | null }>)
      .data ?? [];
  const servs =
    (services as Rows<{ category: string; status: string | null }>).data ?? [];
  const tasks =
    (cleaning as Rows<{ status: string; owner_id: string; cleaner_id: string }>)
      .data ?? [];
  const lines: string[] = [];

  const cabinets = deriveAvailableCabinets({
    role: (profile.data as { role?: string } | null)?.role,
    isForSaleFlags: props.map((row) => row.is_for_sale === true),
    serviceCategories: servs.map((row) => row.category),
    hasCleaningTasks: tasks.some((task) => task.cleaner_id === userId),
  });
  lines.push(`- Cabinets: ${cabinets.join(", ")}.`);

  const rentals = props.filter((row) => row.is_for_sale !== true);
  // Only when the membership table answered (it is not on every project).
  if (
    !memberships.error &&
    ((memberships.data ?? []).length > 0 || rentals.length > 0)
  ) {
    const state = deriveMembershipState(
      (memberships.data ?? []) as {
        starts_at: string;
        expires_at: string;
        status: string;
      }[],
      now,
    );
    const day = (iso: string) => iso.slice(0, 10);
    const parts: string[] = [];
    if (state.activeUntil) parts.push(`active until ${day(state.activeUntil)}`);
    if (state.pending)
      parts.push(
        `a paid request for ${day(state.pending.startsAt)} to ${day(state.pending.expiresAt)} is waiting for admin approval`,
      );
    if (state.upcoming)
      parts.push(`an approved season starts ${day(state.upcoming.startsAt)}`);
    if (parts.length === 0)
      parts.push(
        "none active (rentals are hidden from the site and a new rental cannot be published until one is active)",
      );
    lines.push(`- Rental membership: ${parts.join("; ")}.`);
  }
  if (rentals.length > 0) {
    lines.push(
      `- Own rentals (hotels included): ${statusLine(
        counts(rentals, (row) => row.status ?? "draft"),
        LISTING_STATUS,
      )}.`,
    );
  }
  const sales = props.filter((row) => row.is_for_sale === true);
  if (sales.length > 0) {
    lines.push(
      `- Own sale listings: ${statusLine(
        counts(sales, (row) => row.status ?? "draft"),
        LISTING_STATUS,
      )}.`,
    );
  }
  if (servs.length > 0) {
    lines.push(
      `- Own service listings: ${statusLine(
        counts(servs, (row) => row.status ?? "draft"),
        LISTING_STATUS,
      )}.`,
    );
  }
  if ((changes.data ?? []).length > 0) {
    lines.push(
      `- Edits of published listings waiting for admin review: ${(changes.data ?? []).length}.`,
    );
  }
  const verifications = (ownership.data ?? []) as { status: string }[];
  if (verifications.length > 0) {
    lines.push(
      `- Ownership verification requests: ${statusLine(
        counts(verifications, (row) => row.status),
        {
          pending: "pending",
          approved: "approved",
          rejected: "rejected",
          revoked: "revoked",
        },
      )}.`,
    );
  }
  const requests = (smartMatch.data ?? []).length;
  if (requests > 0)
    lines.push(`- Open Smart Match requests: ${requests} (max 5 open).`);
  const recentPayments = (payments.data ?? []) as { status: string }[];
  if (recentPayments.length > 0) {
    lines.push(
      `- Card payments in the last 24 hours: ${statusLine(
        counts(recentPayments, (row) => row.status),
        {
          pending:
            "still being confirmed by Keepz (the balance updates within about 10 minutes of a successful payment)",
          succeeded: "succeeded",
          declined: "declined",
          cancelled: "cancelled",
          expired: "expired",
        },
      )}.`,
    );
  }
  const asOwner = tasks.filter((task) => task.owner_id === userId);
  const asCleaner = tasks.filter((task) => task.cleaner_id === userId);
  const taskLabels = {
    pending: "waiting for the cleaner's answer",
    accepted: "accepted",
    cancellation_requested: "cancellation requested",
    in_progress: "in progress",
  };
  if (asOwner.length > 0)
    lines.push(
      `- Cleaning call-outs the user ordered: ${statusLine(
        counts(asOwner, (task) => task.status),
        taskLabels,
      )}.`,
    );
  if (asCleaner.length > 0)
    lines.push(
      `- Call-outs to the user as a cleaner: ${statusLine(
        counts(asCleaner, (task) => task.status),
        { ...taskLabels, pending: "new, waiting for their answer" },
      )}.`,
    );

  return `YOUR ACCOUNT (this user's own data, read just now; base "why" answers on it):\n${lines.join("\n")}`;
}
