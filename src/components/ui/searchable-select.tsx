"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
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

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  accent?: Accent;
  disabled?: boolean;
  name?: string;
}

/**
 * Single-select dropdown with a type-to-filter search input inside the popup
 * (myauto.ge-style brand picker). Mirrors StyledSelect's API and visual style
 * but is built on Base UI's Combobox so long option lists stay usable.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "აირჩიე",
  searchPlaceholder = "ძებნა...",
  accent = "blue",
  disabled,
  name,
}: SearchableSelectProps) {
  const a = ACCENT_CLASSES[accent];
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Combobox.Root<SearchableSelectOption>
      items={options as SearchableSelectOption[]}
      value={selected}
      onValueChange={(next) => onValueChange(next ? next.value : "")}
      isItemEqualToValue={(x, y) => x.value === y.value}
      disabled={disabled}
      name={name}
    >
      <Combobox.Trigger
        className={cn(
          "flex h-[48px] w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-sm font-medium text-[#0F172A] outline-none transition-colors",
          "hover:border-[#CBD5E1]",
          "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
          "data-[placeholder]:text-[#94A3B8]",
          a.focusBorder,
          a.focusRing,
        )}
      >
        <Combobox.Value placeholder={placeholder} />
        <Combobox.Icon className="ml-2 shrink-0 text-[#94A3B8] transition-transform data-[popup-open]:rotate-180 data-[popup-open]:text-[#2563EB]">
          <ChevronDown className="size-4" strokeWidth={2} />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={6}
          align="start"
          className="isolate z-50 w-[var(--anchor-width)] outline-none"
        >
          <Combobox.Popup
            className={cn(
              "flex max-h-[min(var(--available-height),20rem)] w-full origin-(--transform-origin) flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_8px_24px_rgba(15,23,42,0.08)]",
              "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
              "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
              "duration-100",
            )}
          >
            <div className="relative shrink-0 border-b border-[#E2E8F0] p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
              <Combobox.Input
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-lg bg-[#F8FAFC] pr-3 pl-9 text-sm font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:bg-white"
              />
            </div>

            <Combobox.Empty className="px-3 py-6 text-center text-sm font-medium text-[#94A3B8]">
              ვერ მოიძებნა
            </Combobox.Empty>

            <Combobox.List className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-2 outline-none">
              {(item: SearchableSelectOption, index: number) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  index={index}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-[#334155] outline-none transition-colors",
                    "data-[highlighted]:bg-[#F1F5F9]",
                    a.selectedBg,
                    a.selectedText,
                    "data-[selected]:font-semibold",
                  )}
                >
                  {item.label}
                  <Combobox.ItemIndicator
                    className={cn("ml-3 shrink-0", a.checkText)}
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export type { SearchableSelectOption, Accent };
