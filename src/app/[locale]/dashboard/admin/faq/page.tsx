"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FAQ_ANSWER_MAX,
  FAQ_LOCALES,
  FAQ_QUESTION_MAX,
  FAQ_SUBTITLE_MAX,
  FAQ_TITLE_MAX,
  emptyFaqTexts,
  type FaqContent,
  type FaqField,
  type FaqLocale,
  type FaqProblem,
  type FaqProblemKind,
} from "@/lib/faq";

type TextField = "title" | "subtitle";

// "<item id>:<field>:<locale>"; the page-level texts and the list itself have
// no item id (the list has no locale either).
function problemKey(field: FaqField, locale?: FaqLocale, id?: string): string {
  return `${id ?? ""}:${field}:${locale ?? ""}`;
}

function newItemId(): string {
  return `q-${Math.random().toString(36).slice(2, 10)}`;
}

function rowsFor(text: string): number {
  const breaks = text.match(/\n/g)?.length ?? 0;
  return Math.min(14, Math.max(3, Math.ceil(text.length / 70) + breaks));
}

const fieldClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm leading-6 text-[#0F172A] outline-none focus:border-[#2563EB]";

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span
      className={cn(
        "ml-auto text-[11px] font-semibold",
        length > max ? "text-[#EF4444]" : "text-[#94A3B8]",
      )}
    >
      {length}/{max}
    </span>
  );
}

