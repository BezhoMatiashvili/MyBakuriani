"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SALE_RESEARCH_LOCALES,
  SALE_RESEARCH_TEXT_FIELDS,
  normalizeSaleResearchText,
  type SaleResearchContent,
  type SaleResearchLocale,
  type SaleResearchProblem,
  type SaleResearchTextField,
} from "@/lib/sale-research";

// The home page's sale-mode research section (src/lib/sale-research.ts):
// every text in ka/en/ru and the figures, which are the same in every
// language. A field starts with what the page shows; emptying it (or the
// reset button) brings back the standard text.

type Texts = Record<SaleResearchTextField, string>;
type Defaults = Record<SaleResearchLocale, Texts>;
type DefaultValues = {
  roiValue: string;
  entryValue: string;
  smallShare: number;
};
type FigureField = "roiValue" | "entryValue" | "smallShare";
type FormValues = {
  texts: Record<SaleResearchLocale, Texts>;
  roiValue: string;
  entryValue: string;
  smallShare: string;
};
type Edits = {
  texts: SaleResearchContent["texts"];
  values: Partial<Record<FigureField, string>>;
};

const FIGURE_FIELDS: FigureField[] = ["roiValue", "entryValue", "smallShare"];

function valuesFrom(
  defaults: Defaults,
  defaultValues: DefaultValues,
  content: SaleResearchContent,
): FormValues {
  const texts = {} as FormValues["texts"];
  for (const locale of SALE_RESEARCH_LOCALES) {
    texts[locale] = { ...defaults[locale], ...content.texts[locale] };
  }
  return {
    texts,
    roiValue: content.values.roiValue ?? defaultValues.roiValue,
    entryValue: content.values.entryValue ?? defaultValues.entryValue,
    smallShare: String(content.values.smallShare ?? defaultValues.smallShare),
  };
}

// The edits a form amounts to: every field that is neither empty nor its
// standard value. The share goes as typed; the server checks it.
function editsFrom(
  defaults: Defaults,
  defaultValues: DefaultValues,
  values: FormValues,
): Edits {
  const texts = { ka: {}, en: {}, ru: {} } as Edits["texts"];
  for (const locale of SALE_RESEARCH_LOCALES) {
    for (const field of SALE_RESEARCH_TEXT_FIELDS) {
      const text = normalizeSaleResearchText(values.texts[locale][field] ?? "");
      if (text && text !== normalizeSaleResearchText(defaults[locale][field])) {
        texts[locale][field] = text;
      }
    }
  }
  const figures: Edits["values"] = {};
  for (const field of ["roiValue", "entryValue"] as const) {
    const text = normalizeSaleResearchText(values[field]);
    if (text && text !== defaultValues[field]) figures[field] = text;
  }
  const share = values.smallShare.trim();
  if (share && Number(share) !== defaultValues.smallShare) {
    figures.smallShare = share;
  }
  return { texts, values: figures };
}

// How many fields differ between the form's edits and the saved ones.
function countChanges(next: Edits, saved: SaleResearchContent): number {
  let count = 0;
  for (const locale of SALE_RESEARCH_LOCALES) {
    for (const field of SALE_RESEARCH_TEXT_FIELDS) {
      if (
        (next.texts[locale][field] ?? "") !== (saved.texts[locale][field] ?? "")
      ) {
        count += 1;
      }
    }
  }
  for (const field of FIGURE_FIELDS) {
    const before = saved.values[field];
    const after = next.values[field];
    const same =
      field === "smallShare"
        ? (after == null ? null : Number(after)) === (before ?? null)
        : (after ?? "") === (before ?? "");
    if (!same) count += 1;
  }
  return count;
}

