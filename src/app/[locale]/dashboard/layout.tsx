"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AdminTopbar } from "@/components/layout/AdminTopbar";
import { AdminSidebar } from "@/components/layout/AdminSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const [profile, setProfile] = useState<{
    display_name: string;
    role: string;
    avatar_url: string | null;
  } | null>(null);
  const [smsCount, setSmsCount] = useState(0);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileReady(true);
      return;
    }

    setProfileReady(false);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("profiles")
        .select("display_name, role, avatar_url")
        .eq("id", user.id)
        .single(),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ])
      .then(([profileResult, notificationsResult]) => {
        if (profileResult.data) setProfile(profileResult.data);
        setSmsCount(notificationsResult.count ?? 0);
      })
      .finally(() => {
        setProfileReady(true);
      });

    const channel = supabase
      .channel("dashboard-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => setSmsCount((p) => p + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-accent border-t-transparent" />
      </div>
    );

  if (!profileReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-accent border-t-transparent" />
      </div>
    );
  }

  const isAdmin = profile?.role === "admin";

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      window.location.href = "/";
    }
  }

  if (isAdmin) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#02060E]">
        <AdminSidebar verificationAlerts={3} onSignOut={handleSignOut} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F8FAFC]">
          <AdminTopbar userName={profile?.display_name ?? "Admin"} />
          <main className="h-0 w-full flex-1 overflow-y-auto p-5 sm:p-8 xl:p-10">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]/60">
      <DashboardSidebar
        userName={profile?.display_name ?? "მომხმარებელი"}
        userRole={profile?.role ?? "guest"}
        avatarUrl={profile?.avatar_url ?? undefined}
        smsCount={smsCount}
        currentPath={pathname}
      />
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
      <MobileBottomNav
        currentPath={pathname}
        userRole={profile?.role ?? "guest"}
      />
    </div>
  );
}
