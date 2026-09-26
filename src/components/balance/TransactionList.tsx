"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  History,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;

const TX_TYPES = [
  "topup",
  "vip_boost",
  "super_vip",
  "sms_package",
  "discount_badge",
  "withdrawal",
  "commission",
  "sms_send",
  "membership_refund",
  "card_refund",
] as const;

type TxType = (typeof TX_TYPES)[number];

function isTxType(type: string): type is TxType {
  return (TX_TYPES as readonly string[]).includes(type);
}

/**
 * Wallet transaction history shared by the renter/seller, food and service
 * balance pages. Each row expands to show the stored description, the listing
 * the purchase was for, and the exact time.
 */
export default function TransactionList({
  transactions,
  loading,
  listingTitles,
}: {
  transactions: Transaction[];
  loading: boolean;
  /** id → title of the viewer's own listings, used to resolve `reference_id`. */
  listingTitles: Record<string, string>;
}) {
  const t = useTranslations("DashboardShared");
  const locale = useLocale();
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-3 space-y-2">
      {loading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
          <History className="h-10 w-10 text-[#94A3B8]" />
          <p className="mt-2 text-sm text-[#94A3B8]">{t("noTransactions")}</p>
        </div>
      ) : (
        transactions.map((tx) => {
          const open = openIds.has(tx.id);
          const panelId = `tx-details-${tx.id}`;
          const listingTitle = tx.reference_id
            ? listingTitles[tx.reference_id]
            : undefined;
          return (
            <div
              key={tx.id}
              className="rounded-xl border border-[#EEF1F4] bg-white shadow-[0px_1px_2px_rgba(15,23,42,0.03)]"
            >
              <button
                type="button"
                onClick={() => toggle(tx.id)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      tx.amount >= 0
                        ? "bg-[#DCFCE7] text-[#16A34A]"
                        : "bg-[#FEE2E2] text-[#DC2626]"
                    }`}
                  >
                    {tx.amount >= 0 ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0F172A]">
                      {isTxType(tx.type) ? t(`txTypes.${tx.type}`) : tx.type}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {formatDate(tx.created_at, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-sm font-extrabold ${
                      tx.amount >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"
                    }`}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount.toFixed(2)} ₾
                  </span>
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-4 w-4 text-[#94A3B8]" />
                  </motion.span>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    id={panelId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 space-y-2 border-t border-[#EEF1F4] py-3">
                      {tx.description && (
                        <p className="break-words text-[13px] font-medium text-[#334155]">
                          {tx.description}
                        </p>
                      )}
                      <dl className="space-y-1.5 text-[12px]">
                        {listingTitle && (
                          <div className="flex justify-between gap-3">
                            <dt className="shrink-0 text-[#94A3B8]">
                              {t("txDetails.listing")}
                            </dt>
                            <dd className="min-w-0 break-words text-right font-semibold text-[#0F172A]">
                              {listingTitle}
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-[#94A3B8]">
                            {t("txDetails.dateTime")}
                          </dt>
                          <dd className="text-right font-semibold text-[#0F172A]">
                            {formatDateTime(tx.created_at, locale)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}
    </div>
  );
}
