import { Skeleton } from "@/components/ui/skeleton";

export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Back nav */}
      <Skeleton className="mb-6 h-5 w-24" />

      {/* Photo gallery skeleton */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <Skeleton className="aspect-[16/9] rounded-l-2xl md:col-span-2 md:row-span-2" />
        <Skeleton className="hidden aspect-[4/3] md:block" />
        <Skeleton className="hidden aspect-[4/3] rounded-tr-2xl md:block" />
        <Skeleton className="hidden aspect-[4/3] md:block" />
        <Skeleton className="hidden aspect-[4/3] rounded-br-2xl md:block" />
      </div>

      {/* Content skeleton */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          {/* Amenities grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
