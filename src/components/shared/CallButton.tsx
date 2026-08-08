"use client";

import { useCallback, useState, type MouseEventHandler } from "react";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { formatPhone, maskPhone } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackContactClick } from "@/lib/contact-tracking";
import { normalizeE164Phone } from "@/lib/security";
import { getTurnstileToken } from "@/lib/turnstile-client";

interface CallButtonProps {
  phone: string | null | undefined;
  className?: string;
  label: string;
  onClick?: MouseEventHandler<HTMLElement>;
  alwaysShowLabel?: boolean;
  propertyId?: string | null;
  serviceId?: string | null;
  layout?: "pill" | "card" | "inline";
  size?: "sm" | "default" | "lg";
  iconOnly?: boolean;
}

export function CallButton({
  phone,
  className,
  label,
  onClick,
  alwaysShowLabel = false,
  propertyId,
  serviceId,
  layout = "pill",
  size = "default",
  iconOnly = false,
}: CallButtonProps) {
  const t = useTranslations("ContactReveal");
  const [resolvedPhone, setResolvedPhone] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [revealFailed, setRevealFailed] = useState(false);
  const sizeClass = ({ sm: "h-9 px-3 text-xs", default: "h-12 px-5 text-sm", lg: "h-[55px] px-6 text-[15px]" } as const)[size];
  const layoutClass = layout === "pill" ? "rounded-full" : layout === "card" ? "rounded-xl" : "rounded-lg";
  const classes = cn(
    "inline-flex min-w-0 max-w-full shrink items-center justify-center gap-2 bg-contact font-bold text-white transition-colors hover:bg-contact-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-contact/35 focus-visible:ring-offset-2",
    sizeClass,
    alwaysShowLabel &&
      "h-auto min-h-12 whitespace-normal px-3 py-2 text-center leading-5",
    iconOnly && "size-11 min-h-11 shrink-0 p-0 whitespace-nowrap",
    layoutClass,
    className,
  );

  const normalizedPhone = normalizeE164Phone(resolvedPhone ?? phone);

  const revealContact = useCallback(async () => {
    const kind = propertyId ? "property" : serviceId ? "service" : null;
    const id = propertyId ?? serviceId;
    if (!kind || !id || isResolving) return;
    setIsResolving(true);
    setRevealFailed(false);
    try {
      const storageKey = "mybakuriani-contact-device";
      let deviceId = window.localStorage.getItem(storageKey);
      if (!deviceId) {
        deviceId = crypto.randomUUID().replace(/-/g, "");
        window.localStorage.setItem(storageKey, deviceId);
      }
      const turnstileToken = await getTurnstileToken();
      const response = await fetch(`/api/listings/${kind}/${id}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, turnstile_token: turnstileToken }),
      });
      if (!response.ok) {
        setRevealFailed(true);
        return;
      }
      const result = (await response.json()) as { phone?: string | null };
      const resolved = normalizeE164Phone(result.phone);
      if (!resolved) {
        setRevealFailed(true);
        return;
      }
      setResolvedPhone(resolved);
    } catch {
      setRevealFailed(true);
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, propertyId, serviceId]);

  if (!normalizedPhone) {
    return (
      <Button
        variant="contact"
        size="default"
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) void revealContact();
        }}
        disabled={(!propertyId && !serviceId) || isResolving}
        data-slot="call-button"
        data-layout={layout}
        aria-live="polite"
        aria-label={
          iconOnly
            ? isResolving
              ? `${label}…`
              : revealFailed
                ? t("failed")
                : label
            : undefined
        }
        className={cn(
          "h-auto min-h-12 min-w-0 max-w-full shrink gap-2 whitespace-normal px-3 py-2 text-center leading-5",
          iconOnly && "size-11 min-h-11 shrink-0 p-0 whitespace-nowrap",
          layoutClass,
          className,
        )}
      >
        <Phone className="size-4 shrink-0" />
        <span className={cn("min-w-0 break-words", iconOnly && "sr-only")}>
          {isResolving ? "…" : revealFailed ? t("failed") : label}
        </span>
      </Button>
    );
  }

  return (
    <a
      data-slot="call-button"
      data-layout={layout}
      href={`tel:${normalizedPhone}`}
      className={classes}
      aria-label={iconOnly ? label : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        trackContactClick({ channel: "call", propertyId, serviceId });
      }}
    >
      <Phone className="size-4 shrink-0" />
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : resolvedPhone ? (
        <span className="min-w-0 break-words">{formatPhone(normalizedPhone)}</span>
      ) : alwaysShowLabel ? (
        <span className="min-w-0 break-words">{label}</span>
      ) : (
        <>
          <span className="min-w-0 break-words md:hidden">{label}</span>
          <span className="hidden md:inline">{maskPhone(normalizedPhone)}</span>
        </>
      )}
    </a>
  );
}
