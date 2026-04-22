"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  Briefcase,
  Eye,
  MessageSquare,
  Star,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

const CATEGORY_LABEL: Record<string, string> = {
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  employment: "დასაქმება",
  handyman: "ხელოსანი",
  cleaning: "დალაგება",
  food: "კვება",
};

export default function ServiceDashboardPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    active: 0,
    views: 0,
    inquiries: 0,
    rating: 0,
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [svcRes, profRes, inqRes] = await Promise.all([
      supabase
        .from("services")
        .select("*")
        .eq("owner_id", user.id)
        .neq("category", "food")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("rating")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("sms_messages")
        .select("*", { count: "exact", head: true })
        .eq("to_user_id", user.id)
        .gte(
          "created_at",
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
        ),
    ]);

    const mine = svcRes.data ?? [];
    setServices(mine);
    setStats({
      active: mine.filter((s) => s.status === "active").length,
      views: mine.reduce((sum, s) => sum + (s.views_count ?? 0), 0),
      inquiries: inqRes.count ?? 0,
      rating: Number(profRes.data?.rating ?? 0),
    });
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function removeService(id: string) {
    await supabase.from("services").update({ status: "blocked" }).eq("id", id);
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "blocked" } : s)),
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            სერვისის კაბინეტი
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            მართე განცხადებები, უპასუხე მოთხოვნებს და გაააქტიურე VIP.
          </p>
        </div>
        <Link
          href="/create/service"
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.35)] hover:bg-[#1E40AF]"
        >
          <Plus className="h-4 w-4" />
          დამატება
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      >
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="აქტიური"
          value={stats.active}
          color="text-[#10B981]"
          bg="bg-[#ECFDF5]"
          loading={loading}
        />
        <StatTile
          icon={<Eye className="h-4 w-4" />}
          label="სულ ნახვა"
          value={stats.views.toLocaleString()}
          color="text-[#2563EB]"
          bg="bg-[#EFF6FF]"
          loading={loading}
        />
        <StatTile
          icon={<MessageSquare className="h-4 w-4" />}
          label="მოთხოვნა (თვე)"
          value={stats.inquiries}
          color="text-[#F97316]"
          bg="bg-[#FFF7ED]"
          loading={loading}
        />
        <StatTile
          icon={<Star className="h-4 w-4" fill="currentColor" />}
          label="რეიტინგი"
          value={stats.rating > 0 ? stats.rating.toFixed(1) : "—"}
          color="text-[#F59E0B]"
          bg="bg-[#FFFBEB]"
          loading={loading}
        />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-black text-[#0F172A]">
            ჩემი განცხადებები
          </h2>
          <span className="text-[12px] font-bold text-[#64748B]">
            {services.length} სულ
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px] rounded-[20px]" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-16 text-center">
            <Briefcase className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-[13px] font-bold text-[#0F172A]">
              ჯერ არ გაქვს განცხადებები
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              დაამატე პირველი სერვისი და მიიღე მოთხოვნები.
            </p>
            <Link
              href="/create/service"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E40AF]"
            >
              <Plus className="h-4 w-4" />
              დაამატე სერვისი
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {services.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                  {(s.photos ?? [])[0] ? (
                    <Image
                      src={(s.photos ?? [])[0]}
                      alt={s.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#94A3B8]">
                      <Briefcase className="h-5 w-5" />
                    </div>
                  )}
                  {s.is_vip && (
                    <span className="absolute left-1 top-1 rounded bg-[#F97316] px-1 py-0.5 text-[8px] font-black uppercase text-white">
                      VIP
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[14px] font-black text-[#0F172A]">
                      {s.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        s.status === "active"
                          ? "bg-[#DCFCE7] text-[#16A34A]"
                          : "bg-[#F1F5F9] text-[#64748B]"
                      }`}
                    >
                      {s.status === "active" ? "აქტიური" : "გაუქმებული"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[#94A3B8]">
                    <span>{CATEGORY_LABEL[s.category] ?? s.category}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-3 w-3" />
                      {s.views_count ?? 0}
                    </span>
                    {s.price != null && (
                      <>
                        <span>·</span>
                        <span className="font-bold text-[#0F172A]">
                          {formatPrice(Number(s.price))}
                          {s.price_unit && ` / ${s.price_unit}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/services/${s.id}`}
                    className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#2563EB]"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeService(s.id)}
                    className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
  bg,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  bg: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${color}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <p className={`mt-1 text-[22px] font-black leading-[28px] ${color}`}>
          {value}
        </p>
      )}
    </div>
  );
}
