"use client";
import { ReactNode, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}
const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative z-10 w-full overflow-hidden bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] rounded-t-2xl sm:rounded-2xl",
              sizeClasses[size],
            )}
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-8 py-5">
              <h2 className="text-[17px] font-bold text-[#0F172A]">{title}</h2>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-8">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
