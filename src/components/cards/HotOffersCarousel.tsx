"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import PropertyCard from "@/components/cards/PropertyCard";

type PropertyCardData = ComponentProps<typeof PropertyCard>;

interface HotOffersCarouselProps {
  properties: PropertyCardData[];
}

const AUTO_ADVANCE_MS = 5000;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

interface TrackProps {
  pages: PropertyCardData[][];
  gridClassName: string;
  reduceMotion: boolean;
}

function CarouselTrack({ pages, gridClassName, reduceMotion }: TrackProps) {
  const [page, setPage] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    setPage((current) => (current >= pages.length ? 0 : current));
  }, [pages.length]);

  useEffect(() => {
    if (reduceMotion || pages.length <= 1) return;
    const timer = setInterval(() => {
      if (!paused.current) {
        setPage((current) => (current + 1) % pages.length);
      }
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [pages.length, reduceMotion]);

  if (pages.length === 0) return null;

  if (pages.length === 1 || reduceMotion) {
    return (
      <div className={`grid gap-6 ${gridClassName}`}>
        {pages[0].map((p, i) => (
          <PropertyCard key={p.id} {...p} priority={i < 2} />
        ))}
      </div>
    );
  }

  const safePage = Math.min(page, pages.length - 1);

  return (
    <div>
      <div
        className="relative min-h-[500px] md:min-h-[460px]"
        onMouseEnter={() => {
          paused.current = true;
        }}
        onMouseLeave={() => {
          paused.current = false;
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={safePage}
            initial={{ opacity: 0, y: 30, scale: 0.96, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -30, scale: 0.96, filter: "blur(8px)" }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
              staggerChildren: 0.1,
            }}
            className={`absolute inset-0 grid gap-6 ${gridClassName}`}
          >
            {pages[safePage].map((p, i) => (
              <PropertyCard
                key={p.id}
                {...p}
                priority={safePage === 0 && i < 2}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setPage((p) => (p - 1 + pages.length) % pages.length)}
          aria-label="წინა"
          className="absolute -left-5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1A202C] shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-transform hover:scale-105 active:scale-95 md:-left-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setPage((p) => (p + 1) % pages.length)}
          aria-label="შემდეგი"
          className="absolute -right-5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1A202C] shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-transform hover:scale-105 active:scale-95 md:-right-10"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        {pages.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setPage(idx)}
            aria-label={`გვერდი ${idx + 1}`}
            aria-current={idx === safePage ? "true" : undefined}
            className={`h-2 rounded-full transition-all duration-300 ${
              idx === safePage ? "w-8 bg-[#1A202C]" : "w-2 bg-[#E2E8F0]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function HotOffersCarousel({
  properties,
}: HotOffersCarouselProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const mobilePages = useMemo(() => chunkArray(properties, 1), [properties]);
  const desktopPages = useMemo(() => chunkArray(properties, 2), [properties]);

  if (properties.length === 0) return null;

  return (
    <>
      <div className="md:hidden">
        <CarouselTrack
          pages={mobilePages}
          gridClassName="grid-cols-1"
          reduceMotion={reduceMotion}
        />
      </div>
      <div className="hidden md:block">
        <CarouselTrack
          pages={desktopPages}
          gridClassName="grid-cols-2"
          reduceMotion={reduceMotion}
        />
      </div>
    </>
  );
}
