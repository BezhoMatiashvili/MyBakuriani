"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Keyboard,
  ListChecks,
  MousePointerClick,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import type { JevAction, JevStep } from "@/lib/support/plan";
import { isBehindModal } from "@/lib/support/scan";
import { JevAvatar } from "./JevAvatar";

const ICONS: Record<JevAction, LucideIcon> = {
  click: MousePointerClick,
  type: Keyboard,
  select: ListChecks,
  upload: Upload,
  look: Eye,
};

const PAD = 6;
const GAP = 14;
const EDGE = 16;
const BUBBLE_WIDTH = 320;
const GLOW_SOFT =
  "0 0 0 4px rgba(37,99,235,0.18), 0 0 18px 4px rgba(37,99,235,0.35)";
const GLOW_STRONG =
  "0 0 0 10px rgba(37,99,235,0.06), 0 0 34px 12px rgba(37,99,235,0.5)";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

type Box = { left: number; top: number; width: number; height: number };

type Props = {
  target: HTMLElement;
  step: JevStep;
  index: number;
  total: number;
  reduceMotion: boolean;
  onNext: () => void;
  onBack: () => void;
  onStop: () => void;
  /** The element left the page or stayed hidden: plan again. */
  onLost: () => void;
};

/**
 * Jev's highlight: a glowing ring around the element to use, a bouncing
 * chip that shows what to do with it, and a bubble with the instruction.
 * Everything but the bubble ignores the pointer, so the real element still
 * takes the click; the page is never dimmed, because select menus and
 * pickers open in portals outside the ring.
 */
export function JevSpotlight({
  target,
  step,
  index,
  total,
  reduceMotion,
  onNext,
  onBack,
  onStop,
  onLost,
}: Props) {
  const t = useTranslations("Support");
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [bubbleHeight, setBubbleHeight] = useState(150);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const onLostRef = useRef(onLost);

  useEffect(() => {
    onLostRef.current = onLost;
  }, [onLost]);

  useEffect(() => {
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [target, reduceMotion]);

  // Dashboards scroll inside <main>, not the window, and forms reflow as the
  // user types, so the ring follows the element frame by frame.
  useEffect(() => {
    let frame = 0;
    let last = "";
    let hiddenSince = 0;
    let modalCheckedAt = 0;
    let behindModal = false;
    const tick = () => {
      if (!target.isConnected) {
        onLostRef.current();
        return;
      }
      const rect = target.getBoundingClientRect();
      // A modal that an earlier step opened can cover the element; the user
      // cannot reach it, so re-plan inside the modal (checked a few times a
      // second, not every frame).
      const now = performance.now();
      if (now - modalCheckedAt > 300) {
        modalCheckedAt = now;
        behindModal = isBehindModal(target);
      }
      if ((rect.width === 0 && rect.height === 0) || behindModal) {
        hiddenSince = hiddenSince || now;
        if (now - hiddenSince > 1500) {
          onLostRef.current();
          return;
        }
      } else {
        hiddenSince = 0;
      }
      const key = [
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      ]
        .map(Math.round)
        .join(",");
      if (key !== last) {
        last = key;
        setBox({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleHeight(bubbleRef.current.offsetHeight);
  }, [step, viewport.width]);

  if (!box || typeof document === "undefined") return null;

  const Icon = ICONS[step.action];
  const ring = {
    left: box.left - PAD,
    top: box.top - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };
  const chip = {
    left: clamp(ring.left + ring.width - 20, 4, viewport.width - 44),
    top: clamp(ring.top + ring.height - 20, 4, viewport.height - 44),
  };

  // Phones: the bubble docks to the bottom, or to the top when the element
  // itself sits low (a bottom-nav item). Wider screens: next to the element.
  const phone = viewport.width < 640;
  let bubbleStyle: React.CSSProperties;
  let arrow: { side: "top" | "bottom"; left: number } | null = null;
  if (phone) {
    const dockTop =
      box.top + box.height > viewport.height - 260 && box.top > 200;
    bubbleStyle = dockTop
      ? { top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }
      : {
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          left: 12,
          right: 12,
        };
  } else {
    const width = Math.min(BUBBLE_WIDTH, viewport.width - EDGE * 2);
    const left = clamp(
      box.left + box.width / 2 - width / 2,
      EDGE,
      viewport.width - width - EDGE,
    );
    const below = ring.top + ring.height + GAP;
    const above = ring.top - GAP - bubbleHeight;
    let top: number;
    if (below + bubbleHeight <= viewport.height - EDGE) {
      top = below;
      arrow = { side: "top", left: 0 };
    } else if (above >= EDGE) {
      top = above;
      arrow = { side: "bottom", left: 0 };
    } else {
      top = viewport.height - bubbleHeight - EDGE;
    }
    if (arrow) {
      arrow.left = clamp(box.left + box.width / 2 - left - 7, 18, width - 32);
    }
    // Kept on screen when the user scrolls the element away; the arrow then
    // points toward it.
    top = clamp(
      top,
      EDGE,
      Math.max(EDGE, viewport.height - bubbleHeight - EDGE),
    );
    bubbleStyle = { top, left, width };
  }

  return createPortal(
    <div data-jev-ignore>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed z-[90] rounded-[14px] border-2 border-[#2563EB]"
        style={ring}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.06 }}
        animate={
          reduceMotion
            ? { opacity: 1, scale: 1, boxShadow: GLOW_SOFT }
            : {
                opacity: 1,
                scale: 1,
                boxShadow: [GLOW_SOFT, GLOW_STRONG, GLOW_SOFT],
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                opacity: { duration: 0.25 },
                scale: { duration: 0.3 },
                boxShadow: {
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }
        }
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed z-[91] flex size-10 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg ring-4 ring-white"
        style={chip}
        animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        {!reduceMotion && (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#2563EB]/40" />
        )}
        <Icon className="size-4.5" strokeWidth={2.25} />
      </motion.div>
      <motion.div
        key={`${index}-${step.target}`}
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-label={t("name")}
        data-testid="jev-bubble"
        className="fixed z-[92] rounded-2xl border border-[#DBEAFE] bg-white p-3.5 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)]"
        style={bubbleStyle}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {arrow && (
          <span
            aria-hidden
            className={`absolute size-3.5 rotate-45 border-[#DBEAFE] bg-white ${
              arrow.side === "top"
                ? "-top-[8px] border-l border-t"
                : "-bottom-[8px] border-b border-r"
            }`}
            style={{ left: arrow.left }}
          />
        )}
        <div className="flex items-center gap-2">
          <JevAvatar size="sm" />
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {t("name")}
          </span>
          <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
            {t("stepOf", { current: index + 1, total })}
          </span>
          <button
            type="button"
            onClick={onStop}
            aria-label={t("stop")}
            className="-mr-2 ml-auto flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="size-4.5" aria-hidden />
          </button>
        </div>
        <p
          aria-live="polite"
          className="mt-1 flex items-start gap-2 text-[14px] font-semibold leading-snug text-[#0F172A]"
        >
          <Icon className="mt-0.5 size-4 shrink-0 text-[#2563EB]" aria-hidden />
          <span data-testid="jev-say">{step.say}</span>
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-[13px] font-bold text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:invisible"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t("back")}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
          >
            {t("next")}
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
