"use client";

import { useTranslations } from "next-intl";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";

interface Props {
  phone: string | null | undefined;
  hasWhatsapp: boolean;
  whatsapp?: string | null;
  serviceId: string;
}

/**
 * Bottom contact bar for the transport detail page — pinned to the viewport on
 * all breakpoints. The green pill (CallButton) shows the masked number and
 * reveals/dials on click; the round icon (WhatsAppButton) opens WhatsApp.
 */
export function TransportContactFooter({ phone, hasWhatsapp, whatsapp, serviceId }: Props) {
  const t = useTranslations("TransportDetail");
  const tCard = useTranslations("ServiceCard");

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 min-h-[var(--mobile-fixed-action-height)] border-t border-[#E2E8F0] bg-white/95 px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] backdrop-blur-sm lg:py-3 lg:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-black leading-tight text-[#1E293B] sm:text-[18px]">
            {t("contactDriverTitle")}
          </div>
          <div className="text-[11px] font-medium leading-tight text-[#64748B] sm:text-[12px]">
            {t("contactDriverSubtitle")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <WhatsAppButton hasWhatsApp={hasWhatsapp} whatsapp={whatsapp} serviceId={serviceId} />
          <CallButton
            phone={phone}
            className="sm:px-6 sm:text-[15px]"
            label={tCard("call")}
            serviceId={serviceId}
          />
        </div>
      </div>
    </div>
  );
}
