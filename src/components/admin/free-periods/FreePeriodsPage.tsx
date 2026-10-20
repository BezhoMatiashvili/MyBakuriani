"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FREE_PERIOD_ERROR_CODES,
  type FreePeriodApplyResult,
  type FreePeriodView,
} from "@/lib/free-periods";
import FreePeriodCard from "./FreePeriodCard";
import FreePeriodForm, { type SaveResult } from "./FreePeriodForm";

// Admin free periods (C53): a standing rule "everyone who registers between A and
// B gets <benefit> until X". The list shows every rule with its counters; the
// dialog creates or edits one. Saving a running period applies it at once (the
// database trigger covers new registrations, a 5-minute job everyone else).

type Editor = FreePeriodView | "new" | null;

export default function FreePeriodsPage() {
  const t = useTranslations("AdminFreePeriods");
  const tShared = useTranslations("AdminShared");
  const [periods, setPeriods] = useState<FreePeriodView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState<{
    id: string;
    action: "toggle" | "apply";
  } | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch("/api/admin/free-periods", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(payload?.periods)) throw new Error();
      setPeriods(payload.periods as FreePeriodView[]);
    } catch {
      setLoadFailed(true);
      setPeriods((previous) => previous ?? []);
      toast.error(tShared("loadFailed"));
    }
  }, [tShared]);

  useEffect(() => {
    load();
  }, [load]);

  function upsert(period: FreePeriodView | null) {
    if (!period) return;
    setPeriods((previous) => {
      const list = previous ?? [];
      return list.some((p) => p.id === period.id)
        ? list.map((p) => (p.id === period.id ? period : p))
        : [period, ...list];
    });
  }

  function applyNote(apply: FreePeriodApplyResult | null): string | null {
    if (!apply) return null;
    if (apply.state === "busy") return t("toast.busy");
    if (apply.state === "ended") return t("toast.ended");
    if (apply.state === "paused") return t("toast.pausedNote");
    const changed =
      apply.granted_members + apply.granted_listings + apply.redated;
    const base =
      changed === 0
        ? t("toast.nothing")
        : t("toast.applied", {
            members: apply.granted_members,
            listings: apply.granted_listings,
            redated: apply.redated,
          });
    return apply.remaining > 0
      ? `${base} ${t("toast.more", { count: apply.remaining })}`
      : base;
  }

  function saved(result: SaveResult, created: boolean) {
    upsert(result.period);
    setEditor(null);
    const note = applyNote(result.apply);
    toast.success(
      [created ? t("toast.created") : t("toast.saved"), note]
        .filter(Boolean)
        .join(" "),
    );
  }

  function errorText(code: unknown): string {
    return (FREE_PERIOD_ERROR_CODES as readonly unknown[]).includes(code)
      ? t(`errors.${code as (typeof FREE_PERIOD_ERROR_CODES)[number]}`)
      : t("errors.server_error");
  }

  async function call(
    period: FreePeriodView,
    action: "toggle" | "apply",
  ): Promise<SaveResult | null> {
    setBusy({ id: period.id, action });
    try {
      const res =
        action === "toggle"
          ? await fetch(`/api/admin/free-periods/${period.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ isActive: !period.isActive }),
            })
          : await fetch(`/api/admin/free-periods/${period.id}/apply`, {
              method: "POST",
            });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(errorText(payload?.error));
        return null;
      }
      return payload as SaveResult;
    } catch {
      toast.error(t("errors.server_error"));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function toggle(period: FreePeriodView) {
    const result = await call(period, "toggle");
    if (!result) return;
    upsert(result.period);
    const note = applyNote(result.apply);
    toast.success(
      [period.isActive ? t("toast.paused") : t("toast.activated"), note]
        .filter(Boolean)
        .join(" "),
    );
  }

  async function applyNow(period: FreePeriodView) {
    const result = await call(period, "apply");
    if (!result) return;
    upsert(result.period);
    toast.success(applyNote(result.apply) ?? t("toast.nothing"));
  }

  return (
    <div className="mx-auto flex w-full max-w-[918px] flex-col gap-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="max-w-[640px] text-[14px] font-medium leading-[21px] text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor("new")}
          data-testid="free-period-new"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 text-[14px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("create")}
        </button>
      </div>

      <section className="rounded-[24px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 sm:p-6">
        <h2 className="text-[13px] font-bold leading-5 text-[#1E293B]">
          {t("how.title")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] font-medium leading-5 text-[#475569]">
          <li>{t("how.rule")}</li>
          <li>{t("how.timing")}</li>
          <li>{t("how.vip")}</li>
          <li>{t("how.edits")}</li>
        </ul>
      </section>

      <div className="space-y-4" aria-live="polite">
        {periods === null ? (
          Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-[240px] w-full rounded-[24px]" />
          ))
        ) : periods.length === 0 ? (
          <div
            data-testid="free-periods-empty"
            className="rounded-[24px] border border-dashed border-[#CBD5E1] bg-white px-6 py-12 text-center"
          >
            <p className="text-[14px] font-medium text-[#64748B]">
              {loadFailed ? tShared("loadFailed") : t("empty")}
            </p>
            {loadFailed ? (
              <button
                type="button"
                onClick={load}
                className="mt-3 inline-flex min-h-[44px] items-center px-4 text-[13px] font-bold text-[#2563EB]"
              >
                {t("retry")}
              </button>
            ) : null}
          </div>
        ) : (
          periods.map((period) => (
            <FreePeriodCard
              key={period.id}
              period={period}
              busy={busy?.id === period.id ? busy.action : null}
              onEdit={() => setEditor(period)}
              onToggle={() => toggle(period)}
              onApply={() => applyNow(period)}
            />
          ))
        )}
      </div>

      <Modal
        isOpen={editor !== null}
        onClose={() => setEditor(null)}
        title={
          editor === "new" || editor === null
            ? t("form.createTitle")
            : t("form.editTitle")
        }
        size="lg"
      >
        {editor !== null ? (
          <FreePeriodForm
            key={editor === "new" ? "new" : editor.id}
            period={editor === "new" ? null : editor}
            onSaved={saved}
            onClose={() => setEditor(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
