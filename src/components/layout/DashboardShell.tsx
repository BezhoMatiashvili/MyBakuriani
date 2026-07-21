"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  leadsClient,
  SELLER_LEADS_CHANGED_EVENT,
  sellerLeadsScopeKey,
  type SellerLeadsChangedDetail,
} from "@/lib/supabase/leads";
import {
  toServiceSegment,
  SEGMENT_TO_ROLE_KEY,
} from "@/lib/dashboard/serviceSegments";
import {
  ActiveOrgScopeProvider,
  useActiveOrgScope,
} from "@/lib/dashboard/orgScope";

const DashboardSidebar = dynamic(() =>
  import("@/components/layout/DashboardSidebar").then(
    (mod) => mod.DashboardSidebar,
  ),
);
const MobileBottomNav = dynamic(() =>
  import("@/components/layout/MobileBottomNav").then(
    (mod) => mod.MobileBottomNav,
  ),
);
const AdminTopbar = dynamic(() =>
  import("@/components/layout/AdminTopbar").then((mod) => mod.AdminTopbar),
);
const AdminSidebar = dynamic(() =>
  import("@/components/layout/AdminSidebar").then((mod) => mod.AdminSidebar),
);
const RenterSidebar = dynamic(() =>
  import("@/components/layout/RenterSidebar").then((mod) => mod.RenterSidebar),
);
const RenterTopbar = dynamic(() =>
  import("@/components/layout/RenterTopbar").then((mod) => mod.RenterTopbar),
);
const SellerSidebar = dynamic(() =>
  import("@/components/layout/SellerSidebar").then((mod) => mod.SellerSidebar),
);
const SellerTopbar = dynamic(() =>
  import("@/components/layout/SellerTopbar").then((mod) => mod.SellerTopbar),
);
const GuestSidebar = dynamic(() =>
  import("@/components/layout/GuestSidebar").then((mod) => mod.GuestSidebar),
);
const GuestTopbar = dynamic(() =>
  import("@/components/layout/GuestTopbar").then((mod) => mod.GuestTopbar),
);
const CleanerSidebar = dynamic(() =>
  import("@/components/layout/CleanerSidebar").then(
    (mod) => mod.CleanerSidebar,
  ),
);
const CleanerTopbar = dynamic(() =>
  import("@/components/layout/CleanerTopbar").then((mod) => mod.CleanerTopbar),
);
const FoodSidebar = dynamic(() =>
  import("@/components/layout/FoodSidebar").then((mod) => mod.FoodSidebar),
);
const FoodTopbar = dynamic(() =>
  import("@/components/layout/FoodTopbar").then((mod) => mod.FoodTopbar),
);
const ServiceSidebar = dynamic(() =>
  import("@/components/layout/ServiceSidebar").then(
    (mod) => mod.ServiceSidebar,
  ),
);
const ServiceTopbar = dynamic(() =>
  import("@/components/layout/ServiceTopbar").then((mod) => mod.ServiceTopbar),
);

/**
 * Fetches the "new" leads count for the seller sidebar badge. Rendered inside
 * ActiveOrgScopeProvider so it can read the active scope: counts the active
 * company's new leads in org mode, the signed-in user's own untagged leads
 * otherwise (personal mode excludes org-linked leads, matching the SalesBoard).
 */
function SellerLeadsCountEffect({
  userId,
  onCount,
}: {
  userId: string;
  onCount: Dispatch<SetStateAction<number>>;
}) {
  const scope = useActiveOrgScope();
  const orgScoped = scope.mode === "org" && !!scope.organizationId;
  const organizationId = orgScoped ? scope.organizationId : null;
  const scopeKey = sellerLeadsScopeKey(userId, organizationId);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let requestVersion = 0;
    let recountTimer: ReturnType<typeof setTimeout> | null = null;

    const recount = async () => {
      const version = ++requestVersion;
      let query = leadsClient(supabase)
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("stage", "new");
      query = organizationId
        ? query.eq("organization_id", organizationId)
        : query.eq("owner_id", userId).is("organization_id", null);

      const res = (await query) as {
        count: number | null;
        error: unknown;
      };
      if (!disposed && version === requestVersion && !res.error) {
        onCount(res.count ?? 0);
      }
    };

    const scheduleRecount = () => {
      if (recountTimer) clearTimeout(recountTimer);
      recountTimer = setTimeout(() => {
        recountTimer = null;
        void recount();
      }, 400);
    };

    const handleLeadsChanged = (event: Event) => {
      const detail = (event as CustomEvent<SellerLeadsChangedDetail>).detail;
      if (
        !detail ||
        detail.scopeKey !== scopeKey ||
        !Number.isFinite(detail.newLeadDelta)
      ) {
        return;
      }

      // Invalidate an initial recount that began before this mutation, since
      // that response may describe the pre-mutation state.
      requestVersion += 1;
      onCount((current) => Math.max(0, current + detail.newLeadDelta));
      scheduleRecount();
    };

    // Do not display a count from the previously selected organization while
    // the authoritative count for this scope is loading.
    onCount(0);
    void recount();
    window.addEventListener(SELLER_LEADS_CHANGED_EVENT, handleLeadsChanged);

    return () => {
      disposed = true;
      requestVersion += 1;
      if (recountTimer) clearTimeout(recountTimer);
      window.removeEventListener(
        SELLER_LEADS_CHANGED_EVENT,
        handleLeadsChanged,
      );
    };
  }, [userId, organizationId, scopeKey, onCount]);

  return null;
}

