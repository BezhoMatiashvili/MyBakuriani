"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const switchVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        default: "h-6 w-11",
        lg: "h-7 w-[52px]",
      },
      tone: {
        primary: "focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:ring-offset-2 data-[checked]:bg-[#2563EB] data-[unchecked]:bg-[#E2E8F0]",
        contact: "focus-visible:ring-2 focus-visible:ring-contact/35 focus-visible:ring-offset-2 data-[checked]:bg-contact data-[unchecked]:bg-[#E2E8F0]",
        whatsapp: "focus-visible:ring-2 focus-visible:ring-whatsapp/35 focus-visible:ring-offset-2 data-[checked]:bg-whatsapp data-[unchecked]:bg-[#E2E8F0]",
        creation: "focus-visible:ring-2 focus-visible:ring-creation/35 focus-visible:ring-offset-2 data-[checked]:bg-creation data-[unchecked]:bg-[#E2E8F0]",
      },
    },
    defaultVariants: { size: "default", tone: "primary" },
  },
);

const thumbVariants = cva(
  "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform",
  {
    variants: {
      size: {
        sm: "size-4 data-[checked]:translate-x-4",
        default: "size-5 data-[checked]:translate-x-5",
        lg: "size-6 data-[checked]:translate-x-6",
      },
    },
    defaultVariants: { size: "default" },
  },
);

interface SwitchProps extends VariantProps<typeof switchVariants> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  size,
  tone,
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        switchVariants({ size, tone }),
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          thumbVariants({ size }),
          "data-[unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { switchVariants };
