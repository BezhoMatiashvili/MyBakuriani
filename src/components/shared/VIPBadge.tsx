"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type VIPLevel = "vip" | "super_vip";

interface VIPBadgeProps {
  level: VIPLevel;
  className?: string;
}

export default function VIPBadge({ level, className }: VIPBadgeProps) {
  const isSuper = level === "super_vip";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white",
        isSuper
          ? "bg-gradient-to-r from-purple-600 to-purple-400"
          : "bg-gradient-to-r from-amber-500 to-yellow-400",
        className,
      )}
    >
      {isSuper && <Sparkles className="size-3" />}
      {isSuper ? "SUPER VIP" : "VIP"}
    </span>
  );
}
