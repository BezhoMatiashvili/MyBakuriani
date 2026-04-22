"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Phone } from "lucide-react";
import CleanerDetailModal, {
  type CleanerDetail,
} from "@/components/renter/CleanerDetailModal";

interface Cleaner {
  id: string;
  name: string;
  initials: string;
  shortId: string;
  phone: string;
  rating: number;
  available: boolean;
  priceStandard: number;
  priceGeneral: number;
}

// TODO: wire to real cleaners table — mock data matches Figma reference.
const MOCK_CLEANERS: Cleaner[] = [
  {
    id: "1",
    name: "ნინო მაისურაძე",
    initials: "ნ.მ",
    shortId: "ST-8802",
    phone: "599 11 22 33",
    rating: 5,
    available: true,
    priceStandard: 30,
    priceGeneral: 50,
  },
];

export default function RenterCleanersPage() {
  const [selected, setSelected] = useState<CleanerDetail | null>(null);

  const subtitle =
    MOCK_CLEANERS.length === 0
      ? "გაუგზავნეთ დასუფთავების დავალებები მარტივად."
      : `გაუგზავნეთ დასუფთავების დავალებები ${MOCK_CLEANERS.length} კლიკით.`;

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
        {MOCK_CLEANERS.map((cleaner) => (
          <article
            key={cleaner.id}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[13px] font-extrabold text-[#2563EB]">
                {cleaner.initials}
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
                    initials: cleaner.initials,
                    shortId: cleaner.shortId,
                    rating: cleaner.rating,
                    available: cleaner.available,
                    priceStandard: cleaner.priceStandard,
                    priceGeneral: cleaner.priceGeneral,
                  })
                }
                className="rounded-xl bg-[#2563EB] py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF]"
              >
                გამოძახება
              </button>
            </div>
          </article>
        ))}

        {MOCK_CLEANERS.length === 0 && (
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
    </div>
  );
}
