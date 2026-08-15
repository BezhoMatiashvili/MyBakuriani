"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface MobileRailProps {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  desktopClassName?: string;
  desktopItemClassName?: string;
  label?: string;
  /** Show desktop-only prev/next scroll buttons when the row overflows. */
  desktopArrows?: boolean;
}

const ARROW_BUTTON_CLASSNAME =
  "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1A202C] shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0 lg:flex";

/** Shared phone/tablet rail. The page keeps ownership of the desktop layout. */
export function MobileRail({
  children,
  className,
  itemClassName,
  desktopClassName,
  desktopItemClassName,
  label,
  desktopArrows,
}: MobileRailProps) {
  const t = useTranslations("HotOffersCarousel");
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const childCount = Children.count(children);

  const updateScrollState = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 8);
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    if (!desktopArrows) return;
    const el = railRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [desktopArrows, updateScrollState, childCount]);

  const scrollByStep = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const rail = (
    <div
      ref={railRef}
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

  if (!desktopArrows) return rail;

  return (
    <div className="relative">
      {rail}
      <button
        type="button"
        onClick={() => scrollByStep(-1)}
        aria-label={t("prev")}
        disabled={!canScrollPrev}
        className={cn(ARROW_BUTTON_CLASSNAME, "-left-5 xl:-left-10")}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => scrollByStep(1)}
        aria-label={t("next")}
        disabled={!canScrollNext}
        className={cn(ARROW_BUTTON_CLASSNAME, "-right-5 xl:-right-10")}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
