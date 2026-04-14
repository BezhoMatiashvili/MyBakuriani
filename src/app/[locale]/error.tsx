"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#F8FAFC] px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="mt-4 text-[28px] font-black text-[#0F172A]">
        {t("title")}
      </h2>
      <p className="mt-2 max-w-md text-[15px] leading-[24px] text-[#64748B]">
        {t("description")}
      </p>
      <Button
        onClick={reset}
        className="mt-6 h-[48px] rounded-xl bg-[#2563EB] px-8 text-[15px] font-bold text-white hover:bg-[#1D4ED8]"
      >
        {t("retry")}
      </Button>
      <Link
        href="/"
        className="mt-4 text-[15px] font-medium text-[#2563EB] hover:underline"
      >
        {t("backToHome")}
      </Link>
    </div>
  );
}
