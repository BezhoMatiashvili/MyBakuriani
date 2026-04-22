"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { leadsClient } from "@/lib/supabase/leads";
import { Skeleton } from "@/components/ui/skeleton";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  textColor: string;
}

interface SourceRow {
  label: string;
  value: number;
  percent: number;
  color: string;
}

export default function SellerAnalyticsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState(0);
  const [favorites] = useState(0);
  const [contactReveals] = useState(0);
  const [realContacts, setRealContacts] = useState(0);
  const [closed, setClosed] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function fetch() {
      const [propsRes, leadsRes] = await Promise.all([
        supabase
          .from("properties")
          .select("views_count")
          .eq("owner_id", user!.id)
          .eq("is_for_sale", true),
        leadsClient(supabase)
          .from("leads")
          .select("stage", { count: "exact" })
          .eq("owner_id", user!.id),
      ]);

      if (propsRes.data) {
        setViews(
          propsRes.data.reduce(
            (s, r) => s + Number((r.views_count as number) ?? 0),
            0,
          ),
        );
      }
      if (!leadsRes.error && leadsRes.data) {
        const rows = leadsRes.data as { stage: string }[];
        setRealContacts(
          rows.filter(
            (r) =>
              r.stage === "contacted" ||
              r.stage === "shown" ||
              r.stage === "negotiating",
          ).length,
        );
        setClosed(rows.filter((r) => r.stage === "closed").length);
      }
      setLoading(false);
    }

    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const funnel: FunnelStage[] = [
    {
      label: "ობიექტის ნახვა",
      value: views,
      color: "bg-[#E2E8F0]",
      textColor: "text-[#0F172A]",
    },
    {
      label: "რჩეულებში დამატება",
      value: favorites,
      color: "bg-[#60A5FA]",
      textColor: "text-white",
    },
    {
      label: "ნომრის / WA ნახვა",
      value: contactReveals,
      color: "bg-[#2563EB]",
      textColor: "text-white",
    },
    {
      label: "რეალური კონტაქტი",
      value: realContacts,
      color: "bg-[#10B981]",
      textColor: "text-white",
    },
    {
      label: "გაყიდვა / გაფორმდა",
      value: closed,
      color: "bg-[#047857]",
      textColor: "text-white",
    },
  ];

  const maxValue = Math.max(1, ...funnel.map((s) => s.value));

  const sources: SourceRow[] = [
    { label: "Smart Match", value: 0, percent: 0, color: "bg-[#2563EB]" },
    { label: "პირდაპირი ძიება", value: 0, percent: 0, color: "bg-[#10B981]" },
    { label: "რეკომენდაცია", value: 0, percent: 0, color: "bg-[#F59E0B]" },
    { label: "სხვა", value: 0, percent: 0, color: "bg-[#94A3B8]" },
  ];

  const metrics: { label: string; value: string; sub: string }[] = [
    {
      label: "საშ. ნახვა / ობიექტი",
      value: views
        ? Math.round(views / Math.max(1, funnel.length)).toString()
        : "0",
      sub: "ბოლო 30 დღე",
    },
    {
      label: "კონვერსია (ნახვა → კონტაქტი)",
      value: views ? `${((realContacts / views) * 100).toFixed(1)}%` : "0%",
      sub: "ბოლო 30 დღე",
    },
    {
      label: "საშ. პასუხის დრო",
      value: "—",
      sub: "ჯერ არ არის საკმარისი მონაცემი",
    },
    {
      label: "დახურვის განაკვეთი",
      value: realContacts
        ? `${((closed / realContacts) * 100).toFixed(1)}%`
        : "0%",
      sub: "ბოლო 30 დღე",
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          ანალიტიკა და მარკეტინგი
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          კლიენტების მოზიდვის ძაბრი და ეფექტურობა
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-8"
      >
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-[#94A3B8]">
          Lead Generation Funnel
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {funnel.map((stage, idx) => {
                const widthPct = Math.max(
                  12,
                  Math.round((stage.value / maxValue) * 100),
                );
                return (
                  <div
                    key={stage.label}
                    className="grid grid-cols-[minmax(120px,1fr)_2fr] items-center gap-4"
                  >
                    <p className="text-right text-[12px] font-semibold text-[#0F172A]">
                      {stage.label}
                    </p>
                    <motion.div
                      initial={{ scaleX: 0, transformOrigin: "left" }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.05 * idx, duration: 0.4 }}
                      className={`flex h-11 items-center rounded-xl ${stage.color} px-4`}
                      style={{ width: `${widthPct}%` }}
                    >
                      <span
                        className={`text-[13px] font-black ${stage.textColor}`}
                      >
                        {stage.value.toLocaleString("ka-GE")}
                      </span>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h3 className="text-[14px] font-black text-[#0F172A]">
            ლიდების წყაროები
          </h3>
          <div className="mt-5 space-y-4">
            {sources.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span className="text-[#0F172A]">{s.label}</span>
                  <span className="text-[#64748B]">
                    {s.value} ({s.percent}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className={`h-full ${s.color}`}
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#94A3B8]">
            Performance metrics
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] p-4"
              >
                <p className="text-[11px] font-semibold text-[#64748B]">
                  {m.label}
                </p>
                <p className="mt-2 text-[22px] font-black leading-none text-[#0F172A]">
                  {m.value}
                </p>
                <p className="mt-1.5 text-[10px] text-[#94A3B8]">{m.sub}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
