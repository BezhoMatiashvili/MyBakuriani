"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import {
  SIGNUP_LINK_PRESETS,
  type SignupLinkPresetKey,
} from "@/lib/signup-links";

interface SignupLink {
  id: string;
  code: string;
  label: string;
  destination: string;
  is_active: boolean;
  created_at: string;
}

type DestinationChoice = SignupLinkPresetKey | "custom";

const API_ERRORS = [
  "invalid_label",
  "invalid_destination",
  "invalid_code",
  "code_taken",
] as const;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

const INPUT_CLASS =
  "h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10";
const LABEL_CLASS =
  "block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]";

function linkUrl(code: string) {
  return `${SITE_URL ?? window.location.origin}/join/${code}`;
}

export default function SignupLinksPage() {
  const t = useTranslations("AdminSignupLinks");
  const tShared = useTranslations("AdminShared");
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [form, setForm] = useState({
    label: "",
    choice: "smartMatch" as DestinationChoice,
    customPath: "",
    code: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/signup-links", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? tShared("loadFailed"));
      setLinks([]);
    } else {
      setLinks(payload.links as SignupLink[]);
    }
    setLoading(false);
  }, [tShared]);

  useEffect(() => {
    load();
  }, [load]);

  function errorText(code: unknown, fallback: string) {
    return (API_ERRORS as readonly unknown[]).includes(code)
      ? t(`errors.${code as (typeof API_ERRORS)[number]}`)
      : typeof code === "string"
        ? code
        : fallback;
  }

  function destinationLabel(destination: string) {
    const preset = SIGNUP_LINK_PRESETS.find(
      (p) => p.destination === destination,
    );
    return preset ? t(`destinations.${preset.key}`) : destination;
  }

  async function submit() {
    if (!form.label.trim()) {
      toast.error(t("errors.invalid_label"));
      return;
    }
    const destination =
      form.choice === "custom"
        ? form.customPath.trim()
        : SIGNUP_LINK_PRESETS.find((p) => p.key === form.choice)!.destination;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/signup-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: form.label,
          destination,
          code: form.code || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(errorText(payload.error, tShared("createFailed")));
      }
      toast.success(t("created"));
      setForm((f) => ({ ...f, label: "", code: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(id: string) {
    setDeactivatingId(id);
    try {
      const res = await fetch(`/api/admin/signup-links?id=${id}`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? tShared("changeFailed"));
      toast.success(t("deactivated"));
      setLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, is_active: false } : l)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setDeactivatingId(null);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(linkUrl(code));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  const activeLinks = links.filter((l) => l.is_active);
  const filteredActiveLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeLinks;
    return activeLinks.filter(
      (l) => l.label.toLowerCase().includes(q) || l.code.includes(q),
    );
  }, [activeLinks, search]);

  return (
    <div className="mx-auto flex w-full max-w-[918px] flex-col gap-8 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="space-y-2">
              <label htmlFor="signup-link-label" className={LABEL_CLASS}>
                {t("labelField")}
              </label>
              <input
                id="signup-link-label"
                type="text"
                maxLength={120}
                value={form.label}
                placeholder={t("labelPlaceholder")}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-link-destination" className={LABEL_CLASS}>
                {t("destinationField")}
              </label>
              <select
                id="signup-link-destination"
                value={form.choice}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    choice: e.target.value as DestinationChoice,
                  }))
                }
                className={`${INPUT_CLASS} px-4`}
              >
                {SIGNUP_LINK_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {t(`destinations.${preset.key}`)}
                  </option>
                ))}
                <option value="custom">{t("destinations.custom")}</option>
              </select>
            </div>

            {form.choice === "custom" ? (
              <div className="space-y-2">
                <label htmlFor="signup-link-path" className={LABEL_CLASS}>
                  {t("customPathField")}
                </label>
                <input
                  id="signup-link-path"
                  type="text"
                  maxLength={300}
                  value={form.customPath}
                  placeholder={t("customPathPlaceholder")}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customPath: e.target.value }))
                  }
                  aria-describedby="signup-link-path-hint"
                  className={INPUT_CLASS}
                />
                <p
                  id="signup-link-path-hint"
                  className="pl-1 text-[11px] font-medium leading-4 text-[#64748B]"
                >
                  {t("customPathHint")}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="signup-link-code" className={LABEL_CLASS}>
                {t("codeField")}
              </label>
              <input
                id="signup-link-code"
                type="text"
                maxLength={40}
                value={form.code}
                placeholder={t("codePlaceholder")}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toLowerCase() }))
                }
                aria-describedby="signup-link-code-hint"
                autoCapitalize="none"
                spellCheck={false}
                className={INPUT_CLASS}
              />
              <p
                id="signup-link-code-hint"
                className="pl-1 text-[11px] font-medium leading-4 text-[#64748B]"
              >
                {t("codeHint")}
              </p>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex h-[53px] min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-[14px] font-bold leading-[21px] text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)] disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("create")}
            </button>
          </div>
        </section>

        <section className="min-h-[329px] rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] sm:p-8">
          <h2 className="pb-6 text-[14px] font-bold leading-[21px] text-[#1E293B]">
            {t("activeLinks", { count: activeLinks.length })}
          </h2>
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            className="mb-4"
          />
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <Skeleton key={idx} className="h-[104px] w-full rounded-xl" />
              ))
            ) : filteredActiveLinks.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                {t("noActiveLinks")}
              </p>
            ) : (
              filteredActiveLinks.map((link) => {
                const isDeactivating = deactivatingId === link.id;
                return (
                  <div
                    key={link.id}
                    data-testid="signup-link-row"
                    className="rounded-xl border border-[#ECFDF5] bg-[#F8FAFC] px-4 py-4"
                  >
                    <p className="truncate text-[14px] font-bold leading-5 text-[#1E293B]">
                      {link.label}
                    </p>
                    <p className="mt-1 break-all font-mono text-[12px] leading-4 text-[#2563EB]">
                      {linkUrl(link.code)}
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-4 text-[#64748B]">
                      {t("leadsTo", {
                        destination: destinationLabel(link.destination),
                      })}
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => copy(link.code)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-[12px] font-bold leading-[18px] text-[#2563EB]"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {t("copy")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deactivate(link.id)}
                        disabled={isDeactivating}
                        className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-[12px] font-bold leading-[18px] text-[#EF4444] disabled:opacity-50"
                      >
                        {isDeactivating ? "..." : t("deactivate")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
