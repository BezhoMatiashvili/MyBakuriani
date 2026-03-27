"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface SmartMatchCardProps {
  notificationCount: number;
  onClick: () => void;
}

export default function SmartMatchCard({
  notificationCount,
  onClick,
}: SmartMatchCardProps) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-r from-brand-accent to-brand-vip-super p-5 text-left text-white transition-shadow hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold">Smart Match</h3>
          <p className="mt-0.5 text-sm text-white/80">ნახე შეთავაზებები</p>
        </div>

        {/* Notification badge */}
        {notificationCount > 0 && (
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-accent">
            {notificationCount}
            {/* Pulse ring */}
            <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
          </span>
        )}
      </div>
    </motion.button>
  );
}
