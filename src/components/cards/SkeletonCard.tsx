"use client";
import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <div className="flex items-center justify-between border-t border-[#F8FAFC] pt-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-10 rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}
