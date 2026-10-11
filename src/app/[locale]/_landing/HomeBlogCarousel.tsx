"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

const AUTO_ADVANCE_MS = 5000;
// A touch, wheel, key press or arrow/dot press holds the rotation this long.
const USER_HOLD_MS = 8000;

const ARROW_BUTTON_CLASSNAME =
  "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1A202C] shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-transform hover:scale-105 active:scale-95 lg:flex";

/** Scroll positions the rail can rest at: each card's snap start, clamped to the end. */
function snapStops(rail: HTMLElement): number[] {
  const max = Math.max(rail.scrollWidth - rail.clientWidth, 0);
  const padding = parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;
  const railLeft = rail.getBoundingClientRect().left;
  const stops: number[] = [];
  for (const item of Array.from(rail.children)) {
    const start =
      rail.scrollLeft + item.getBoundingClientRect().left - railLeft - padding;
    const stop = Math.round(Math.min(Math.max(start, 0), max));
    if (stops.length === 0 || stop - stops[stops.length - 1] > 2) {
      stops.push(stop);
    }
  }
  return stops;
}

/**
 * Home blog rail: one card (plus the next one peeking) on phones, three on
 * desktop. It slides to the next card every few seconds while it is on screen
 * and loops back to the newest post; hover, focus, a touch or a press holds
 * it, and reduced motion turns the rotation off. Native scrolling keeps swipe
 * and snap exactly as on the other home rails (`MobileRail`).
 */
export default function HomeBlogCarousel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const t = useTranslations("HotOffersCarousel");
  const reduceMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const [stops, setStops] = useState<number[]>([0]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const heldUntil = useRef(0);
  const hovered = useRef(false);
  const focused = useRef(false);
  const onScreen = useRef(false);
  const count = Children.count(children);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const next = snapStops(rail);
    setStops((prev) =>
      prev.length === next.length && prev.every((v, i) => v === next[i])
        ? prev
        : next,
    );
    let nearest = 0;
    next.forEach((stop, i) => {
      if (
        Math.abs(stop - rail.scrollLeft) <
        Math.abs(next[nearest] - rail.scrollLeft)
      ) {
        nearest = i;
      }
    });
    activeRef.current = nearest;
    setActive(nearest);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    rail.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(rail);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry.isIntersecting;
      },
      { threshold: 0.5 },
    );
    intersectionObserver.observe(rail);
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [measure, count]);

  const scrollToStop = useCallback(
    (index: number) => {
      const rail = railRef.current;
      if (!rail || stops.length === 0) return;
      const target = (index + stops.length) % stops.length;
      rail.scrollTo({
        left: stops[target],
        behavior: reduceMotion ? "auto" : "smooth",
      });
    },
    [stops, reduceMotion],
  );

  useEffect(() => {
    if (reduceMotion || stops.length < 2) return;
    const timer = window.setInterval(() => {
      if (
        document.hidden ||
        !onScreen.current ||
        hovered.current ||
        focused.current ||
        Date.now() < heldUntil.current
      ) {
        return;
      }
      scrollToStop(activeRef.current + 1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, stops.length, scrollToStop]);

  const hold = () => {
    heldUntil.current = Date.now() + USER_HOLD_MS;
  };

  const press = (index: number) => {
    hold();
    scrollToStop(index);
  };

  const moving = stops.length > 1;

  return (
    <div>
      <div className="relative">
        <div
          ref={railRef}
          data-mobile-rail
          data-mobile-layout="preview"
          role="region"
          aria-label={label}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") hovered.current = true;
          }}
          onPointerLeave={() => {
            hovered.current = false;
          }}
          onPointerDown={hold}
          onWheel={hold}
          onKeyDown={hold}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              focused.current = false;
            }
          }}
          className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-4 px-4 pb-1 lg:-my-6 lg:gap-6 lg:py-6"
        >
          {Children.map(children, (child) => (
            <div
              data-mobile-rail-item
              className="w-[min(300px,calc(100vw-64px))] shrink-0 snap-start lg:w-[calc((100%-3rem)/3)]"
            >
              {child}
            </div>
          ))}
        </div>
        {moving && (
          <>
            <button
              type="button"
              onClick={() => press(active - 1)}
              aria-label={t("prev")}
              className={`${ARROW_BUTTON_CLASSNAME} -left-5 xl:-left-10`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => press(active + 1)}
              aria-label={t("next")}
              className={`${ARROW_BUTTON_CLASSNAME} -right-5 xl:-right-10`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {moving && (
        <div className="mt-2 flex justify-center lg:mt-4">
          {stops.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => press(idx)}
              aria-label={t("page", { page: idx + 1 })}
              aria-current={idx === active ? "true" : undefined}
              className="flex h-11 items-center px-1"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  idx === active ? "w-8 bg-[#1A202C]" : "w-2 bg-[#CBD5E1]"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
