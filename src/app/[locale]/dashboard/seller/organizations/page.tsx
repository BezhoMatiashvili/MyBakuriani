"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus, Link2, Building2, Users, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { SkierLoader } from "@/components/shared/SkierLoader";

type Membership = {
  role: string;
  status: string;
  org: {
    id: string;
    brand_name: string;
    status: string;
    logo_url: string | null;
  } | null;
};

export default function OrganizationsPage() {
  const t = useTranslations("Organizations");
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("role, status, organizations(id, brand_name, status, logo_url)")
        .eq("user_id", user.id)
        .eq("status", "approved");
      if (cancelled) return;
      const rows: Membership[] = (data ?? []).map((m) => {
        const orgRaw = (m as { organizations: unknown }).organizations;
        const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
        return {
          role: (m as { role: string }).role,
          status: (m as { status: string }).status,
          org: (org as Membership["org"]) ?? null,
        };
      });
      setMemberships(rows.filter((r) => r.org));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const statusBadge = (status: string) => {
    if (status === "active")
      return (
        <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-bold text-[#166534]">
          {t("statusActive")}
        </span>
      );
    if (status === "rejected")
      return (
        <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[11px] font-bold text-[#B91C1C]">
          {t("statusRejected")}
        </span>
      );
    return (
      <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
        {t("statusPending")}
      </span>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <h1 className="text-[28px] font-black tracking-[-0.6px] text-[#0F172A]">
        {t("pageTitle")}
      </h1>
      <p className="mt-1.5 text-[15px] font-medium text-[#64748B]">
        {t("pageSubtitle")}
      </p>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      ) : (
        <>
          {memberships.length > 0 && (
            <div className="mt-8 space-y-3">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]">
                {t("myCompaniesTitle")}
              </h2>
              {memberships.map((m) => (
                <Link
                  key={m.org!.id}
                  href={`/dashboard/seller/organizations/${m.org!.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#CBD5E1]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFF6FF]">
                    {m.org!.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.org!.logo_url}
                        alt={m.org!.brand_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-5 w-5 text-[#2563EB]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[#0F172A]">
                      {m.org!.brand_name}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                      {m.role === "owner" ? t("roleOwner") : t("roleAgent")}
                    </p>
                  </div>
                  {statusBadge(m.org!.status)}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {/* Register a company */}
            <div className="flex flex-col items-center rounded-[24px] border border-[#E2E8F0] bg-white p-8 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EFF6FF]">
                <Building2 className="h-8 w-8 text-[#2563EB]" />
              </span>
              <h3 className="mt-5 text-[20px] font-black text-[#0F172A]">
                {t("registerCardTitle")}
              </h3>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#64748B]">
                {t("registerCardDesc")}
              </p>
              <Link
                href="/dashboard/seller/organizations/new"
                className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-[15px] font-bold text-white transition-colors hover:bg-[#1E293B]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                {t("registerCardBtn")}
              </Link>
            </div>

            {/* Link as agent */}
            <div className="flex flex-col items-center rounded-[24px] border border-[#E2E8F0] bg-white p-8 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#DCFCE7]">
                <Users className="h-8 w-8 text-[#16A34A]" />
              </span>
              <h3 className="mt-5 text-[20px] font-black text-[#0F172A]">
                {t("linkCardTitle")}
              </h3>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#64748B]">
                {t("linkCardDesc")}
              </p>
              <Link
                href="/dashboard/seller/organizations/link"
                className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white text-[15px] font-bold text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
              >
                <Link2 className="h-4 w-4" strokeWidth={2.5} />
                {t("linkCardBtn")}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
