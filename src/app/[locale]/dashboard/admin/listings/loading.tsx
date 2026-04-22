import { Skeleton } from "@/components/ui/skeleton";

export default function AdminListingsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  );
}
