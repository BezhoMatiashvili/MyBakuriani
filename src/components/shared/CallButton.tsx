"use client";
import { useState } from "react";
import { Phone } from "lucide-react";
import { formatPhone, maskPhone } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackContactClick } from "@/lib/contact-tracking";

interface Props {
  phone: string | null | undefined;
  className: string;
  label: string;
  onNoPhoneClick?: () => void;
  alwaysShowLabel?: boolean;
  propertyId?: string | null;
  serviceId?: string | null;
}

export function CallButton({
  phone,
  className,
  label,
  onNoPhoneClick,
  alwaysShowLabel = false,
  propertyId,
  serviceId,
}: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!phone) {
    return (
      <Button onClick={onNoPhoneClick} className={className}>
        <Phone className="h-4 w-4" />
        {label}
      </Button>
    );
  }

  const fireTracking = () =>
    trackContactClick({
      channel: "call",
      propertyId,
      serviceId,
    });

  if (alwaysShowLabel) {
    return (
      <a
        href={`tel:${phone.replace(/\s/g, "")}`}
        onClick={fireTracking}
        className={cn("inline-flex items-center justify-center", className)}
      >
        <Phone className="h-4 w-4" />
        {label}
      </a>
    );
  }

  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      onClick={(e) => {
        if (window.matchMedia("(min-width: 768px)").matches && !revealed) {
          e.preventDefault();
          setRevealed(true);
          return;
        }
        fireTracking();
      }}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <Phone className="h-4 w-4" />
      <span className="md:hidden">{label}</span>
      <span className="hidden md:inline">
        {revealed ? formatPhone(phone) : maskPhone(phone)}
      </span>
    </a>
  );
}
