"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  FileText,
  Link as LinkIcon,
  QrCode,
  Plus,
  Percent,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  contentChangeErrorKey,
  submitContentChange,
} from "@/lib/content-change/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import FoodDiscountRequestModal, {
  type FoodDiscountRequestResult,
} from "@/components/dashboard/FoodDiscountRequestModal";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { isDiscountActive } from "@/lib/utils/pricing";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;
type DiscountRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  proposed_values: { discount_percent?: number } | null;
  quoted_amount_gel: number | null;
  quoted_duration_hours: number | null;
  payment_error: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

interface MenuData {
  url?: string;
}

// The "open menu" anchor below renders the LIVE input value, not the saved one,
// so gating only the save left `javascript:` in an href while the owner typed.
// Self-XSS only (own state, own dashboard), but the anchor and the save must
// agree on what counts as a URL — hence one predicate, used by both.
const isHttpUrl = (value: string) => /^https?:\/\/.+\..+/i.test(value);

export default function FoodOrdersPage() {
  const tCreate = useTranslations("CreateShared");
  const t = useTranslations("FoodOrders");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [menuUrl, setMenuUrl] = useState("");
  const [menuUrlError, setMenuUrlError] = useState(false);
  // Derived once rather than guarding at the call site: the value that reaches
  // href is then itself the validated one, instead of an unvalidated value
  // rendered under a separate condition.
  const trimmedMenuUrl = menuUrl.trim();
  const safeMenuUrl = isHttpUrl(trimmedMenuUrl) ? trimmedMenuUrl : null;
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [discountRequest, setDiscountRequest] =
    useState<DiscountRequest | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const svcRes = await supabase
      .from("services")
      .select("*")
      .eq("owner_id", user.id)
      .eq("category", "food")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (svcRes.data) {
      setService(svcRes.data);
      const menuData = (svcRes.data.menu as unknown as MenuData | null) ?? {};
      setMenuUrl(menuData.url ?? "");
      const requestRes = await fetch(
        `/api/food/discount-requests?serviceId=${encodeURIComponent(svcRes.data.id)}`,
        { cache: "no-store" },
      );
      if (requestRes.ok) {
        const payload = (await requestRes.json()) as {
          request: DiscountRequest | null;
        };
        setDiscountRequest(payload.request);
      }
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const menuData: MenuData =
    (service?.menu as unknown as MenuData | null) ?? {};

  // The whole `menu` column is review-gated, so these three actions queue a change
  // request instead of writing the row. Nothing on screen can update until an admin
  // approves, so the outcome has to be reported explicitly.
  async function submitMenuChange(nextMenu: MenuData) {
    if (!service) return;
    setReviewNotice("");
    setReviewError("");
    try {
      await submitContentChange("service", service.id, { menu: nextMenu });
      setReviewNotice(tCreate("contentChange.pending"));
      // Re-read the row: an admin may have approved an earlier request, and building the
      // next proposal from a stale snapshot would silently drop the approved values.
      await fetchData();
    } catch (cause) {
      setReviewError(tCreate(contentChangeErrorKey(cause)));
    }
  }

  async function saveMenuUrl() {
    if (!service) return;
    // Empty is allowed here (it clears the saved URL); safeMenuUrl is null for
    // empty too, which is why the save can't just reuse it.
    if (trimmedMenuUrl && !isHttpUrl(trimmedMenuUrl)) {
      setMenuUrlError(true);
      return;
    }
    setMenuUrlError(false);
    await submitMenuChange({ ...menuData, url: trimmedMenuUrl });
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {service?.title ?? tShared("defaultRestaurant")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
        {reviewNotice && (
          <p className="mt-3 rounded-xl bg-[#ECFDF5] px-4 py-3 text-[13px] font-medium text-[#0F8F60]">
            {reviewNotice}
          </p>
        )}
        {reviewError && (
          <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#DC2626]">
            {reviewError}
          </p>
        )}
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-[16px] font-black text-[#0F172A]">
          {t("menuSection")}
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#DC2626]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  {t("pdfMenu")}
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  {t("pdfMenuHint")}
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-[11px] font-medium text-[#64748B]">
              {t("maxSize")}
            </p>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B]">
              <Plus className="h-4 w-4" />
              {t("uploadMenu")}
              <input type="file" accept="application/pdf" className="hidden" />
            </label>
          </div>

          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  {t("digitalMenu")}
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  {t("digitalMenuHint")}
                </p>
              </div>
            </div>
            <input
              type="url"
              inputMode="url"
              value={menuUrl}
              onChange={(e) => {
                setMenuUrl(e.target.value);
                if (menuUrlError) setMenuUrlError(false);
              }}
              placeholder="https://..."
              className={`mt-4 h-11 w-full rounded-xl border bg-white px-4 text-[12px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 ${
                menuUrlError
                  ? "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/15"
                  : "border-[#E2E8F0] focus:border-[#2563EB] focus:ring-[#2563EB]/15"
              }`}
            />
            {menuUrlError && (
              <p className="mt-1.5 text-[11px] font-medium text-[#EF4444]">
                {t("invalidUrl")}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveMenuUrl}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E40AF]"
              >
                <QrCode className="h-4 w-4" />
                {t("saveAndQr")}
              </button>
              {safeMenuUrl && (
                <a
                  href={safeMenuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-black text-[#0F172A]">
              {t("discountTitle")}
            </h2>
            <p className="mt-0.5 text-[12px] text-[#94A3B8]">
              {t("discountHint")}
            </p>
          </div>
          <button
            type="button"
            disabled={!service || service.status !== "active"}
            onClick={() => setPromotionOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(22,163,74,0.35)] transition-colors hover:bg-[#15803D] disabled:opacity-50"
          >
            <Percent className="h-4 w-4" />
            {t("activateDiscount")}
          </button>
        </div>

        {loading ? (
          <Skeleton className="h-24 rounded-[20px]" />
        ) : (
          <div className="space-y-3">
          {discountRequest?.status === "pending" && (
            <div className="rounded-[20px] border border-[#BFDBFE] bg-[#EFF6FF] p-5">
              <p className="text-[14px] font-black text-[#1E3A8A]">
                {t("requestPending")}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#1D4ED8]">
                {t("requestPendingDetails", {
                  percent: discountRequest.proposed_values?.discount_percent ?? 0,
                  amount: Number(discountRequest.quoted_amount_gel ?? 0).toFixed(2),
                  hours: discountRequest.quoted_duration_hours ?? 0,
                })}
              </p>
              {discountRequest.payment_error === "insufficient_balance" && (
                <p className="mt-2 text-[11px] font-bold text-[#B45309]">
                  {t("requestNeedsBalance")}
                </p>
              )}
            </div>
          )}
          {isDiscountActive(
            service?.discount_percent,
            service?.discount_expires_at,
          ) ? (
          <div className="flex items-center gap-4 rounded-[20px] border border-[#BBF7D0] bg-[#F0FDF4] p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#16A34A] shadow-sm">
              <Percent className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-black text-[#14532D]">
                  {t("activeDiscount")}
                </p>
                <ListingBadge variant="discount" className="normal-case">
                  −{service?.discount_percent}%
                </ListingBadge>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-[#166534]">
                {service?.discount_expires_at
                  ? t("discountExpires", {
                      date: new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(service.discount_expires_at)),
                    })
                  : t("discountActive")}
              </p>
            </div>
          </div>
          ) : (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-10 text-center">
            <Percent className="h-9 w-9 text-[#CBD5E1]" />
            <p className="mt-3 text-[13px] font-bold text-[#0F172A]">
              {t("noActiveDiscount")}
            </p>
            <p className="mt-1 max-w-md text-[11px] leading-4 text-[#94A3B8]">
              {t("paidDiscountHelp")}
            </p>
          </div>
          )}
          </div>
        )}
      </motion.section>

      <FoodDiscountRequestModal
        isOpen={promotionOpen}
        onClose={() => setPromotionOpen(false)}
        restaurant={service}
        onSubmitted={(request: FoodDiscountRequestResult) => {
          setDiscountRequest({
            id: request.id,
            status: request.status,
            proposed_values: {
              discount_percent: request.discount_percent,
            },
            quoted_amount_gel: request.quoted_amount_gel,
            quoted_duration_hours: request.quoted_duration_hours,
            payment_error: null,
            rejection_reason: null,
            created_at: request.created_at,
            reviewed_at: null,
          });
        }}
      />
    </div>
  );
}
