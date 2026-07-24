"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Search,
  Link2,
  Building2,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";

type Org = {
  id: string;
  brand_name: string;
  phone: string | null;
  logo_url: string | null;
};

export default function OrganizationLinkPage() {
  const t = useTranslations("Organizations");
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Org[]>([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient();
      const safeQ = sanitizeQuery(q);
      const { data } = await supabase
        .from("organizations")
        .select("id, brand_name, phone, logo_url")
        .eq("status", "active")
        .or(`brand_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
        .limit(20);
      setResults((data as Org[]) ?? []);
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleLink(orgId: string) {
    if (!user) return;
    setBusyId(orgId);
    const supabase = createClient();
    const { error } = await supabase.rpc("request_organization_membership", {
      p_org_id: orgId,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRequested((prev) => new Set(prev).add(orgId));
    toast.success(t("linkRequested"));
  }

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/seller/organizations")}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] lg:h-10 lg:w-10"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-[24px] font-black tracking-[-0.5px] text-[#0F172A]">
          {t("linkPageTitle")}
        </h1>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <label className="text-[13px] font-bold text-[#334155]">
          {t("searchLabel")}
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-[52px] w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {searching && (
          <div className="flex items-center justify-center py-6 text-[#94A3B8]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="py-6 text-center text-sm font-medium text-[#94A3B8]">
            {t("noResults")}
          </p>
        )}
        {!searching && query.trim().length < 2 && (
          <p className="py-6 text-center text-sm font-medium text-[#94A3B8]">
            {t("searchHint")}
          </p>
        )}
        {results.map((org) => {
          const done = requested.has(org.id);
          return (
            <div
              key={org.id}
              className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFF6FF]">
                {org.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={org.logo_url}
                    alt={org.brand_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 className="h-5 w-5 text-[#2563EB]" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-[#0F172A]">
                  {org.brand_name}
                </p>
                {org.phone && (
                  <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                    {t("telLabel")} {org.phone}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={done || busyId === org.id}
                onClick={() => handleLink(org.id)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#94A3B8] lg:h-[40px]"
              >
                {busyId === org.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : done ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t("linkRequested")}
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    {t("linkBtn")}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Link
          href="/dashboard/seller/organizations"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("cancel")}
        </Link>
      </div>
    </div>
  );
}
