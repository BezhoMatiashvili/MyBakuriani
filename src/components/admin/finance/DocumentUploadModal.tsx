"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import {
  DOCUMENT_TYPES,
  MAX_FINANCE_DOCUMENT_BYTES,
  recordCode,
  type DocumentType,
} from "@/lib/finance/constants";
import { tbilisiToday } from "@/lib/finance/filters";
import { financeRequest, useErrorText } from "./api";
import { Button, Field, Notice, Select, inputClass } from "./ui";

// Upload one primary document (spec §12) into the private finance-documents
// archive, optionally tied to the record it proves.

export type DocumentLinkTarget = {
  kind: "entry" | "expense" | "invoice" | "payment" | "refund";
  id: string;
  label: string;
};

export default function DocumentUploadModal({
  open,
  onClose,
  onUploaded,
  link,
  defaultType = "receipt",
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  link?: DocumentLinkTarget | null;
  defaultType?: DocumentType;
  defaults?: { title?: string; counterparty?: string; amount?: string };
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>(defaultType);
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDocType(defaultType);
    setTitle(defaults?.title ?? "");
    setNumber("");
    setDate("");
    setCounterparty(defaults?.counterparty ?? "");
    setAmount(defaults?.amount ?? "");
    setProblem(null);
  }, [
    open,
    defaultType,
    defaults?.title,
    defaults?.counterparty,
    defaults?.amount,
  ]);

  async function submit() {
    if (!file) return;
    if (file.size > MAX_FINANCE_DOCUMENT_BYTES) {
      setProblem(errorText("file_tooLarge"));
      return;
    }
    setBusy(true);
    setProblem(null);
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    form.append("title", title.trim());
    if (number.trim()) form.append("document_number", number.trim());
    if (date) form.append("document_date", date);
    if (counterparty.trim()) form.append("counterparty", counterparty.trim());
    if (amount.trim()) form.append("amount", amount.trim());
    if (link) {
      form.append("link_kind", link.kind);
      form.append("link_id", link.id);
    }
    const result = await financeRequest<{ id: string; document_no: number }>(
      "/api/admin/finance/documents",
      { method: "POST", body: form },
    );
    setBusy(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(
      t("documents.modal.uploaded", {
        code: recordCode("DOC", result.data.document_no),
      }),
    );
    onUploaded();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("documents.upload")}
      size="md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {link && (
          <Notice tone="info">
            {t("documents.modal.linkedTo", { label: link.label })}
          </Notice>
        )}
        <Field label={t("documents.modal.file")} htmlFor="doc-file">
          <input
            id="doc-file"
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-[#475569] file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-[#F1F5F9] file:px-4 file:text-[13px] file:font-bold file:text-[#0F172A]"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("documents.modal.type")} htmlFor="doc-type">
            <Select
              id="doc-type"
              value={docType}
              onChange={setDocType}
              options={DOCUMENT_TYPES.map((type) => ({
                value: type,
                label: t(`documentTypes.${type}`),
              }))}
            />
          </Field>
          <Field label={t("documents.modal.title")} htmlFor="doc-title">
            <input
              id="doc-title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("documents.modal.number")} htmlFor="doc-number">
            <input
              id="doc-number"
              maxLength={100}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("documents.modal.date")}>
            <DateField
              value={date}
              max={tbilisiToday()}
              clearable
              onChange={setDate}
            />
          </Field>
          <Field label={t("documents.modal.counterparty")} htmlFor="doc-party">
            <input
              id="doc-party"
              maxLength={200}
              value={counterparty}
              onChange={(event) => setCounterparty(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("documents.modal.amount")} htmlFor="doc-amount">
            <input
              id="doc-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!file || !title.trim()}
        >
          {busy ? t("documents.modal.uploading") : t("documents.upload")}
        </Button>
      </form>
    </Modal>
  );
}
