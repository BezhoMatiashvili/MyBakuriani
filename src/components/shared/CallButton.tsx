"use client";
import { useState } from "react";
import { Phone } from "lucide-react";
import { formatPhone, maskPhone } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  phone: string | null | undefined;
  className: string;
  label: string;
  onNoPhoneClick?: () => void;
}

export function CallButton({ phone, className, label, onNoPhoneClick }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!phone) {
    return (
      <Button onClick={onNoPhoneClick} className={className}>
        <Phone className="h-4 w-4" />
        {label}
      </Button>
    );
  }

  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      onClick={(e) => {
        if (window.matchMedia("(min-width: 768px)").matches && !revealed) {
          e.preventDefault();
          setRevealed(true);
        }
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
