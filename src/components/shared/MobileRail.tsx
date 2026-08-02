import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileRailProps {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  desktopClassName?: string;
  desktopItemClassName?: string;
  label?: string;
  mobileLayout?: "preview" | "single-page";
}

/** Shared phone/tablet rail. The page keeps ownership of the desktop layout. */
export function MobileRail({
  children,
  className,
  itemClassName,
  desktopClassName,
  desktopItemClassName,
  label,
  mobileLayout = "preview",
}: MobileRailProps) {
  const isSinglePage = mobileLayout === "single-page";

  return (
    <div
      data-mobile-rail
      data-mobile-layout={mobileLayout}
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
            isSinglePage
              ? "flex w-[calc(100vw-32px)] shrink-0 snap-start items-stretch justify-center md:block md:w-[min(300px,calc(100vw-64px))]"
              : "w-[min(300px,calc(100vw-64px))] shrink-0 snap-start",
            desktopItemClassName,
            itemClassName,
          )}
        >
          {isSinglePage ? (
            <div
              data-mobile-rail-content
              className="h-full w-full max-w-[420px] md:max-w-none"
            >
              {child}
            </div>
          ) : (
            child
          )}
        </div>
      ))}
    </div>
  );
}
