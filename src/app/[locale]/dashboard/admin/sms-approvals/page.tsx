"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Loader2,
  MessageSquare,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { maskPhone, formatDate } from "@/lib/utils/format";
import type { AdminPendingSms } from "@/app/api/admin/sms/pending/route";

const STATUS_KEYS = ["pending", "approved", "rejected", "sent"] as const;

export default function AdminSmsApprovalsPage() {
  const t = useTranslations("AdminSmsApprovals");
  const tShared = useTranslations("AdminShared");
  const [status, setStatus] = useState<(typeof STATUS_KEYS)[number]>("pending");
  const [rows, setRows] = useState<AdminPendingSms[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingFor, setRejectingFor] = useState<AdminPendingSms | null>(
    null,
  );

  const load = useCallback(async () => {
    setRows(null);
    const res = await fetch(`/api/admin/sms/pending?status=${status}`, {
      cache: "no-store",
    });
    const data = await res.json();
    setRows(data.rows ?? []);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (
    sms: AdminPendingSms,
    action: "approve" | "reject",
    notes?: string,
  ) => {
    setBusyId(sms.id);
    try {
      const res = await fetch("/api/admin/sms/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sms_id: sms.id,
          action,
          admin_notes: notes ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "moderation_failed");
      toast.success(
        action === "approve" ? t("approvedToast") : t("rejectedToast"),
      );
      setRejectingFor(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-[22px] font-black text-[#0F172A]">{t("title")}</h1>
        <p className="mt-1 text-[13px] text-[#64748B]">{t("subtitle")}</p>
      </header>

      <div className="mb-4 inline-flex flex-wrap rounded-full border border-[#E2E8F0] bg-white p-1">
        {STATUS_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors ${
              status === key
                ? "bg-[#0F172A] text-white"
                : "text-[#475569] hover:bg-[#F1F5F9]"
            }`}
          >
            {tShared(`smsStatus.${key}`)}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#CBD5E1] bg-white p-12 text-center">
          <ShieldCheck className="mx-auto mb-3 size-8 text-[#94A3B8]" />
          <p className="text-[14px] font-bold text-[#0F172A]">{t("empty")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-[20px] border border-[#E2E8F0] bg-white p-5"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">
                    {row.sender_name ?? "—"}{" "}
                    <span className="ml-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-bold uppercase text-[#475569]">
                      {row.sender_role ?? "—"}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[12px] text-[#64748B]">
                    →{" "}
                    <span className="font-bold text-[#334155]">
                      {row.recipient_name ?? "—"}
                    </span>{" "}
                    <span>({maskPhone(row.recipient_phone)})</span>
                  </p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-bold text-[#475569]">
                  {row.channel === "whatsapp" ? (
                    <MessageSquare className="size-3" />
                  ) : (
                    <Phone className="size-3" />
                  )}
                  {row.channel === "whatsapp" ? "WhatsApp" : tShared("call")}
                  {row.contact_event_created_at && (
                    <span className="ml-1 text-[#94A3B8]">
                      · {formatDate(row.contact_event_created_at)}
                    </span>
                  )}
                </span>
              </div>

              <div className="rounded-2xl bg-[#F8FAFC] p-3 text-[13px] leading-[20px] text-[#0F172A]">
                {row.message}
              </div>

              {status === "pending" && (
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    onClick={() => setRejectingFor(row)}
                    disabled={busyId === row.id}
                    className="h-10 gap-1.5 rounded-full bg-[#FEE2E2] px-4 text-[#991B1B] hover:bg-[#FECACA]"
                  >
                    <X className="size-4" />
                    {tShared("reject")}
                  </Button>
                  <Button
                    onClick={() => moderate(row, "approve")}
                    disabled={busyId === row.id}
                    className="h-10 gap-1.5 rounded-full bg-[#22C55E] px-4 text-white hover:bg-[#16A34A]"
                  >
                    {busyId === row.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {tShared("approve")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejectingFor && (
        <RejectModal
          row={rejectingFor}
          busy={busyId === rejectingFor.id}
          onCancel={() => setRejectingFor(null)}
          onConfirm={(notes) => moderate(rejectingFor, "reject", notes)}
        />
      )}
    </div>
  );
}

function RejectModal({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: AdminPendingSms;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}) {
  const t = useTranslations("AdminSmsApprovals");
  const tDash = useTranslations("DashboardShared");
  const tShared = useTranslations("AdminShared");
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
        <h3 className="mb-2 text-[16px] font-bold text-[#0F172A]">
          {t("rejectModalTitle")}
        </h3>
        <p className="mb-3 text-[12px] text-[#64748B]">
          {t("rejectModalDesc", { name: row.sender_name ?? "—" })}
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 280))}
          rows={4}
          placeholder={t("rejectReasonPlaceholder")}
          className="w-full resize-none rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px] outline-none focus:border-[#2563EB]"
        />
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-full bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0]"
          >
            {tDash("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(notes)}
            disabled={busy}
            className="h-11 flex-1 gap-2 rounded-full bg-[#EF4444] text-white hover:bg-[#DC2626]"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
            {tShared("reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
