import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface AddListingButtonProps {
  label: string;
  className?: string;
  variant?: "desktop" | "icon" | "mobile" | "full";
  onClick?: () => void;
}

export function AddListingButton({ label, className, variant = "desktop", onClick }: AddListingButtonProps) {
  const iconOnly = variant === "icon";
  return (
    <Link href="/create" onClick={onClick} aria-label={iconOnly ? label : undefined} data-slot="add-listing-button" data-variant={variant}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl bg-creation font-bold text-white shadow-[0px_4px_6px_-1px_rgba(249,115,22,0.2),0px_2px_4px_-2px_rgba(249,115,22,0.2)] transition-colors hover:bg-creation-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creation/35 focus-visible:ring-offset-2",
        variant === "desktop" && "h-[40px] px-4 text-[13px]",
        variant === "icon" && "size-11",
        variant === "mobile" && "px-3 py-3 text-[14px]",
        variant === "full" && "w-full px-4 py-2.5 text-[13px]",
        className,
      )}>
      <Plus className="size-4" strokeWidth={2.4} />
      {!iconOnly && label}
    </Link>
  );
}
