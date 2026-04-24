"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "orange";

const ACCENT_CLASSES: Record<
  Accent,
  {
    focusBorder: string;
    focusRing: string;
    selectedBg: string;
    selectedText: string;
    checkText: string;
  }
> = {
  blue: {
    focusBorder: "data-[popup-open]:border-[#2563EB]",
    focusRing: "data-[popup-open]:ring-2 data-[popup-open]:ring-[#DBEAFE]",
    selectedBg: "data-[selected]:bg-[#EFF6FF]",
    selectedText: "data-[selected]:text-[#2563EB]",
    checkText: "text-[#2563EB]",
  },
  green: {
    focusBorder: "data-[popup-open]:border-[#16A34A]",
    focusRing: "data-[popup-open]:ring-2 data-[popup-open]:ring-[#DCFCE7]",
    selectedBg: "data-[selected]:bg-[#F0FDF4]",
    selectedText: "data-[selected]:text-[#16A34A]",
    checkText: "text-[#16A34A]",
  },
  orange: {
    focusBorder: "data-[popup-open]:border-[#F97316]",
    focusRing: "data-[popup-open]:ring-2 data-[popup-open]:ring-[#FFEDD5]",
    selectedBg: "data-[selected]:bg-[#FFF7ED]",
    selectedText: "data-[selected]:text-[#F97316]",
    checkText: "text-[#F97316]",
  },
};

interface StyledSelectOption<T extends string> {
  value: T;
  label: string;
}

interface StyledSelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly StyledSelectOption<T>[];
  placeholder?: string;
  accent?: Accent;
  disabled?: boolean;
  name?: string;
}

export function StyledSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "აირჩიე",
  accent = "blue",
  disabled,
  name,
}: StyledSelectProps<T>) {
  const a = ACCENT_CLASSES[accent];

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
      name={name}
      items={options}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-[48px] w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-sm font-medium text-[#0F172A] outline-none transition-colors",
          "hover:border-[#CBD5E1]",
          "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
          a.focusBorder,
          a.focusRing,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ml-2 shrink-0 text-[#94A3B8] transition-transform data-[popup-open]:rotate-180 data-[popup-open]:text-[#2563EB]">
          <ChevronDown className="size-4" strokeWidth={2} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          align="start"
          alignItemWithTrigger={false}
          className="isolate z-50 w-[var(--anchor-width)] outline-none"
        >
          <SelectPrimitive.Popup
            className={cn(
              "origin-(--transform-origin) overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_8px_24px_rgba(15,23,42,0.08)]",
              "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
              "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
              "duration-100",
            )}
          >
            <SelectPrimitive.List className="flex flex-col gap-0.5 outline-none">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-[#334155] outline-none transition-colors",
                    "data-[highlighted]:bg-[#F1F5F9]",
                    a.selectedBg,
                    a.selectedText,
                    "data-[selected]:font-semibold",
                  )}
                >
                  <SelectPrimitive.ItemText>
                    {opt.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator
                    className={cn("ml-3 shrink-0", a.checkText)}
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export type { StyledSelectOption, Accent };