export default function AdminFaqPage() {
  const t = useTranslations("AdminFaq");
  const uiLocale = useLocale();
  const [defaults, setDefaults] = useState<FaqContent | null>(null);
  const [saved, setSaved] = useState<FaqContent | null>(null);
  const [content, setContent] = useState<FaqContent | null>(null);
  const [custom, setCustom] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lang, setLang] = useState<FaqLocale>("ka");
  const [problems, setProblems] = useState<Record<string, FaqProblemKind>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/faq")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(
        (data: {
          content: FaqContent;
          defaults: FaqContent;
          custom: boolean;
          updatedAt: string | null;
        }) => {
          setDefaults(data.defaults);
          setSaved(data.content);
          setContent(data.content);
          setCustom(data.custom);
          setUpdatedAt(data.updatedAt);
        },
      )
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  function clearProblem(key: string) {
    setProblems((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setPageText(field: TextField, value: string) {
    setContent((prev) =>
      prev ? { ...prev, [field]: { ...prev[field], [lang]: value } } : prev,
    );
    clearProblem(problemKey(field, lang));
  }

  function setItemText(
    index: number,
    field: "question" | "answer",
    value: string,
  ) {
    setContent((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) =>
        i === index
          ? { ...item, [field]: { ...item[field], [lang]: value } }
          : item,
      );
      return { ...prev, items };
    });
    const id = content?.items[index]?.id;
    if (id) clearProblem(problemKey(field, lang, id));
  }

  function moveItem(index: number, delta: -1 | 1) {
    setContent((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items };
    });
  }

  function removeItem(index: number) {
    setContent((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((_, i) => i !== index) }
        : prev,
    );
  }

  function addItem() {
    setContent((prev) =>
      prev
        ? {
            ...prev,
            items: [
              ...prev.items,
              {
                id: newItemId(),
                question: emptyFaqTexts(),
                answer: emptyFaqTexts(),
              },
            ],
          }
        : prev,
    );
  }

  function restore() {
    if (!defaults) return;
    setContent(structuredClone(defaults));
    setProblems({});
    toast.info(t("restored"));
  }

  async function save() {
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/faq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 400 && Array.isArray(data?.problems)) {
        const list = data.problems as FaqProblem[];
        setProblems(
          Object.fromEntries(
            list.map(
              (p) => [problemKey(p.field, p.locale, p.id), p.problem] as const,
            ),
          ),
        );
        const first = list.find((p) => p.locale);
        if (first?.locale) setLang(first.locale);
        toast.error(t("fixProblems", { count: list.length }));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSaved(data.content);
      setContent(data.content);
      setCustom(true);
      setUpdatedAt(data.updatedAt);
      setProblems({});
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94A3B8]" />
      </div>
    );
  }

  if (!defaults || !content || !saved) {
    return (
      <p className="px-4 py-10 text-center text-sm font-medium text-[#64748B]">
        {t("loadError")}
      </p>
    );
  }

  const pending = JSON.stringify(content) !== JSON.stringify(saved);
  // Problems of the list itself (none left, too many, a bad id): no locale.
  const listProblem = Object.entries(problems).find(([key]) =>
    key.endsWith(":items:"),
  )?.[1];
  const lastSaved = updatedAt
    ? new Intl.DateTimeFormat(uiLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tbilisi",
      }).format(new Date(updatedAt))
    : null;
  // A fresh query string, so the edge cache cannot answer with the old page.
  const viewUrl = `${lang === "ka" ? "" : `/${lang}`}/faq?v=${Date.now()}`;

  const pageField = (field: TextField, max: number) => {
    const value = content[field][lang];
    const problem = problems[problemKey(field, lang)];
    const id = `faq-${field}-${lang}`;
    return (
      <div
        className={cn(
          "rounded-2xl border bg-white p-4",
          problem ? "border-[#EF4444]" : "border-[#E2E8F0]",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-bold text-[#0F172A]">
            {t(`fields.${field}`)}
          </label>
          <Counter length={value.length} max={max} />
        </div>
        <input
          id={id}
          lang={lang}
          value={value}
          onChange={(e) => setPageText(field, e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className={cn(
            fieldClass,
            "min-h-11",
            problem ? "border-[#EF4444]" : "border-[#E2E8F0]",
          )}
        />
        {problem && (
          <p
            id={`${id}-problem`}
            className="mt-1 text-xs font-semibold text-[#EF4444]"
          >
            {t(`problems.${problem}`)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-black text-[#0F172A] sm:text-[32px]">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#64748B]">
            {t("subtitle")}
          </p>
          <p className="mt-1 text-xs font-medium text-[#94A3B8]">
            {lastSaved && custom
              ? t("lastSaved", { date: lastSaved })
              : t("defaultsShown")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={saving || !pending}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? t("saving") : t("save")}
          </button>
          {pending && (
            <p className="text-xs font-semibold text-[#B45309]">
              {t("pending")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("languageLabel")}
          className="inline-flex rounded-xl bg-[#F1F5F9] p-1"
        >
          {FAQ_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={l === lang}
              onClick={() => setLang(l)}
              className={cn(
                "min-h-10 rounded-lg px-4 text-sm font-bold transition-colors",
                l === lang
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#334155]",
              )}
            >
              {t(`languages.${l}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={restore}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[#64748B] hover:text-[#0F172A]"
          >
            <RotateCcw className="size-4" aria-hidden />
            {t("restore")}
          </button>
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[#2563EB] hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("viewPage")}
          </a>
        </div>
      </div>

      <p className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-xs font-medium leading-5 text-[#64748B]">
        {t("note")}
      </p>

      <div className="space-y-3">
        {pageField("title", FAQ_TITLE_MAX)}
        {pageField("subtitle", FAQ_SUBTITLE_MAX)}
      </div>

      <div className="space-y-3">
        {content.items.map((item, index) => {
          const question = item.question[lang];
          const answer = item.answer[lang];
          const qProblem = problems[problemKey("question", lang, item.id)];
          const aProblem = problems[problemKey("answer", lang, item.id)];
          const qId = `faq-${item.id}-question-${lang}`;
          const aId = `faq-${item.id}-answer-${lang}`;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-[#0F172A]">
                  {t("itemLabel", { n: index + 1 })}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label={t("moveUp")}
                    title={t("moveUp")}
                    className="flex size-11 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === content.items.length - 1}
                    aria-label={t("moveDown")}
                    title={t("moveDown")}
                    className="flex size-11 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-40"
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    aria-label={t("removeItem")}
                    title={t("removeItem")}
                    className="flex size-11 items-center justify-center rounded-lg text-[#EF4444] hover:bg-[#FEF2F2]"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="mb-1 flex items-center gap-2">
                <label
                  htmlFor={qId}
                  className="text-sm font-bold text-[#0F172A]"
                >
                  {t("fields.question")}
                </label>
                <Counter length={question.length} max={FAQ_QUESTION_MAX} />
              </div>
              <input
                id={qId}
                lang={lang}
                value={question}
                onChange={(e) => setItemText(index, "question", e.target.value)}
                aria-invalid={qProblem ? true : undefined}
                aria-describedby={qProblem ? `${qId}-problem` : undefined}
                className={cn(
                  fieldClass,
                  "min-h-11",
                  qProblem ? "border-[#EF4444]" : "border-[#E2E8F0]",
                )}
              />
              {qProblem && (
                <p
                  id={`${qId}-problem`}
                  className="mt-1 text-xs font-semibold text-[#EF4444]"
                >
                  {t(`problems.${qProblem}`)}
                </p>
              )}

              <div className="mb-1 mt-3 flex items-center gap-2">
                <label
                  htmlFor={aId}
                  className="text-sm font-bold text-[#0F172A]"
                >
                  {t("fields.answer")}
                </label>
                <Counter length={answer.length} max={FAQ_ANSWER_MAX} />
              </div>
              <textarea
                id={aId}
                lang={lang}
                value={answer}
                rows={rowsFor(answer)}
                onChange={(e) => setItemText(index, "answer", e.target.value)}
                aria-invalid={aProblem ? true : undefined}
                aria-describedby={aProblem ? `${aId}-problem` : undefined}
                className={cn(
                  fieldClass,
                  "resize-y",
                  aProblem ? "border-[#EF4444]" : "border-[#E2E8F0]",
                )}
              />
              {aProblem && (
                <p
                  id={`${aId}-problem`}
                  className="mt-1 text-xs font-semibold text-[#EF4444]"
                >
                  {t(`problems.${aProblem}`)}
                </p>
              )}

              {lang !== "ka" && (!question || !answer) && (
                <p className="mt-2 text-xs font-medium leading-5 text-[#B45309]">
                  {t("fallbackHint")}
                </p>
              )}
            </div>
          );
        })}

        {content.items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[#CBD5E1] px-4 py-8 text-center text-sm font-medium text-[#64748B]">
            {t("noItems")}
          </p>
        )}
        {listProblem && (
          <p className="text-xs font-semibold text-[#EF4444]">
            {t(`problems.${listProblem}`)}
          </p>
        )}

        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 text-sm font-bold text-[#334155] transition-colors hover:border-[#CBD5E1]"
        >
          <Plus className="size-4" aria-hidden />
          {t("addItem")}
        </button>
      </div>
    </div>
  );
}
