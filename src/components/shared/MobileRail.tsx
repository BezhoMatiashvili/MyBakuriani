import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileRailProps {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  desktopClassName?: string;
  desktopItemClassName?: string;
  label?: string;
}

/** Shared phone/tablet rail. The page keeps ownership of the desktop layout. */
export function MobileRail({
  children,
  className,
  itemClassName,
  desktopClassName,
  desktopItemClassName,
  label,
}: MobileRailProps) {
  return (
    <div
      data-mobile-rail
      data-mobile-layout="preview"
      aria-label={label}
      className={cn(
        "scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-4 px-4 pb-1",
        desktopClassName,
        className,
      )}
    >
      {Children.map(children, (child) => (
        <div
          data-mobile-rail-item
          className={cn(
            "w-[min(300px,calc(100vw-64px))] shrink-0 snap-start",
            desktopItemClassName,
            itemClassName,
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
