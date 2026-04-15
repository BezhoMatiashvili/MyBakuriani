"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// Route kept as a redirect so stale bookmarks resolve to the real page.
export default function AdminAnalyticsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin");
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-[#94A3B8]">
      გადახვევა...
    </div>
  );
}
