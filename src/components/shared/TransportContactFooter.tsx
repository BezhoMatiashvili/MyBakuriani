"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";

interface Props {
  phone: string | null | undefined;
  serviceId: string;
}

/**
 * Bottom contact bar for the transport detail page — pinned to the viewport on
 * all breakpoints. The green pill (CallButton) shows the masked number and
 * reveals/dials on click; the round icon (WhatsAppButton) opens WhatsApp.
 */
export function TransportContactFooter({ phone, serviceId }: Props) {
  const t = useTranslations("TransportDetail");
  const tCard = useTranslations("ServiceCard");
  const router = useRouter();

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E2E8F0] bg-white/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-black leading-tight text-[#1E293B] sm:text-[18px]">
            {t("contactDriverTitle")}
          </div>
          <div className="truncate text-[12px] font-medium text-[#64748B]">
            {t("contactDriverSubtitle")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <WhatsAppButton phone={phone} serviceId={serviceId} />
          <CallButton
            phone={phone}
            className="h-12 gap-2 rounded-full bg-[#22C55E] px-5 text-[14px] font-bold text-white hover:bg-[#16A34A] sm:px-6 sm:text-[15px]"
            label={tCard("call")}
            onNoPhoneClick={() => router.push("/auth/login")}
            serviceId={serviceId}
          />
        </div>
      </div>
    </div>
  );
}
