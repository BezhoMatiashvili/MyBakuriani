"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SkierLoader } from "@/components/shared/SkierLoader";

// Mounts its children only once it is near the viewport. A detail page's map
// sits far below the fold, and mounting it at hydration fetched mapbox-gl
// (~480 KB gzip) ahead of the content people came for, which costs LCP and
// blocking time (C40). The placeholder fills the wrapper, so nothing shifts
// when the map arrives.
export default function LazyOnVisible({
  children,
  className,
  rootMargin = "600px",
}: {
  children: ReactNode;
  className?: string;
  /** How far outside the viewport the children start loading. */
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#F1F5F9]">
          <SkierLoader variant="inline" />
        </div>
      )}
    </div>
  );
}
