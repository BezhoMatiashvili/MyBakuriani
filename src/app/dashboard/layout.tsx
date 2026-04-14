"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<{
    display_name: string;
    role: string;
    avatar_url: string | null;
  } | null>(null);
  const [smsCount, setSmsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .then(({ count }) => setSmsCount(count ?? 0));
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
