import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ListingBadgeVariant = "sale" | "vip" | "discount" | "new" | "verified" | "status";

interface ListingBadgeProps {
  variant: ListingBadgeVariant;
  children?: ReactNode;
  className?: string;
}

export function ListingBadge({ variant, children, className }: ListingBadgeProps) {
  const content = children ?? (variant === "sale" ? "For sale" : variant === "vip" ? "VIP" : undefined);
  return (
    <span
      data-slot="listing-badge"
      data-variant={variant}
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.08)]",
        variant === "sale" && "bg-listing-action",
        variant === "vip" && "bg-creation",
        variant === "discount" && "bg-creation",
        variant === "new" && "bg-[#2563EB]",
        variant === "verified" && "bg-[#2563EB]",
        variant === "status" && "bg-[#64748B]",
        className,
      )}
    >
      {variant === "vip" && <Star className="size-3 fill-current" />}
      {content}
    </span>
  );
}
