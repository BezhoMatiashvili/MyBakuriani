"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { tbilisiDateTime } from "@/lib/finance/filters";
import { useErrorText, useFinanceQuery } from "./api";
import { Button, EmptyState, ErrorState, Skeletons } from "./ui";

// A finance record's audit log (spec §14): who created or changed it, when,
// and which fields — from audit_logs through /api/admin/finance/audit.

type AuditEvent = {
  id: string;
  occurred_at: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actor_name: string | null;
  changed_fields: string[] | null;
};

export type AuditTable =
  | "finance_entries"
  | "finance_expenses"
  | "finance_documents"
  | "invoices"
  | "finance_settings";

function AuditList({ table, id }: { table: AuditTable; id?: string }) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const params = new URLSearchParams({ table });
  if (id) params.set("id", id);
  const { data, error, loading, reload } = useFinanceQuery<{
    events: AuditEvent[];
  }>(`/api/admin/finance/audit?${params.toString()}`);

  if (loading && !data) return <Skeletons count={3} className="h-14" />;
  if (error)
    return <ErrorState message={errorText(error.code)} onRetry={reload} />;
  const events = data?.events ?? [];
  if (!events.length) return <EmptyState>{t("audit.empty")}</EmptyState>;
  return (
    <ol className="space-y-2">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-xl border border-[#F1F5F9] p-3 text-[13px] leading-[20px]"
        >
          <p className="font-bold text-[#0F172A]">
            {t(`audit.operations.${event.operation}`)}
            <span className="font-normal text-[#64748B]">
              {" · "}
              {event.actor_name ?? t("audit.system")}
              {" · "}
              {tbilisiDateTime(event.occurred_at)}
            </span>
          </p>
          {event.operation === "UPDATE" && event.changed_fields?.length ? (
            <p className="mt-1 break-words text-[12px] text-[#64748B]">
              {t("audit.fields", { list: event.changed_fields.join(", ") })}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default function AuditHistory({
  table,
  id,
  label,
}: {
  table: AuditTable;
  id?: string;
  label?: string;
}) {
  const t = useTranslations("AdminFinances");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        icon={<History className="h-4 w-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {label ?? t("common.history")}
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t("audit.title")}
        size="md"
      >
        {open && <AuditList table={table} id={id} />}
      </Modal>
    </>
  );
}
