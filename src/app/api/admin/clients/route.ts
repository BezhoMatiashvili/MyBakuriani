import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { tbilisiDateOf } from "@/lib/admin-statuses";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const VIP_RANK: Record<string, number> = { vip: 1, super: 2 };
const COMPANY_RANK: Record<string, number> = { none: 1, expired: 2, active: 3 };

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

// Clients directory for the admin dashboard: profiles + balance in a single
// RPC, plus the facts its filters read (src/lib/admin-clients-filter.ts): the
// membership state, best active VIP tier and company plan state from the C44
// views, and the last sign-in and sign-in methods from auth.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  try {
    const [clients, memberships, promotions, companies, users] =
      await Promise.all([
        db.rpc("admin_clients_with_stats"),
        allRows((from, to) =>
          db
            .from("admin_membership_overview_v")
            .select("user_id, state")
            .order("user_id")
            .range(from, to),
        ),
        allRows((from, to) =>
          db
            .from("admin_listing_promotions_v")
            .select("owner_id, vip_tier")
            .not("vip_tier", "is", null)
            .order("kind")
            .order("id")
            .range(from, to),
        ),
        allRows((from, to) =>
          db
            .from("admin_company_plans_v")
            .select("owner_id, state")
            .order("organization_id")
            .range(from, to),
        ),
        allAuthUsers(db),
      ]);
    if (clients.error) throw new Error(clients.error.message);

    const membershipBy = new Map(
      memberships.map((row) => [row.user_id, row.state]),
    );
    const vipBy = bestBy(promotions, (row) => row.vip_tier, VIP_RANK);
    const companyBy = bestBy(companies, (row) => row.state, COMPANY_RANK);
    const userBy = new Map(users.map((user) => [user.id, user]));

    const profiles = (clients.data ?? []) as Array<
      Record<string, unknown> & { id: string; created_at: string | null }
    >;
    return Response.json({
      clients: profiles.map((profile) => {
        const user = userBy.get(profile.id);
        return {
          ...profile,
          registered_on: profile.created_at
            ? tbilisiDateOf(profile.created_at)
            : null,
          last_sign_in_at: user?.last_sign_in_at ?? null,
          sign_in_methods: signInMethods(user),
          membership_state: membershipBy.get(profile.id) ?? null,
          vip_tier: vipBy.get(profile.id) ?? null,
          company_state: companyBy.get(profile.id) ?? null,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Every row of a view, 1000 per request (PostgREST caps a response). */
async function allRows<T>(page: (from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function allAuthUsers(db: ReturnType<typeof createServiceClient>) {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) return users;
  }
}

/** The highest-ranked value per owner (a user may own several rows). */
function bestBy<T extends { owner_id: string | null }>(
  rows: T[],
  value: (row: T) => string | null,
  rank: Record<string, number>,
) {
  const best = new Map<string, string>();
  for (const row of rows) {
    const next = value(row);
    if (!row.owner_id || !next) continue;
    const current = best.get(row.owner_id);
    if (!current || (rank[next] ?? 0) > (rank[current] ?? 0)) {
      best.set(row.owner_id, next);
    }
  }
  return best;
}

/** How the user can sign in: their identities, plus a confirmed phone (C48). */
function signInMethods(user: User | undefined): string[] {
  if (!user) return [];
  const methods = new Set<string>(
    (user.identities ?? []).map((identity) => identity.provider),
  );
  const providers: unknown = user.app_metadata?.providers;
  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (typeof provider === "string") methods.add(provider);
    }
  }
  if (user.phone && user.phone_confirmed_at) methods.add("phone");
  return [...methods];
}
