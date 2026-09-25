import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level skeleton for the public listing detail pages.
 *
 * Mirrors the real page geometry so a soft navigation into a listing paints the
 * page's shape immediately instead of a full-screen spinner, and so the hand-off
 * to the real content doesn't jump. Every class here is copied from the detail
 * clients rather than approximated — an off-by-100px skeleton causes the jolt it
 * exists to prevent.
 *
 * The breakpoint is `lg:` because that is where both galleries actually switch
 * from the mobile rail to the desktop grid; an `md:` skeleton would show the
 * desktop shape on tablets that still render the rail.
 *
 * `variant` exists because the two galleries do not share a layout:
 *  - "3col" → PhotoGallery     (apartments/hotels/sales): 1.5fr 1fr 1fr, 4 tiles,
 *             and an <h1> block ABOVE the gallery; content grid `mt-8 gap-12`.
 *  - "2col" → FoodPhotoGallery (food): 2fr 1fr, 2 tiles, no title above the
 *             gallery; content grid `mt-6 gap-8`.
 */
export function DetailSkeleton({
  variant = "3col",
}: {
  variant?: "3col" | "2col";
}) {
  const isFood = variant === "2col";

  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto max-w-7xl px-4 py-6 sm:py-8"
    >
      {isFood ? (
        /* Food: back + share + favourite on one `mb-4` row (FoodDetailClient) */
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-11 w-11 rounded-full lg:h-10 lg:w-10" />
            <Skeleton className="h-11 w-11 rounded-full lg:h-10 lg:w-10" />
          </div>
        </div>
      ) : (
        <>
          {/* Back nav — real is `mb-6 ... text-sm` */}
          <Skeleton className="mb-6 h-5 w-24" />

          {/* Title + meta row. Food renders its title below the gallery, so
              this block only exists for the 3col routes. */}
          <div className="mb-6">
            <Skeleton className="h-[34px] w-3/4 sm:h-[42px]" />
            <Skeleton className="mt-2 h-5 w-1/2" />
          </div>

          {/* Share / favourite row that lives inside PhotoGallery */}
          <div className="mb-3 flex items-center justify-end gap-2">
            <Skeleton className="h-11 w-11 rounded-full lg:h-10 lg:w-10" />
            <Skeleton className="h-11 w-11 rounded-full lg:h-10 lg:w-10" />
          </div>
        </>
      )}

      {/* Mobile: the single full-width rail slide */}
      <Skeleton className="aspect-[8/5] w-full rounded-[20px] lg:hidden" />

      {/* Desktop: the real gallery grid */}
      <div
        className={`hidden grid-rows-2 gap-2 lg:grid ${
          isFood ? "grid-cols-[2fr_1fr]" : "grid-cols-[1.5fr_1fr_1fr]"
        }`}
      >
        <Skeleton className="row-span-2 aspect-[4/3] rounded-l-[24px]" />
        {isFood ? (
          <>
            <Skeleton className="aspect-[3/2] rounded-tr-[24px]" />
            <Skeleton className="aspect-[3/2] rounded-br-[24px]" />
          </>
        ) : (
          <>
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3] rounded-tr-[24px]" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3] rounded-br-[24px]" />
          </>
        )}
      </div>

      {/* Content grid */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-3 ${
          isFood ? "mt-6 gap-8" : "mt-8 gap-12"
        }`}
      >
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
