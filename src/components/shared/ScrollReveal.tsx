"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds of delay before the reveal transition starts (matches prior API). */
  delay?: number;
}

// CSS-driven reveal-on-scroll (replaces the prior framer-motion implementation
// to keep the animation off the JS main thread). Fades + rises 30px over 0.5s
// once the element scrolls into view; reveals after a 400ms fallback if
// IntersectionObserver never fires (very short pages / reduced environments).
export default function ScrollReveal({
  children,
  className,
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const fallback = window.setTimeout(() => setRevealed(true), 400);

    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-50px" },
    );
    observer.observe(el);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "none" : "translateY(30px)",
        transition: `opacity 0.5s ease-out ${delay}s, transform 0.5s ease-out ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