const inputClass =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm leading-6 text-[#0F172A] outline-none focus:border-[#2563EB]";

export default function AdminSaleResearchPage() {
  const t = useTranslations("AdminSaleResearch");
  const uiLocale = useLocale();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [defaultValues, setDefaultValues] = useState<DefaultValues | null>(
    null,
  );
  const [limits, setLimits] = useState<
    Partial<Record<SaleResearchTextField, number>>
  >({});
  const [valueMax, setValueMax] = useState(20);
  const [saved, setSaved] = useState<SaleResearchContent | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lang, setLang] = useState<SaleResearchLocale>("ka");
  const [problems, setProblems] = useState<
    Record<string, SaleResearchProblem["problem"]>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/sale-research")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(
        (data: {
          content: SaleResearchContent;
          defaults: Defaults;
          defaultValues: DefaultValues;
          limits: Record<SaleResearchTextField, number>;
          valueMax: number;
          updatedAt: string | null;
        }) => {
          setDefaults(data.defaults);
          setDefaultValues(data.defaultValues);
          setLimits(data.limits);
          setValueMax(data.valueMax);
          setSaved(data.content);
          setValues(
            valuesFrom(data.defaults, data.defaultValues, data.content),
          );
          setUpdatedAt(data.updatedAt);
        },
      )
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const pending = useMemo(() => {
    if (!defaults || !defaultValues || !saved || !values) return 0;
    return countChanges(editsFrom(defaults, defaultValues, values), saved);
  }, [defaults, defaultValues, saved, values]);

  function clearProblem(key: string) {
    setProblems((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setText(
    locale: SaleResearchLocale,
    field: SaleResearchTextField,
    value: string,
  ) {
    setValues((prev) =>
      prev
        ? {
            ...prev,
            texts: {
              ...prev.texts,
              [locale]: { ...prev.texts[locale], [field]: value },
            },
          }
        : prev,
    );
    clearProblem(`${locale}:${field}`);
  }

  function setFigure(field: FigureField, value: string) {
    setValues((prev) => (prev ? { ...prev, [field]: value } : prev));
    clearProblem(`:${field}`);
  }

  async function save() {
    if (!defaults || !defaultValues || !values) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sale-research", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editsFrom(defaults, defaultValues, values),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 400 && Array.isArray(data?.problems)) {
        const list = data.problems as SaleResearchProblem[];
        setProblems(
          Object.fromEntries(
            list.map((p) => [`${p.locale ?? ""}:${p.field}`, p.problem]),
          ),
        );
        const textProblem = list.find((p) =>
          (SALE_RESEARCH_LOCALES as readonly string[]).includes(p.locale ?? ""),
        );
        if (textProblem) setLang(textProblem.locale as SaleResearchLocale);
        toast.error(t("fixProblems", { count: list.length }));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSaved(data.content);
      setValues(valuesFrom(defaults, defaultValues, data.content));
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

  if (!defaults || !defaultValues || !values) {
    return (
      <p className="px-4 py-10 text-center text-sm font-medium text-[#64748B]">
        {t("loadError")}
      </p>
    );
  }

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
  const pageUrl = `${lang === "ka" ? "" : `/${lang}`}/?v=${Date.now()}`;
  const share = Number(values.smallShare);
  const shareValid =
    values.smallShare.trim() !== "" &&
    Number.isFinite(share) &&
    share >= 0 &&
    share <= 100;

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
          {lastSaved && (
            <p className="mt-1 text-xs font-medium text-[#94A3B8]">
              {t("lastSaved", { date: lastSaved })}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={saving || pending === 0}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? t("saving") : t("save")}
          </button>
          {pending > 0 && (
            <p className="text-xs font-semibold text-[#B45309]">
              {t("pending", { count: pending })}
            </p>
          )}
        </div>
      </div>

      <p className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-xs font-medium leading-5 text-[#64748B]">
        {t("note")}
      </p>

      {/* ── Figures: the same in every language ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-[#0F172A]">
            {t("numbersTitle")}
          </h2>
          <p className="text-xs font-medium text-[#64748B]">
            {t("numbersNote")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FIGURE_FIELDS.map((field) => {
            const value = values[field];
            const fallback = String(defaultValues[field]);
            const isShare = field === "smallShare";
            const text = normalizeSaleResearchText(value);
            const edited =
              text !== "" &&
              (isShare
                ? Number(text) !== defaultValues.smallShare
                : text !== fallback);
            const problem = problems[`:${field}`];
            const id = `sale-research-${field}`;
            return (
              <div
                key={field}
                className={cn(
                  "rounded-2xl border bg-white p-4",
                  problem ? "border-[#EF4444]" : "border-[#E2E8F0]",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={id}
                    className="text-sm font-bold text-[#0F172A]"
                  >
                    {t(`fields.${field}`)}
                  </label>
                  {edited && (
                    <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                      {t("edited")}
                    </span>
                  )}
                  {!isShare && (
                    <span
                      className={cn(
                        "ml-auto text-[11px] font-semibold",
                        text.length > valueMax
                          ? "text-[#EF4444]"
                          : "text-[#94A3B8]",
                      )}
                    >
                      {text.length}/{valueMax}
                    </span>
                  )}
                </div>
                <input
                  id={id}
                  type={isShare ? "number" : "text"}
                  inputMode={isShare ? "decimal" : undefined}
                  min={isShare ? 0 : undefined}
                  max={isShare ? 100 : undefined}
                  step={isShare ? 0.1 : undefined}
                  value={value}
                  placeholder={fallback}
                  onChange={(e) => setFigure(field, e.target.value)}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? `${id}-problem` : undefined}
                  className={cn(inputClass, "h-11")}
                />
                {isShare && shareValid && (
                  <p className="mt-1 text-[11px] font-medium text-[#64748B]">
                    {t("shareHint", {
                      other: String(Math.round((100 - share) * 10) / 10),
                    })}
                  </p>
                )}
                {problem && (
                  <p
                    id={`${id}-problem`}
                    className="mt-1 text-xs font-semibold text-[#EF4444]"
                  >
                    {t(`problems.${problem}`)}
                  </p>
                )}
                {edited && (
                  <button
                    type="button"
                    onClick={() => setFigure(field, fallback)}
                    className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-[#64748B] hover:text-[#0F172A] lg:min-h-8"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t("reset")} ({fallback})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Texts: per language ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-black text-[#0F172A]">{t("textsTitle")}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label={t("languageLabel")}
            className="inline-flex rounded-xl bg-[#F1F5F9] p-1"
          >
            {SALE_RESEARCH_LOCALES.map((l) => (
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
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[#2563EB] hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("viewPage")}
          </a>
        </div>

        {SALE_RESEARCH_TEXT_FIELDS.map((field) => {
          const value = values.texts[lang][field] ?? "";
          const fallback = defaults[lang][field] ?? "";
          const text = normalizeSaleResearchText(value);
          const edited =
            text !== "" && text !== normalizeSaleResearchText(fallback);
          const limit = limits[field];
          const problem = problems[`${lang}:${field}`];
          const id = `sale-research-${lang}-${field}`;
          const common = {
            id,
            lang,
            value,
            "aria-invalid": problem ? true : undefined,
            "aria-describedby": problem ? `${id}-problem` : undefined,
          };
          return (
            <div
              key={field}
              className={cn(
                "rounded-2xl border bg-white p-4",
                problem ? "border-[#EF4444]" : "border-[#E2E8F0]",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label
                  htmlFor={id}
                  className="text-sm font-bold text-[#0F172A]"
                >
                  {t(`fields.${field}`)}
                </label>
                {edited && (
                  <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                    {t("edited")}
                  </span>
                )}
                {limit ? (
                  <span
                    className={cn(
                      "ml-auto text-[11px] font-semibold",
                      text.length > limit ? "text-[#EF4444]" : "text-[#94A3B8]",
                    )}
                  >
                    {text.length}/{limit}
                  </span>
                ) : null}
              </div>
              {field === "body" ? (
                <textarea
                  {...common}
                  rows={5}
                  onChange={(e) => setText(lang, field, e.target.value)}
                  className={cn(inputClass, "resize-y")}
                />
              ) : (
                <input
                  {...common}
                  type="text"
                  onChange={(e) => setText(lang, field, e.target.value)}
                  className={cn(inputClass, "h-11")}
                />
              )}
              {problem && (
                <p
                  id={`${id}-problem`}
                  className="mt-1 text-xs font-semibold text-[#EF4444]"
                >
                  {t(`problems.${problem}`)}
                </p>
              )}
              {edited && (
                <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                  <details className="min-w-0 flex-1 text-xs text-[#64748B]">
                    <summary className="cursor-pointer font-semibold">
                      {t("defaultText")}
                    </summary>
                    <p className="mt-1 leading-5">{fallback}</p>
                  </details>
                  <button
                    type="button"
                    onClick={() => setText(lang, field, fallback)}
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-[#64748B] hover:text-[#0F172A] lg:min-h-8"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t("reset")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
