"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function AdminProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/settings");
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-[#94A3B8]">
      გადახვევა...
    </div>
  );
}
