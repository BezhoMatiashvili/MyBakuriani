"use client";
import { ReactNode, useEffect } from "react";
import { AnimatePresence, motion, PanInfo } from "framer-motion";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | null;
  children: ReactNode;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title = null,
  children,
}: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100) onClose();
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="relative z-10 max-h-[90vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl"
          >
            <div className="flex justify-center pb-2 pt-3">
              <div className="h-1 w-10 rounded-full bg-[#64748B]/30" />
            </div>
            {title && (
              <div className="border-b px-5 pb-3">
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
            )}
            <div
              className="overflow-y-auto p-5"
              style={{ maxHeight: "calc(90vh - 60px)" }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
