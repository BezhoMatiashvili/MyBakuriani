import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ListingCardActionProps {
  children: ReactNode;
  className?: string;
}

export function ListingCardAction({ children, className }: ListingCardActionProps) {
  return (
    <span
      data-slot="listing-card-action"
      className={cn(
        "inline-flex items-center justify-center rounded-[12px] bg-listing-action px-4 py-2 text-[12px] font-bold text-white transition-colors group-hover:bg-listing-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-listing-action/35 focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
