"use client";
import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | null;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  panelClassName?: string;
  footerClassName?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title = null,
  children,
  footer,
  contentClassName,
  panelClassName,
  footerClassName,
}: BottomSheetProps) {
  const t = useTranslations("Shared");
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      sheetRef.current?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100) onClose();
  };
  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end" role="presentation">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#020617]/55 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={cn(
              "relative z-10 mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] w-full flex-col overflow-hidden rounded-t-[24px] bg-white text-left shadow-[0_-16px_48px_-16px_rgba(15,23,42,0.35)] sm:max-w-[720px]",
              panelClassName,
            )}
          >
            <div className="flex justify-center pb-2 pt-3">
              <motion.div
                aria-hidden="true"
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className="flex h-8 w-16 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
              >
                <div className="h-1 w-10 rounded-full bg-[#64748B]/30" />
              </motion.div>
            </div>
            <div className="flex items-center justify-between gap-3 border-b px-5 pb-3">
              {title ? (
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overscroll-contain overflow-y-auto p-5",
                !footer &&
                  "pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
                contentClassName,
              )}
            >
              {children}
            </div>
            {footer && (
              <div
                className={cn(
                  "shrink-0 border-t border-[#E2E8F0] bg-white/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm",
                  footerClassName,
                )}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}
