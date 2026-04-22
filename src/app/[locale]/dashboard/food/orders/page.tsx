"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Link as LinkIcon,
  QrCode,
  Plus,
  Megaphone,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import NewPromotionModal from "@/components/shared/NewPromotionModal";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

interface Promotion {
  id: string;
  title: string;
  description: string;
  is_vip?: boolean;
  created_at?: string;
}

interface MenuData {
  url?: string;
  promotions?: Promotion[];
}

export default function FoodOrdersPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuUrl, setMenuUrl] = useState("");
  const [balance, setBalance] = useState(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [svcRes, balRes] = await Promise.all([
      supabase
        .from("services")
        .select("*")
        .eq("owner_id", user.id)
        .eq("category", "food")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (svcRes.data) {
      setService(svcRes.data);
      const menuData = (svcRes.data.menu as unknown as MenuData | null) ?? {};
      setMenuUrl(menuData.url ?? "");
    }
    if (balRes.data) setBalance(Number(balRes.data.amount ?? 0));
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const menuData: MenuData =
    (service?.menu as unknown as MenuData | null) ?? {};
  const promotions = menuData.promotions ?? [];

  async function saveMenuUrl() {
    if (!service) return;
    const next: MenuData = { ...menuData, url: menuUrl };
    await supabase
      .from("services")
      .update({ menu: next as unknown as never })
      .eq("id", service.id);
    setService({ ...service, menu: next as unknown as never });
  }

  async function addPromotion(data: { title: string; description: string }) {
    if (!service) return;
    const nextPromos: Promotion[] = [
      ...promotions,
      {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description,
        is_vip: true,
        created_at: new Date().toISOString(),
      },
    ];
    const nextMenu: MenuData = { ...menuData, promotions: nextPromos };
    await supabase
      .from("services")
      .update({ menu: nextMenu as unknown as never })
      .eq("id", service.id);
    setService({ ...service, menu: nextMenu as unknown as never });
  }

  async function deletePromotion(id: string) {
    if (!service) return;
    const nextPromos = promotions.filter((p) => p.id !== id);
    const nextMenu: MenuData = { ...menuData, promotions: nextPromos };
    await supabase
      .from("services")
      .update({ menu: nextMenu as unknown as never })
      .eq("id", service.id);
    setService({ ...service, menu: nextMenu as unknown as never });
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {service?.title ?? "რესტორანი"}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მართე მენიუ, სტუმრების ციფრული ხედი და აქციები.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-[16px] font-black text-[#0F172A]">
          მენიუ და შეთავაზებები
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#DC2626]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  PDF მენიუ
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  ატვირთე მენიუ PDF ფორმატში
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-[11px] font-medium text-[#64748B]">
              მაქს. ზომა: 10 მბ
            </p>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B]">
              <Plus className="h-4 w-4" />
              მენიუს ატვირთვა
              <input type="file" accept="application/pdf" className="hidden" />
            </label>
          </div>

          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  ციფრული მენიუ (URL)
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  ბმული ონლაინ მენიუზე
                </p>
              </div>
            </div>
            <input
              type="url"
              value={menuUrl}
              onChange={(e) => setMenuUrl(e.target.value)}
              placeholder="https://..."
              className="mt-4 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[12px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveMenuUrl}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E40AF]"
              >
                <QrCode className="h-4 w-4" />
                შენახვა და QR კოდის გენერაცია
              </button>
              {menuUrl && (
                <a
                  href={menuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-black text-[#0F172A]">
              ჩემი შეთავაზებები
            </h2>
            <p className="mt-0.5 text-[12px] text-[#94A3B8]">
              აქცია გამოჩნდება მთავარ გვერდზე VIP სექციაში.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(249,115,22,0.45)] hover:bg-[#EA580C]"
          >
            <Plus className="h-4 w-4" />
            ახალი შეთავაზება
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-12 text-center">
            <Megaphone className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-[13px] font-bold text-[#0F172A]">
              ჯერ აქციები არ გაქვს
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              დაამატე VIP შეთავაზება და მიიღე მეტი ნახვა.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {promotions.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#F97316]">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-black text-[#0F172A]">
                      {p.title}
                    </p>
                    {p.is_vip && (
                      <span className="rounded-md bg-[#F97316] px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[#64748B]">
                    {p.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deletePromotion(p.id)}
                  className="shrink-0 rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  aria-label="delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      <NewPromotionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        balance={balance}
        onSubmit={addPromotion}
      />
    </div>
  );
}
