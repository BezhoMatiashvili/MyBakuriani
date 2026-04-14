"use client";
import { Star } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface ReviewCardProps {
  displayName: string;
  rating: number;
  comment: string;
  createdAt: string;
}
const avatarColors = [
  "bg-brand-accent",
  "bg-brand-vip",
  "bg-brand-vip-super",
  "bg-brand-success",
  "bg-brand-error",
];

export default function ReviewCard({
  displayName,
  rating,
  comment,
  createdAt,
}: ReviewCardProps) {
  const initial = displayName.charAt(0).toUpperCase();
  const color = avatarColors[displayName.charCodeAt(0) % avatarColors.length];
  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-4 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-bold text-[#1E293B]">
              {displayName}
            </span>
            <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
              {formatDate(createdAt)}
            </span>
          </div>
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${i < rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#94A3B8]/30"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-[13px] font-medium leading-[23px] text-[#64748B]">
            &ldquo;{comment}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