interface DashboardShellProps {
  userId: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  initialNotificationCount: number;
  balance: number;
  smsRemaining: number;
  smartMatchCount: number;
  availableCabinets: string[];
  /** Cleaner availability toggle initial state (defaults to the DB default). */
  cleanerOnline?: boolean;
  /** Approved organizations the user belongs to (seller company nav). */
  companies?: { id: string; name: string; role: string; status: string }[];
  children: React.ReactNode;
}

export function DashboardShell({
  userId,
  displayName,
  role,
  avatarUrl,
  initialNotificationCount,
  balance,
  smsRemaining,
  smartMatchCount: initialSmartMatchCount,
  availableCabinets,
  cleanerOnline = true,
  companies = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [notificationCount, setNotificationCount] = useState(
    initialNotificationCount,
  );
  const [smartMatchCount, setSmartMatchCount] = useState(
    initialSmartMatchCount,
  );
  const [leadsCount, setLeadsCount] = useState(0);
  const [verificationCount, setVerificationCount] = useState(0);
  const [cleanerAvailable, setCleanerAvailable] = useState(cleanerOnline);
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCleanerAvailableChange(v: boolean) {
    setCleanerAvailable(v);
    const supabase = createClient();
    const { error } = await supabase.from("cleaner_profiles").upsert({
      id: userId,
      is_online: v,
      updated_at: new Date().toISOString(),
    });
    if (error) setCleanerAvailable(!v);
  }

  useEffect(() => {
    const supabase = createClient();

    // Authoritative, debounced recount of the user's unread notifications. This
    // is the source of truth for both the sidebar badge and the Smart Match
    // badge so neither can drift (e.g. show N after the inbox has been opened
    // and cleared).
    const recountUnread = () => {
      if (recountTimer.current) clearTimeout(recountTimer.current);
      recountTimer.current = setTimeout(() => {
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false)
          .then((res: { count: number | null; error: unknown }) => {
            if (!res.error) setNotificationCount(res.count ?? 0);
          });
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "smart_match_request")
          .eq("is_read", false)
          .then((res: { count: number | null; error: unknown }) => {
            if (!res.error) setSmartMatchCount(res.count ?? 0);
          });
      }, 400);
    };

    const channel = supabase
      .channel("dashboard-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotificationCount((p) => p + 1);
          if (
            (payload.new as { type?: string } | null)?.type ===
            "smart_match_request"
          ) {
            setSmartMatchCount((p) => p + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Mark-as-read (or any update) → reconcile both badges with DB truth.
          recountUnread();
        },
      )
      .subscribe();
    return () => {
      if (recountTimer.current) clearTimeout(recountTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Real pending-verifications count for the admin sidebar badge; refetched on
  // navigation. The route caches privately for 30s, so the badge may lag an
  // approve/reject by up to 30s — accepted tradeoff vs hitting the API on
  // every navigation.
  useEffect(() => {
    if (role !== "admin") return;
    fetch("/api/admin/listings/pending/count")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { count?: number } | null) => {
        if (payload && typeof payload.count === "number") {
          setVerificationCount(payload.count);
        }
      })
      .catch(() => {});
  }, [role, pathname]);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  const cabinetFromPath = (() => {
    const seg = pathname?.split("/").filter(Boolean) ?? [];
    const dashIdx = seg.indexOf("dashboard");
    const cabinet = dashIdx >= 0 && seg[dashIdx + 1] ? seg[dashIdx + 1] : null;
    // /dashboard/sms is the renter cabinet's SMS Center — always show the renter
    // sidebar (the link only exists there and the page is renter-gated), so
    // multi-cabinet users don't get bounced to their primary-role sidebar.
    return cabinet === "sms" ? "renter" : cabinet;
  })();
  const activeRole = cabinetFromPath ?? role;

  const isAdmin = activeRole === "admin";
  const isRenter = activeRole === "renter";
  const isSeller = activeRole === "seller";
  const isGuest = activeRole === "guest";
  const isCleaner = activeRole === "cleaner";
  const isFood = activeRole === "food";
  // Non-null for any of the four split service cabinets (and the legacy
  // "service"/"handyman" aliases); drives the ServiceSidebar/Topbar branch.
  const serviceSegment = toServiceSegment(activeRole);
  const shortUserId = `MB-${userId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

  if (isAdmin) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#02060E]">
        <AdminSidebar
          verificationAlerts={verificationCount}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F8FAFC]">
          <AdminTopbar
            userName={displayName}
            notificationCount={notificationCount}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto p-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-8 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8 xl:p-10">
            {children}
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole="admin" />
      </div>
    );
  }

  if (isRenter) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <RenterSidebar
          userName={displayName}
          userId={shortUserId}
          avatarUrl={avatarUrl ?? undefined}
          isVerified
          notificationCount={notificationCount}
          pendingReviewsAlert={false}
          smartMatchCount={smartMatchCount}
          currentPath={pathname}
          onSignOut={handleSignOut}
          availableCabinets={availableCabinets}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <RenterTopbar balance={balance} smsRemaining={smsRemaining} />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (isSeller) {
    return (
      <ActiveOrgScopeProvider companies={companies}>
        <SellerLeadsCountEffect userId={userId} onCount={setLeadsCount} />
        <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
          <SellerSidebar
            userName={displayName}
            avatarUrl={avatarUrl ?? undefined}
            isVerified
            leadsCount={leadsCount}
            notificationCount={notificationCount}
            currentPath={pathname}
            onSignOut={handleSignOut}
            availableCabinets={availableCabinets}
            companies={companies}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SellerTopbar balance={balance} smsRemaining={smsRemaining} />
            <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
              <div className="w-full px-5 py-8 sm:px-10 sm:py-10">
                {children}
              </div>
            </main>
          </div>
          <MobileBottomNav currentPath={pathname} userRole={activeRole} />
        </div>
      </ActiveOrgScopeProvider>
    );
  }

  if (isGuest) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <GuestSidebar
          userName={displayName}
          avatarUrl={avatarUrl ?? undefined}
          isVerified
          currentPath={pathname}
          onSignOut={handleSignOut}
          availableCabinets={availableCabinets}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <GuestTopbar notificationCount={notificationCount} />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (isCleaner) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <CleanerSidebar
          userName={displayName}
          userId={userId}
          avatarUrl={avatarUrl ?? undefined}
          currentPath={pathname}
          onSignOut={handleSignOut}
          availableCabinets={availableCabinets}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CleanerTopbar
            notificationCount={notificationCount}
            available={cleanerAvailable}
            onAvailableChange={handleCleanerAvailableChange}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (isFood) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <FoodSidebar
          restaurantName={displayName}
          currentPath={pathname}
          notificationCount={notificationCount}
          onSignOut={handleSignOut}
          availableCabinets={availableCabinets}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <FoodTopbar balance={balance} smsRemaining={smsRemaining} />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (serviceSegment) {
    const serviceBasePath = `/dashboard/${serviceSegment}`;
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <ServiceSidebar
          userName={displayName}
          avatarUrl={avatarUrl ?? undefined}
          isVerified
          currentPath={pathname}
          notificationCount={notificationCount}
          onSignOut={handleSignOut}
          availableCabinets={availableCabinets}
          basePath={serviceBasePath}
          cabinetKey={serviceSegment}
          roleKey={SEGMENT_TO_ROLE_KEY[serviceSegment]}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ServiceTopbar
            balance={balance}
            smsRemaining={smsRemaining}
            basePath={serviceBasePath}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]/60">
      <DashboardSidebar
        userName={displayName}
        userRole={activeRole}
        avatarUrl={avatarUrl ?? undefined}
        smsCount={notificationCount}
        currentPath={pathname}
      />
      <div className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
      <MobileBottomNav currentPath={pathname} userRole={activeRole} />
    </div>
  );
}
