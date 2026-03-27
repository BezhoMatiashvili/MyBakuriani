"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white">
      {/* Image placeholder */}
      <Skeleton className="aspect-[4/3] w-full rounded-none" />

      {/* Content placeholder */}
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}
