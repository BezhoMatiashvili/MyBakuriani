import { Skeleton } from "@/components/ui/skeleton";

export default function RenterCalendarLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[520px] rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
