"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDE_BASE_PATH } from "@/lib/guide";
import {
  GUIDE_EDIT_GROUPS,
  GUIDE_LOCALES,
  GUIDE_TEXT_MAX,
  guideKeyGroup,
  guideKeyTakesTags,
  guideTextLimit,
  normalizeGuideText,
  type GuideEditGroup,
  type GuideLocale,
  type GuideOverrides,
  type GuideProblem,
  type GuideTextProblem,
  type GuideTexts,
} from "@/lib/guide-overrides";

type Defaults = Record<GuideLocale, GuideTexts>;
type Values = Record<GuideLocale, GuideTexts>;

// Locale-less path of the public page a tab's texts appear on.
function groupPath(group: GuideEditGroup): string {
  if (group === "hub" || group === "common") return GUIDE_BASE_PATH;
  if (group === "gettingThere") return `${GUIDE_BASE_PATH}/getting-there`;
  if (group === "skiLifts") return `${GUIDE_BASE_PATH}/ski-lifts`;
  return `${GUIDE_BASE_PATH}/${group}`;
}

function publicUrl(group: GuideEditGroup, locale: GuideLocale): string {
  const prefix = locale === "ka" ? "" : `/${locale}`;
  // A fresh query string, so the edge cache cannot answer with the old page.
  return `${prefix}${groupPath(group)}?v=${Date.now()}`;
}

// What a text is, read from its key, so the admin sees "Question 2" rather
// than only `hub.q2`.
function fieldKind(key: string): { kind: string; n?: number } {
  const leaf = key.slice(key.lastIndexOf(".") + 1);
  if (key.startsWith("meta.")) {
    return { kind: leaf.endsWith("Title") ? "metaTitle" : "metaDescription" };
  }
  const qa = /^([qa])(\d+)$/.exec(leaf);
  if (qa) return { kind: qa[1] === "q" ? "question" : "answer", n: +qa[2] };
  if (leaf === "h1" || leaf === "lead" || leaf === "crumb")
    return { kind: leaf };
  if (/Title$/.test(leaf)) return { kind: "sectionTitle" };
  return { kind: "text" };
}

function valuesFrom(defaults: Defaults, overrides: GuideOverrides): Values {
  const out = {} as Values;
  for (const locale of GUIDE_LOCALES) {
    out[locale] = { ...defaults[locale], ...overrides[locale] };
  }
  return out;
}

// The overrides a set of field values amounts to: every text that is neither
// empty nor the catalog text. An emptied field goes back to the catalog text.
function overridesFrom(defaults: Defaults, values: Values): GuideOverrides {
  const out = { ka: {}, en: {}, ru: {} } as GuideOverrides;
  for (const locale of GUIDE_LOCALES) {
    for (const [key, value] of Object.entries(values[locale])) {
      const text = normalizeGuideText(value);
      const fallback = normalizeGuideText(defaults[locale][key] ?? "");
      if (text && text !== fallback) out[locale][key] = text;
    }
  }
  return out;
}

function rowsFor(text: string): number {
  return Math.min(10, Math.max(2, Math.ceil(text.length / 70)));
}

