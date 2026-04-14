import SkeletonCard from "@/components/cards/SkeletonCard";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Title skeleton */}
      <div className="mb-8 h-8 w-48 animate-pulse rounded-lg bg-brand-surface-muted" />

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
