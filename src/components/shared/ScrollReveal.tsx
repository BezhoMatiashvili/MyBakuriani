import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds of delay before the reveal animation starts (matches prior API). */
  delay?: number;
}

// Pure-CSS entrance reveal (keyframes in globals.css). The previous
// implementation held everything at opacity:0 until React hydrated and a 400ms
// fallback timer fired — its IntersectionObserver never actually gated
// anything, because the fallback revealed every element unconditionally. That
// hydration dependency directly inflated LCP: above-the-fold cards and images
// stayed invisible until the JS bundle executed. A CSS animation starts at
// first paint with the exact same motion (0.5s fade + 30px rise, per-item
// delay, hidden during the delay via `backwards` fill) and needs no JS at all.
export default function ScrollReveal({
  children,
  className,
  delay = 0,
}: ScrollRevealProps) {
  return (
    <div
      className={cn(className)}
      style={{ animation: `mb-reveal 0.5s ease-out ${delay}s backwards` }}
    >
      {children}
    </div>
  );
}
