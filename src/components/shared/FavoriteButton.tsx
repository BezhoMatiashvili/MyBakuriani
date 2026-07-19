"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  pressed: boolean;
  onPressedChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  size?: "compact" | "card";
  className?: string;
}

export function FavoriteButton({
  pressed,
  onPressedChange,
  disabled = false,
  ariaLabel,
  size = "card",
  className,
}: FavoriteButtonProps) {
  return (
    <button
      type="button"
      data-slot="favorite-button"
      data-size={size}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPressedChange();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-creation shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creation/35 focus-visible:ring-offset-2 hover:bg-creation hover:text-white disabled:pointer-events-none disabled:opacity-60",
        size === "card" ? "size-11" : "size-8",
        pressed && "border-creation bg-creation text-white",
        className,
      )}
    >
      <Heart className={cn(size === "card" ? "size-5" : "size-4", pressed && "fill-current")} />
    </button>
  );
}
