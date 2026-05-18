"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full resize-none rounded-2xl border border-[#E2E8F0] bg-white p-4 text-[14px] leading-[22px] text-[#0F172A] outline-none transition-colors",
          "placeholder:text-[#94A3B8]",
          "hover:border-[#CBD5E1]",
          "focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]",
          "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
          className,
        )}
        {...props}
      />
    );
  },
);
