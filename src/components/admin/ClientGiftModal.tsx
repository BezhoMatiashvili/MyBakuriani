"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";
import { Link } from "@/i18n/navigation";

// Admin gift dialog for one client (admin clients list + client detail page):
// a wallet bonus in ₾ or free SMS credits through /api/admin/clients/bonus,
// plus links to the statuses page (C44) filtered to this client for the
// gifts that live there (membership, VIP / SUPER VIP / discount, company plan).

const MAX_BONUS_GEL = 10000;
const MAX_GIFT_SMS_CREDITS = 10000;
const MAX_COMMENT = 300;

type GiftKind = "balance" | "sms";

export interface GiftClient {
  id: string;
  display_name: string | null;
}

interface ClientGiftModalProps {
  client: GiftClient | null;
  onClose: () => void;
  /** Called with the client's new wallet balance after a ₾ bonus. */
  onBalanceGifted?: (clientId: string, newBalance: number) => void;
}

export function ClientGiftModal({
  client,
  onClose,
  onBalanceGifted,
}: ClientGiftModalProps) {
  const t = useTranslations("AdminClients");
  const [kind, setKind] = useState<GiftKind>("balance");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clientId = client?.id;
  useEffect(() => {
    setKind("balance");
    setValue("");
    setComment("");
  }, [clientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    const n = Number(value);
    if (
      kind === "balance" &&
      (!Number.isFinite(n) || n <= 0 || n > MAX_BONUS_GEL)
    ) {
      toast.error(t("bonusAmountInvalid"));
      return;
    }
    if (
      kind === "sms" &&
      (!Number.isInteger(n) || n < 1 || n > MAX_GIFT_SMS_CREDITS)
    ) {
      toast.error(t("giftSmsInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/clients/bonus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: client.id,
          kind,
          ...(kind === "balance" ? { amount: n } : { credits: n }),
          comment: comment.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        new_balance?: number;
      } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? t("bonusFailed"));
        return;
      }
      if (kind === "balance") {
        onBalanceGifted?.(client.id, Number(payload?.new_balance ?? 0));
        toast.success(t("bonusSuccess"));
      } else {
        toast.success(t("giftSmsSuccess"));
      }
      onClose();
    } catch {
      toast.error(t("bonusFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const statusLinks = client
    ? [
        {
          href: `/dashboard/admin/statuses?tab=memberships&scope=all&q=${client.id}`,
          label: t("giftMembershipLink"),
        },
        {
          href: `/dashboard/admin/statuses?tab=listings&owner=${client.id}`,
          label: t("giftListingsLink"),
        },
        {
          href: `/dashboard/admin/statuses?tab=companies&q=${client.id}`,
          label: t("giftCompanyLink"),
        },
      ]
    : [];

  return (
    <Modal
      isOpen={Boolean(client)}
      onClose={onClose}
      title={t("bonusTitle", { name: client?.display_name ?? "" })}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div
          role="radiogroup"
          aria-label={t("giftKindLabel")}
          className="grid grid-cols-2 gap-1 rounded-xl bg-[#F1F5F9] p-1"
        >
          {(["balance", "sms"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => {
                setKind(option);
                setValue("");
              }}
              className={`min-h-11 rounded-[10px] px-3 text-[13px] font-bold transition-colors ${
                kind === option
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              {option === "balance" ? t("giftKindBalance") : t("giftKindSms")}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="client-gift-value"
            className="text-[12px] font-bold text-[#0F172A]"
          >
            {kind === "balance" ? t("bonusAmount") : t("giftSmsCount")}{" "}
            <span className="text-[#DC2626]">*</span>
          </label>
          {kind === "balance" ? (
            <NumberField
              id="client-gift-value"
              value={value}
              onChange={setValue}
              min={0}
              max={MAX_BONUS_GEL}
              decimals={2}
              suffix="₾"
              placeholder="0"
              accent="green"
            />
          ) : (
            <NumberField
              id="client-gift-value"
              value={value}
              onChange={setValue}
              min={0}
              max={MAX_GIFT_SMS_CREDITS}
              integer
              placeholder="0"
              accent="green"
            />
          )}
          {kind === "sms" ? (
            <p className="text-[12px] font-medium leading-[17px] text-[#64748B]">
              {t("giftSmsHint")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="client-gift-comment"
            className="text-[12px] font-bold text-[#0F172A]"
          >
            {t("bonusComment")}
          </label>
          <input
            id="client-gift-comment"
            type="text"
            value={comment}
            maxLength={MAX_COMMENT}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            {t("bonusCancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-bold text-white hover:bg-[#059669] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("bonusSubmitting")}
              </>
            ) : (
              t("bonusSubmit")
            )}
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-2 border-t border-[#E2E8F0] pt-4">
        <p className="text-[12px] font-bold text-[#0F172A]">
          {t("giftMoreTitle")}
        </p>
        <ul className="space-y-1">
          {statusLinks.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-[13px] font-bold text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                <span>{item.label}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-[12px] font-medium leading-[17px] text-[#64748B]">
          {t("giftMoreHint")}
        </p>
      </div>
    </Modal>
  );
}
