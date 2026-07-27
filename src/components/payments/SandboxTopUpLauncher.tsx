"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import TopUpModal from "@/components/payments/TopUpModal";

function isPaymentsDisabled(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("context" in error)) return false;
  const context = (error as { context?: unknown }).context;
  return context instanceof Response && context.status === 503;
}

/**
 * Shared wallet top-up trigger used by every balance dashboard. The Edge
 * function remains the only authority for enabling test payments and creating
 * a session; this component just opens the amount picker and starts checkout.
 */
export default function SandboxTopUpLauncher() {
  const t = useTranslations("DashboardShared");
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("payment") !== "success") return;
    toast.success(t("topUp.success"));
    router.replace(pathname);
    // Runs only after the return navigation. The pathname is stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTopUp = async (amount: number) => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount, purpose: "topup", return_path: pathname },
      });
      if (error) throw error;
      const paymentId = (data as { data?: { payment_id?: string } })?.data?.payment_id;
      if (!paymentId) throw new Error("Payment creation returned no session");
      router.push(`/checkout?session=${paymentId}`);
    } catch (error) {
      toast.error(t(isPaymentsDisabled(error) ? "topUp.unavailable" : "topUp.createError"));
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="sandbox-topup-launcher"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[13px] font-black text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
      >
        {t("topUpBalance")}
      </button>
      <TopUpModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={startTopUp}
        loading={creating}
      />
    </>
  );
}
