"use client";

import { useState, type MouseEventHandler } from "react";
import { Phone } from "lucide-react";
import { formatPhone, maskPhone } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackContactClick } from "@/lib/contact-tracking";

interface CallButtonProps {
  phone: string | null | undefined;
  className?: string;
  label: string;
  onNoPhoneClick?: () => void;
  onClick?: MouseEventHandler<HTMLElement>;
  alwaysShowLabel?: boolean;
  propertyId?: string | null;
  serviceId?: string | null;
  layout?: "pill" | "card" | "inline";
  size?: "sm" | "default" | "lg";
}

export function CallButton({
  phone,
  className,
  label,
  onNoPhoneClick,
  onClick,
  alwaysShowLabel = false,
  propertyId,
  serviceId,
  layout = "pill",
  size = "default",
}: CallButtonProps) {
  const [revealed, setRevealed] = useState(false);
  const sizeClass = ({ sm: "h-9 px-3 text-xs", default: "h-12 px-5 text-sm", lg: "h-[55px] px-6 text-[15px]" } as const)[size];
  const layoutClass = layout === "pill" ? "rounded-full" : layout === "card" ? "rounded-xl" : "rounded-lg";
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center gap-2 bg-contact font-bold text-white transition-colors hover:bg-contact-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-contact/35 focus-visible:ring-offset-2",
    sizeClass,
    layoutClass,
    className,
  );

  if (!phone) {
    return (
      <Button variant="contact" size="default" onClick={onNoPhoneClick} disabled={!onNoPhoneClick} data-slot="call-button" data-layout={layout} className={cn("gap-2", sizeClass, layoutClass, className)}>
        <Phone className="size-4" />
        {label}
      </Button>
    );
  }

  return (
    <a
      data-slot="call-button"
      data-layout={layout}
      href={`tel:${phone.replace(/\s/g, "")}`}
      className={classes}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!alwaysShowLabel && window.matchMedia("(min-width: 768px)").matches && !revealed) {
          event.preventDefault();
          setRevealed(true);
          return;
        }
        trackContactClick({ channel: "call", propertyId, serviceId });
      }}
    >
      <Phone className="size-4" />
      {alwaysShowLabel ? <span>{label}</span> : <><span className="md:hidden">{label}</span><span className="hidden md:inline">{revealed ? formatPhone(phone) : maskPhone(phone)}</span></>}
    </a>
  );
}