export default function AdminGuidePage() {
  const t = useTranslations("AdminGuide");
  const uiLocale = useLocale();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [saved, setSaved] = useState<GuideOverrides | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [group, setGroup] = useState<GuideEditGroup>("hub");
  const [lang, setLang] = useState<GuideLocale>("ka");
  const [problems, setProblems] = useState<Record<string, GuideTextProblem>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/guide")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(
        (data: {
          defaults: Defaults;
          overrides: GuideOverrides;
          tags: string[];
          updatedAt: string | null;
        }) => {
          setDefaults(data.defaults);
          setSaved(data.overrides);
          setValues(valuesFrom(data.defaults, data.overrides));
          setTags(data.tags);
          setUpdatedAt(data.updatedAt);
        },
      )
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const keys = useMemo(
    () =>
      defaults
        ? Object.keys(defaults.ka).filter((key) => guideKeyGroup(key) === group)
        : [],
    [defaults, group],
  );

  const pending = useMemo(() => {
    if (!defaults || !saved || !values) return 0;
    const next = overridesFrom(defaults, values);
    let count = 0;
    for (const locale of GUIDE_LOCALES) {
      const all = new Set([
        ...Object.keys(next[locale]),
        ...Object.keys(saved[locale]),
      ]);
      for (const key of all) {
        if (next[locale][key] !== saved[locale][key]) count += 1;
      }
    }
    return count;
  }, [defaults, saved, values]);

  function setValue(locale: GuideLocale, key: string, value: string) {
    setValues((prev) =>
      prev ? { ...prev, [locale]: { ...prev[locale], [key]: value } } : prev,
    );
    setProblems((prev) => {
      if (!prev[`${locale}:${key}`]) return prev;
      const next = { ...prev };
      delete next[`${locale}:${key}`];
      return next;
    });
  }

  async function save() {
    if (!defaults || !values) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guide", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: overridesFrom(defaults, values) }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 400 && Array.isArray(data?.problems)) {
        const list = data.problems as GuideProblem[];
        setProblems(
          Object.fromEntries(
            list.map((p) => [`${p.locale}:${p.key}`, p.problem] as const),
          ),
        );
        if (list[0]) {
          setGroup(guideKeyGroup(list[0].key));
          setLang(list[0].locale);
        }
        toast.error(t("fixProblems", { count: list.length }));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSaved(data.overrides);
      setValues(valuesFrom(defaults, data.overrides));
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

  if (!defaults || !values) {
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

      <div
        role="tablist"
        aria-label={t("pagesLabel")}
        className="flex flex-wrap gap-2"
      >
        {GUIDE_EDIT_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={g === group}
            onClick={() => setGroup(g)}
            className={cn(
              "min-h-11 rounded-xl border px-4 text-sm font-bold transition-colors",
              g === group
                ? "border-[#0F172A] bg-[#0F172A] text-white"
                : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]",
            )}
          >
            {t(`groups.${g}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("languageLabel")}
          className="inline-flex rounded-xl bg-[#F1F5F9] p-1"
        >
          {GUIDE_LOCALES.map((l) => (
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
          href={publicUrl(group, lang)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[#2563EB] hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden />
          {t("viewPage")}
        </a>
      </div>

      <p className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-xs font-medium leading-5 text-[#64748B]">
        {t("note")}
      </p>

      <div className="space-y-3">
        {keys.map((key) => {
          const value = values[lang][key] ?? "";
          const fallback = defaults[lang][key] ?? "";
          const edited =
            normalizeGuideText(value) !== "" &&
            normalizeGuideText(value) !== normalizeGuideText(fallback);
          const { kind, n } = fieldKind(key);
          const limit = guideTextLimit(key);
          const showCounter = limit < GUIDE_TEXT_MAX;
          const length = normalizeGuideText(value).length;
          const problem = problems[`${lang}:${key}`];
          const takesTags = guideKeyTakesTags(
            GUIDE_LOCALES.map((l) => defaults[l][key] ?? ""),
          );
          const id = `guide-${lang}-${key}`;
          return (
            <div
              key={key}
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
                  {t(`fields.${kind}`, { n: n ?? 0 })}
                </label>
                <code className="text-[11px] text-[#94A3B8]">{key}</code>
                {edited && (
                  <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                    {t("edited")}
                  </span>
                )}
                {showCounter && (
                  <span
                    className={cn(
                      "ml-auto text-[11px] font-semibold",
                      length > limit ? "text-[#EF4444]" : "text-[#94A3B8]",
                    )}
                  >
                    {length}/{limit}
                  </span>
                )}
              </div>
              <textarea
                id={id}
                lang={lang}
                value={value}
                rows={rowsFor(value)}
                onChange={(e) => setValue(lang, key, e.target.value)}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${id}-problem` : undefined}
                className="w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm leading-6 text-[#0F172A] outline-none focus:border-[#2563EB]"
              />
              {problem && (
                <p
                  id={`${id}-problem`}
                  className="mt-1 text-xs font-semibold text-[#EF4444]"
                >
                  {t(`problems.${problem}`)}
                </p>
              )}
              {takesTags && (
                <p className="mt-1 text-[11px] leading-4 text-[#64748B]">
                  {t("tagsHint")}{" "}
                  <code className="text-[#334155]">
                    {"<apartments>…</apartments>"}
                  </code>{" "}
                  · {tags.join(", ")}
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
                    onClick={() => setValue(lang, key, fallback)}
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
      </div>
    </div>
  );
}
