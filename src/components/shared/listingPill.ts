// The two pills a listing card can show, "newly added" (NewlyAddedBadge) and
// "verified owner" (OwnershipVerifiedBadge, card variant), share one height and
// one type style; each adds only its colour, icon and padding (designer spec of
// 2026-10-05: new #2563EB, verified #038033; on 2026-10-13 the owner replaced
// the new pill's wide px-6 with a sparkle icon and the verified pill's px-3).
// leading-4 keeps Georgian ascenders inside the line box where a caller lets a
// pill truncate.
export const LISTING_PILL =
  "inline-flex h-[22px] items-center whitespace-nowrap rounded-full text-[11px] font-semibold leading-4 text-white";
