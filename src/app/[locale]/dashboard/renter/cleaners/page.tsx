"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import CleanerDetailModal, {
  type CleanerDetail,
} from "@/components/renter/CleanerDetailModal";
import CleanerFormModal from "@/components/renter/CleanerFormModal";
import type { Tables } from "@/lib/types/database";

type RenterCleaner = Tables<"renter_cleaners">;

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

function deriveShortId(id: string): string {
  return `ST-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export default function RenterCleanersPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [cleaners, setCleaners] = useState<RenterCleaner[]>([]);
  const [selected, setSelected] = useState<CleanerDetail | null>(null);
  const [formModal, setFormModal] = useState<{
    open: boolean;
    cleaner: RenterCleaner | null;
  }>({ open: false, cleaner: null });

  const fetchCleaners = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("renter_cleaners")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setCleaners(data);
  }, [supabase, user]);

  useEffect(() => {
    fetchCleaners();
  }, [fetchCleaners]);

  const subtitle =
    cleaners.length === 0
      ? "გაუგზავნეთ დასუფთავების დავალებები მარტივად."
      : `გაუგზავნეთ დასუფთავების დავალებები ${cleaners.length} კლიკით.`;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            დამლაგებლები
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormModal({ open: true, cleaner: null })}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.15)] transition-colors hover:bg-[#1E293B]"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2.4} />
          დამატება
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-4 sm:max-w-md"
      >
        {cleaners.map((cleaner) => (
          <article
            key={cleaner.id}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[13px] font-extrabold text-[#2563EB]">
                {deriveInitials(cleaner.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
                  {cleaner.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
                  <Phone className="h-3 w-3 text-[#EF4444]" strokeWidth={2.4} />
                  {cleaner.phone}
                </p>
              </div>
              {cleaner.available && (
                <span className="inline-flex items-center rounded-lg bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-bold text-[#16A34A]">
                  თავისუფალია
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormModal({ open: true, cleaner })}
                className="rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                რედაქტირება
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelected({
                    id: cleaner.id,
                    name: cleaner.name,
                    initials: deriveInitials(cleaner.name),
                    shortId: deriveShortId(cleaner.id),
                    rating: 5,
                    available: cleaner.available ?? false,
                    priceStandard: cleaner.price_standard ?? 0,
                    priceGeneral: cleaner.price_general ?? 0,
                  })
                }
                className="rounded-xl bg-[#2563EB] py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF]"
              >
                გამოძახება
              </button>
            </div>
          </article>
        ))}

        {cleaners.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-[#E2E8F0] bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-[#64748B]">
              ჯერ არ დაგიმატებიათ დამლაგებელი
            </p>
          </div>
        )}
      </motion.div>

      <CleanerDetailModal
        isOpen={selected !== null}
        cleaner={selected}
        onClose={() => setSelected(null)}
      />

      <CleanerFormModal
        isOpen={formModal.open}
        cleaner={formModal.cleaner}
        onClose={() => setFormModal({ open: false, cleaner: null })}
        onSaved={fetchCleaners}
      />
    </div>
  );
}
