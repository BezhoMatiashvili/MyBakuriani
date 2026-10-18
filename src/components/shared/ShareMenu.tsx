"use client";

import { useRef, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Link, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/shared/WhatsAppButton";
import { facebookShareUrl, shareableUrl, whatsappShareUrl } from "@/lib/share";

const ITEM =
  "flex min-h-11 w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3.5 text-[14px] font-medium text-[#1E293B] outline-none transition-colors data-[highlighted]:bg-[#F1F5F9]";
const ICON = "h-[18px] w-[18px] shrink-0";

/** Lucide ships no brand icons; outlined to sit with the Link/Printer glyphs. */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-2a2 2 0 0 0-2 2v12" />
      <path d="M9 13h6" />
    </svg>
  );
}

/**
 * Rendered only inside the open popup (the portal is not kept mounted), so it
 * never runs on the server and can read `window.location` directly.
 */
function ShareMenuItems({ onPrint }: { onPrint: () => void }) {
  const t = useTranslations("ShareListing");
  const url = shareableUrl(window.location);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("error"));
    }
  };

  return (
    <>
      <Menu.Item className={ITEM} onClick={copy}>
        <Link className={ICON} />
        {t("copyLink")}
      </Menu.Item>
      <Menu.LinkItem
        className={ITEM}
        href={facebookShareUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        closeOnClick
      >
        <FacebookIcon className={ICON} />
        {t("facebook")}
      </Menu.LinkItem>
      <Menu.LinkItem
        className={ITEM}
        href={whatsappShareUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        closeOnClick
      >
        <WhatsAppIcon className={ICON} />
        {t("whatsapp")}
      </Menu.LinkItem>
      <Menu.Item className={ITEM} onClick={onPrint}>
        <Printer className={ICON} />
        {t("print")}
      </Menu.Item>
    </>
  );
}

interface ShareMenuProps {
  /** Trigger classes — each detail page keeps its own button look. */
  className?: string;
  /** Accessible name of the trigger; defaults to "Share". */
  label?: string;
  children: ReactNode;
}

/**
 * Share button + dropdown for a listing detail page: copy link, Facebook,
 * WhatsApp, print. The trigger IS the page's button element (no wrapper), so
 * absolutely-positioned triggers and `[&>div:first-child]` selectors on the
 * surrounding markup keep working.
 */
export function ShareMenu({ className, label, children }: ShareMenuProps) {
  const t = useTranslations("ShareListing");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // window.print() captures the page as it is at that moment, so it waits for
  // the popup's close to finish — otherwise the open menu ends up on paper.
  const printOnClose = useRef(false);

  return (
    <Menu.Root
      modal={false}
      onOpenChangeComplete={(open) => {
        if (open) return;
        // Base UI 1.3.0 drops focus to <body> when the menu is reopened from
        // the keyboard after an item click and then closed with Escape
        // (reproduced in isolation). Put it back on the trigger; focus the
        // user moved elsewhere, e.g. by clicking an input, is left alone.
        const active = document.activeElement;
        if (
          !active ||
          active === document.body ||
          popupRef.current?.contains(active)
        ) {
          triggerRef.current?.focus({ preventScroll: true });
        }
        if (printOnClose.current) {
          printOnClose.current = false;
          window.print();
        }
      }}
    >
      <Menu.Trigger
        ref={triggerRef}
        className={className}
        aria-label={label ?? t("label")}
      >
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="isolate z-50 outline-none print:hidden"
          align="end"
          sideOffset={8}
        >
          <Menu.Popup
            ref={popupRef}
            className="min-w-[228px] origin-(--transform-origin) rounded-2xl bg-white p-2 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] ring-1 ring-[#E2E8F0] outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            <ShareMenuItems
              onPrint={() => {
                printOnClose.current = true;
              }}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
