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

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

export default function ReviewCard({
  displayName,
  rating,
  comment,
  createdAt,
}: ReviewCardProps) {
  const initial = displayName.charAt(0).toUpperCase();
  const colorClass = getAvatarColor(displayName);

  return (
    <div className="rounded-3xl border border-[#F1F5F9] bg-white p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${colorClass}`}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          {/* Name + date */}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-bold text-[#1E293B]">
              {displayName}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDate(createdAt)}
            </span>
          </div>

          {/* Stars */}
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i < rating
                    ? "fill-brand-warning text-brand-warning"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          {/* Comment */}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            &ldquo;{comment}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
