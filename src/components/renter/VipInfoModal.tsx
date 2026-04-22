"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Rocket, Ticket, Percent, MessageSquare } from "lucide-react";

export type VipInfoTier = "super-vip" | "vip" | "discount" | "sms";

const TIER_CONFIG: Record<
  VipInfoTier,
  {
    title: string;
    chipBg: string;
    chipText: string;
    icon: typeof Rocket;
    iconColor: string;
    what: string;
    how: string;
  }
> = {
  "super-vip": {
    title: "SUPER VIP",
    chipBg: "bg-[#DCFCE7]",
    chipText: "text-[#16A34A]",
    icon: Rocket,
    iconColor: "text-[#16A34A]",
    what: "ეს არის მაქსიმალური დაწინაურების პაკეტი. თქვენი ობიექტი გამოჩნდება ძიების პირველ ადგილებზე და მთავარ გვერდზე SUPER VIP სექციაში 24 საათის განმავლობაში.",
    how: "შეძენის შემდეგ სისტემა ავტომატურად გადაწევს თქვენს განცხადებას დაწინაურების სიაში. ობიექტი ჩანს პრიორიტეტული ბეჯით და მიიღებს მაქსიმალურ ხილვადობას ნებისმიერი ძიების დროს.",
  },
  vip: {
    title: "VIP სტატუსი",
    chipBg: "bg-[#FCE7F3]",
    chipText: "text-[#BE185D]",
    icon: Ticket,
    iconColor: "text-[#BE185D]",
    what: "VIP სტატუსი აძლევს თქვენს ობიექტს ყურადღების მისაქცევ ფერად ბეჯს და დაიკავებს უპირატეს პოზიციას მთავარი სიის გვერდზე.",
    how: "სტატუსის შეძენის შემდეგ VIP ბეჯი ავტომატურად ეკიდება ობიექტს საჯარო ხედში. სტატუსის ხანგრძლივობის მართვა შესაძლებელია „ბალანსი და VIP“ გვერდიდან.",
  },
  discount: {
    title: "ფასდაკლების ბეჯი",
    chipBg: "bg-[#DCFCE7]",
    chipText: "text-[#16A34A]",
    icon: Percent,
    iconColor: "text-[#16A34A]",
    what: "ფასდაკლების ბეჯი ობიექტს ანიჭებს კაშკაშა ნიშანს, რომელიც სტუმარს ამცნობს განსაკუთრებულ შეთავაზებას.",
    how: "ბეჯის გააქტიურებისას შეარჩიეთ ფასდაკლების პროცენტი. ობიექტი გამოჩნდება „ცხელი შეთავაზებების“ სექციაში მაძიებელი სტუმრებისთვის.",
  },
  sms: {
    title: "SMS პაკეტი",
    chipBg: "bg-[#DBEAFE]",
    chipText: "text-[#2563EB]",
    icon: MessageSquare,
    iconColor: "text-[#2563EB]",
    what: "SMS პაკეტი გაძლევთ შესაძლებლობას გაუგზავნოთ სტუმრებს სერვისული და სარეკლამო შეტყობინებები მათ მობილურ ნომერზე.",
    how: "პაკეტი დაემატება თქვენს ანგარიშს და ის იხარჯება ავტომატურად ნებისმიერ დაგზავნაზე. დარჩენილი რაოდენობა ჩანს ზედა პანელზე და „ბალანსი და VIP“ გვერდზე.",
  },
};

interface VipInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
}

export default function VipInfoModal({
  isOpen,
  onClose,
  tier,
}: VipInfoModalProps) {
  const config = TIER_CONFIG[tier];
  const IconCmp = config.icon;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 w-full max-w-[640px] rounded-[24px] bg-white p-7 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header chip */}
            <div
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ${config.chipBg} ${config.chipText}`}
            >
              <IconCmp className="h-4 w-4" strokeWidth={2.3} />
              <span className="text-[13px] font-black uppercase tracking-wide">
                {config.title}
              </span>
            </div>

            {/* Two columns */}
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-[14px] font-black text-[#0F172A]">
                  რა არის?
                </h3>
                <p className="mt-2 text-[13px] leading-[20px] text-[#475569]">
                  {config.what}
                </p>
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[#0F172A]">
                  როგორ მუშაობს?
                </h3>
                <p className="mt-2 text-[13px] leading-[20px] text-[#475569]">
                  {config.how}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
