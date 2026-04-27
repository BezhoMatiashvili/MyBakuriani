"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { leadsClient } from "@/lib/supabase/leads";

const SMS_PLAN_TOTAL = 100;
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

interface DashboardShellProps {
  userId: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  initialNotificationCount: number;
  balance: number;
  smsRemaining: number;
  smartMatchCount: number;
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
  smartMatchCount,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [notificationCount, setNotificationCount] = useState(
    initialNotificationCount,
  );
  const [leadsCount, setLeadsCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
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
        () => setNotificationCount((p) => p + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (role !== "seller") return;
    const supabase = createClient();
    leadsClient(supabase)
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("stage", "new")
      .then((res: { count: number | null; error: unknown }) => {
        if (!res.error) setLeadsCount(res.count ?? 0);
      });
  }, [role, userId]);

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
    return dashIdx >= 0 && seg[dashIdx + 1] ? seg[dashIdx + 1] : null;
  })();
  const activeRole = cabinetFromPath ?? role;

  const isAdmin = activeRole === "admin";
  const isRenter = activeRole === "renter";
  const isSeller = activeRole === "seller";
  const isGuest = activeRole === "guest";
  const isCleaner = activeRole === "cleaner";
  const isFood = activeRole === "food";
  const isService =
    activeRole === "entertainment" ||
    activeRole === "transport" ||
    activeRole === "employment" ||
    activeRole === "handyman" ||
    activeRole === "service";
  const shortUserId = `MB-${userId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

  if (isAdmin) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#02060E]">
        <AdminSidebar verificationAlerts={3} onSignOut={handleSignOut} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F8FAFC]">
          <AdminTopbar userName={displayName} />
          <main className="h-0 w-full flex-1 overflow-y-auto p-5 sm:p-8 xl:p-10">
            {children}
          </main>
        </div>
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
          qrAlert
          smartMatchCount={smartMatchCount}
          currentPath={pathname}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <RenterTopbar
            balance={balance}
            smsRemaining={smsRemaining}
            smsTotal={SMS_PLAN_TOTAL}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (isSeller) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <SellerSidebar
          userName={displayName}
          avatarUrl={avatarUrl ?? undefined}
          isVerified
          leadsCount={leadsCount}
          notificationCount={notificationCount}
          currentPath={pathname}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SellerTopbar
            balance={balance}
            smsRemaining={smsRemaining}
            smsTotal={SMS_PLAN_TOTAL}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
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
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <GuestTopbar notificationCount={notificationCount} />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
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
          avatarUrl={avatarUrl ?? undefined}
          currentPath={pathname}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CleanerTopbar notificationCount={notificationCount} available />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
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
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <FoodTopbar
            balance={balance}
            smsRemaining={smsRemaining}
            smsTotal={SMS_PLAN_TOTAL}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="w-full px-5 py-8 sm:px-10 sm:py-10">{children}</div>
          </main>
        </div>
        <MobileBottomNav currentPath={pathname} userRole={activeRole} />
      </div>
    );
  }

  if (isService) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
        <ServiceSidebar
          userName={displayName}
          avatarUrl={avatarUrl ?? undefined}
          isVerified
          currentPath={pathname}
          notificationCount={notificationCount}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ServiceTopbar
            balance={balance}
            smsRemaining={smsRemaining}
            smsTotal={SMS_PLAN_TOTAL}
          />
          <main className="h-0 w-full flex-1 overflow-y-auto pb-20 md:pb-0">
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
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
      <MobileBottomNav currentPath={pathname} userRole={activeRole} />
    </div>
  );
}
