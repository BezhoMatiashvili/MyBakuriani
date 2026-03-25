import { Skeleton } from "@/components/ui/skeleton";

export default function SaleDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Photo gallery skeleton */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <Skeleton className="col-span-2 row-span-2 aspect-[4/3] w-full rounded-xl" />
        <Skeleton className="hidden aspect-[4/3] rounded-xl md:block" />
        <Skeleton className="hidden aspect-[4/3] rounded-xl md:block" />
        <Skeleton className="hidden aspect-[4/3] rounded-xl md:block" />
        <Skeleton className="hidden aspect-[4/3] rounded-xl md:block" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
